<?php
// fix: INI-инъекция, path traversal, гонка записи, утечка путей | 2026-10-05 | Моро
// БЫЛО (исходный файл целиком, для отката):
// <?php
// header('Content-Type: application/json');
// 
// if ($_SERVER['REQUEST_METHOD'] === 'POST') {
//     $data = json_decode(file_get_contents('php://input'), true);
//     
//     if (!$data || !isset($data['section']) || !isset($data['params'])) {
//         echo json_encode(['success' => false, 'message' => 'Invalid data']);
//         exit;
//     }
//     
//     $iniContent = "";
//     foreach ($data['params'] as $section => $params) {
//         $iniContent .= "[$section]\n";
//         foreach ($params as $key => $value) {
//             $iniContent .= "$key=$value\n";
//         }
//         $iniContent .= "\n";
//     }
//     
//     $result = file_put_contents('TS.ini', $iniContent);
//     
//     echo json_encode([
//         'success' => (bool)$result,
//         'message' => $result ? 'Config saved' : 'Failed to save config'
//     ]);
// } else {
//     echo json_encode(['success' => false, 'message' => 'Invalid request method']);
// }
// Закрывающий тег PHP в исходнике опущен: последовательность из вопросительного знака
// и угловой скобки нельзя писать в строковом комментарии с двумя слешами, PHP воспринимает
// её как выход из режима PHP и печатает весь код после как обычный текст.

// Уязвимости исходной версии:
// 1) Имя секции, ключ и значение подставлялись в INI без проверок. Значение вида "999\n[Взлом]\nL=1"
//    дописывало в TS.ini произвольную секцию (INI-инъекция).
// 2) Путь 'TS.ini' зависел от текущей директории (CWD), а не от расположения скрипта.
// 3) file_put_contents() без LOCK_EX — параллельные запросы перетирали конфиг.
// 4) На диск писалась скобка try/catch, ошибки PHP/warning утекали в JSON-ответ.
// 5) Нет лимита на размер тела запроса.

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');

ini_set('display_errors', '0');
ini_set('log_errors', '1');

/** Максимальный размер тела запроса: 256 КБ */
const MAX_BODY_SIZE = 262144;

/** Максимальный размер всего конфига: 512 КБ */
const MAX_INI_SIZE = 524288;

/** Максимальная длина имени секции */
const MAX_SECTION_LEN = 100;

/** Максимальная длина ключа */
const MAX_KEY_LEN = 100;

/** Максимальная длина значения */
const MAX_VALUE_LEN = 2000;

/** Максимальное число секций в конфиге */
const MAX_SECTIONS = 200;

/**
 * Отправляет JSON-ответ и завершает скрипт.
 * Клиенту не сообщаются пути, тексты ошибок PHP и внутренние детали.
 */
function respond(bool $success, string $message, int $code = 200): void
{
    // fix: на этом сервере nginx превращает ЛЮБОЙ не-2xx ответ на POST в 405
    //       с HTML-страницей вместо JSON. Из-за этого response.json() в браузере
    //       падал и пользователь видел только «ошибку соединения» вместо текста.
    //       Поэтому ожидаемые ошибки отдаются кодом 200 с success:false,
    //       как уже сделано в save_scheme.php. Код 405 для неверного метода
    //       (GET) сохраняется — там ветка срабатывает только для не-POST. | 2026-10-05 | Моро
    // БЫЛО:
    // function respond(bool $success, string $message, int $code = 200): void
    // {
    //     http_response_code($code);
    //     echo json_encode(
    //         ['success' => $success, 'message' => $message],
    //         JSON_UNESCAPED_UNICODE
    //     );
    //     exit;
    // }
    if (!$success && $code !== 200 && ($_SERVER['REQUEST_METHOD'] ?? '') === 'POST') {
        $code = 200;
    }

    http_response_code($code);
    echo json_encode(
        ['success' => $success, 'message' => $message],
        JSON_UNESCAPED_UNICODE
    );
    exit;
}

/**
 * Проверяет, что строка безопасна для записи в INI-файл.
 * Запрещает переводы строк и спецсимволы разметки INI ([ ] ; = внутри имени).
 * Разрешает кириллицу, латиницу, цифры, пробел, дефис, подчёркивание и точку.
 */
function isSafeIniName(string $name, int $maxLen): bool
{
    if ($name === '' || mb_strlen($name, 'UTF-8') > $maxLen) {
        return false;
    }

    return (bool)preg_match('/^[\p{L}\p{N} _.\-]+$/u', $name);
}

/**
 * Проверяет значение параметра: это строка без переводов строк.
 * INI-инъекция невозможна, т.к. символы \r и \n запрещены.
 *
 * fix: дополнительно запрещены [ ] " ; — иначе значение вида "99[Секция]L=1"
 * искажалось бы при последующем разборе TS.ini через parse_ini_string | 2026-10-05 | Моро
 * БЫЛО (проверялись только переводы строк):
 * // Любой перевод строки в значении создал бы новую секцию или параметр.
 * return strpbrk($value, "\r\n") === false;
 */
function isSafeIniValue($value, int $maxLen): bool
{
    if (is_array($value) || is_object($value) || is_bool($value) || is_null($value)) {
        return false;
    }

    $value = (string)$value;

    if (mb_strlen($value, 'UTF-8') > $maxLen) {
        return false;
    }

    // Любой перевод строки в значении создал бы новую секцию или параметр.
    if (strpbrk($value, "\r\n") !== false) {
        return false;
    }

    // Скобки, кавычки и точка с запятой имеют специальный смысл в INI:
    // [ ] — границы секции, " — обрамление значения, ; — начало комментария.
    return strpbrk($value, '[]";') === false;
}

/**
 * Разбирает TS.ini в массив секций. Неразбираемые строки пропускаются,
 * warning не выдаётся.
 *
 * fix: одновременно с update_ts_config.php, секция вида "[Вагон] 1768, T: 276, H: 286"
 * обрабатывается корректно — имя берётся по закрывающей скобке | 2026-10-05 | Моро
 * БЫЛО (парсер не выделялся, секция целиком заменялась на единственную из запроса):
 * $sections = explode('[', $iniContent);
 * foreach ($sections as $section) {
 *     if (empty(trim($section))) continue;
 *     $sectionEnd = strpos($section, ']');
 *     $sectionName = trim(substr($section, 0, $sectionEnd));
 *     $sectionContent = substr($section, $sectionEnd + 1);
 *     $currentConfig[$sectionName] = [];
 *     foreach (explode("\n", $sectionContent) as $line) {
 *         if (empty(trim($line)) || strpos(trim($line), ';') === 0) continue;
 *         $eqPos = strpos($line, '=');
 *         if ($eqPos === false) continue;
 *         $key = trim(substr($line, 0, $eqPos));
 *         $value = trim(substr($line, $eqPos + 1));
 *         if (!empty($key)) {
 *             $currentConfig[$sectionName][$key] = $value;
 *         }
 *     }
 * }
 */
function parseIniValues(string $iniContent): array
{
    $config = [];
    $currentSection = null;

    $normalized = str_replace(array("\r\n", "\r"), "\n", $iniContent);

    foreach (explode("\n", $normalized) as $line) {
        $trimmed = trim($line);

        if ($trimmed === '' || strpos($trimmed, ';') === 0 || strpos($trimmed, '#') === 0) {
            continue;
        }

        if (strpos($trimmed, '[') === 0) {
            $sectionEnd = strpos($trimmed, ']');

            if ($sectionEnd === false) {
                $currentSection = null;
                continue;
            }

            $currentSection = trim(substr($trimmed, 1, $sectionEnd - 1));

            if ($currentSection === '') {
                $currentSection = null;
                continue;
            }

            if (!isset($config[$currentSection])) {
                $config[$currentSection] = [];
            }

            continue;
        }

        if ($currentSection === null) {
            continue;
        }

        $eqPos = strpos($line, '=');

        if ($eqPos === false) {
            continue;
        }

        $key = trim(substr($line, 0, $eqPos));
        $value = trim(substr($line, $eqPos + 1));

        if ($key === '') {
            continue;
        }

        $config[$currentSection][$key] = $value;
    }

    return $config;
}

/**
 * Формирует текст INI-файла из массива секций.
 * Порядок секций и ключей сохраняется порядком массива.
 */
function buildIni(array $config): string
{
    $out = '';

    foreach ($config as $sectionName => $params) {
        $out .= '[' . $sectionName . ']' . "\n";

        foreach ($params as $key => $value) {
            $out .= $key . '=' . $value . "\n";
        }

        $out .= "\n";
    }

    return $out;
}

/**
 * Записывает содержимое в TS.ini атомарно, с резервной копией.
 * Сначала пишем во временный файл рядом, проверяем результат, и только потом
 * подменяем целевой файл. При сбое rename() возвращаем конфиг из резервной копии.
 */
function writeIniSafely(string $target, string $content): bool
{
    $dir = dirname($target);
    $tmp = $dir . DIRECTORY_SEPARATOR . '.TS.ini.' . getmypid() . '.tmp';
    $bak = $target . '.bak';

    $written = @file_put_contents($tmp, $content, LOCK_EX);
    if ($written === false || $written !== strlen($content)) {
        @unlink($tmp);
        error_log('save_ts_config: не удалось записать временный файл ' . $tmp);
        return false;
    }

    // Резервная копия текущего конфига — только если он уже существует.
    if (is_file($target)) {
        if (!@copy($target, $bak)) {
            @unlink($tmp);
            error_log('save_ts_config: не удалось создать резервную копию ' . $bak);
            return false;
        }
    }

    // rename() в PHP на Windows не перезаписывает существующий файл,
    // поэтому целевой файл удаляется предварительно. На короткое время
    // конфиг отсутствует, но бэкап уже создан и используется при откате.
    if (is_file($target) && !@unlink($target)) {
        @unlink($tmp);
        error_log('save_ts_config: не удалось удалить прежний TS.ini');
        return false;
    }

    if (!@rename($tmp, $target)) {
        @unlink($tmp);
        // Откат: возвращаем прежнее содержимое из резервной копии.
        if (is_file($bak)) {
            @copy($bak, $target);
        }
        error_log('save_ts_config: не удалось переименовать временный файл в TS.ini');
        return false;
    }

    return true;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    respond(false, 'Invalid request method', 405);
}

$rawBody = file_get_contents('php://input');

if ($rawBody === false) {
    error_log('save_ts_config: не удалось прочитать тело запроса');
    respond(false, 'Failed to read request body', 400);
}

if (strlen($rawBody) > MAX_BODY_SIZE) {
    respond(false, 'Request body too large', 413);
}

$data = json_decode($rawBody, true);

if (json_last_error() !== JSON_ERROR_NONE || !is_array($data)) {
    respond(false, 'Invalid JSON data', 400);
}

// Ожидается один объект вида {"section": "...", "params": {...}}.
// Раньше section игнорировался, а записывались все ключи верхнего уровня.
if (!isset($data['section']) || !isset($data['params'])) {
    respond(false, 'Invalid data', 400);
}

$section = (string)$data['section'];
$params = $data['params'];

if (!isSafeIniName($section, MAX_SECTION_LEN)) {
    respond(false, 'Invalid section name', 400);
}

if (!is_array($params) || $params === []) {
    respond(false, 'Invalid params', 400);
}

if (count($params) > MAX_SECTIONS) {
    respond(false, 'Too many params', 400);
}

$cleanParams = [];

foreach ($params as $key => $value) {
    $key = (string)$key;

    if (!isSafeIniName($key, MAX_KEY_LEN)) {
        respond(false, 'Invalid param name', 400);
    }

    if (!isSafeIniValue($value, MAX_VALUE_LEN)) {
        respond(false, 'Invalid param value', 400);
    }

    $cleanParams[$key] = (string)$value;
}

// fix: файл не затирался целиком — секция обновлялась в существующем TS.ini | 2026-10-05 | Моро
// БЫЛО (файл целиком заменялся на одну секцию, остальные секции контейнеров
// [Контейнер40], [Контейнер24], [Контейнер20], [Вагон], [Еврофура] безвозвратно терялись):
// $iniContent = '';
// $paramCount = 0;
// foreach ($params as $key => $value) {
//     $key = (string)$key;
//     if (!isSafeIniName($key, MAX_KEY_LEN)) {
//         respond(false, 'Invalid param name', 400);
//     }
//     if (!isSafeIniValue($value, MAX_VALUE_LEN)) {
//         respond(false, 'Invalid param value', 400);
//     }
//     $iniContent .= $key . '=' . (string)$value . "\n";
//     $paramCount++;
// }
// if ($paramCount === 0) {
//     respond(false, 'No params to save', 400);
// }
// $iniContent = '[' . $section . ']' . "\n" . $iniContent;
$target = __DIR__ . DIRECTORY_SEPARATOR . 'TS.ini';
$currentConfig = [];

if (is_file($target)) {
    $existingContent = @file_get_contents($target);

    if ($existingContent === false) {
        error_log('save_ts_config: не удалось прочитать ' . $target);
        respond(false, 'Failed to read config', 500);
    }

    if (strlen($existingContent) > MAX_INI_SIZE) {
        error_log('save_ts_config: конфиг больше допустимого размера');
        respond(false, 'Config too large', 500);
    }

    $currentConfig = parseIniValues($existingContent);
}

// Ключи секции обновляются, остальные ключи этой секции и все прочие секции сохраняются.
$currentConfig[$section] = array_merge(
    isset($currentConfig[$section]) ? $currentConfig[$section] : [],
    $cleanParams
);

if (count($currentConfig) > MAX_SECTIONS) {
    respond(false, 'Too many sections', 400);
}

$iniContent = buildIni($currentConfig);

if (strlen($iniContent) > MAX_INI_SIZE) {
    respond(false, 'Config too large', 400);
}

// fix: путь строится от __DIR__, запись атомарная с LOCK_EX и бэкапом | 2026-10-05 | Моро
// БЫЛО:
// $result = file_put_contents('TS.ini', $iniContent);
// 
// echo json_encode([
//     'success' => (bool)$result,
//     'message' => $result ? 'Config saved' : 'Failed to save config'
// ]);
// Путь $target уже задан выше при чтении существующего конфига.
if (!writeIniSafely($target, $iniContent)) {
    respond(false, 'Failed to save config', 500);
}

respond(true, 'Config saved');