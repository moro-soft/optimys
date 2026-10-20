<?php
// fix: INI-инъекция, path traversal, гонка записи, потеря целостности TS.ini | 2026-10-05 | Моро
// БЫЛО (исходный файл целиком, для отката):
// <?php
// header('Content-Type: application/json');
// 
// if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
//     echo json_encode(['success' => false, 'message' => 'Invalid request method']);
//     exit;
// }
// 
// $data = json_decode(file_get_contents('php://input'), true);
// if (!$data) {
//     echo json_encode(['success' => false, 'message' => 'Invalid JSON data']);
//     exit;
// }
// 
// // Читаем существующий конфиг
// $currentConfig = [];
// if (file_exists('TS.ini')) {
//     $iniContent = file_get_contents('TS.ini');
//     $sections = explode('[', $iniContent);
//     
//     foreach ($sections as $section) {
//         if (empty(trim($section))) continue;
//         
//         $sectionEnd = strpos($section, ']');
//         $sectionName = trim(substr($section, 0, $sectionEnd));
//         $sectionContent = substr($section, $sectionEnd + 1);
//         
//         $currentConfig[$sectionName] = [];
//         
//         foreach (explode("\n", $sectionContent) as $line) {
//             if (empty(trim($line)) || strpos(trim($line), ';') === 0) continue;
//             
//             $eqPos = strpos($line, '=');
//             if ($eqPos === false) continue;
//             
//             $key = trim(substr($line, 0, $eqPos));
//             $value = trim(substr($line, $eqPos + 1));
//             
//             if (!empty($key)) {
//                 $currentConfig[$sectionName][$key] = $value;
//             }
//         }
//     }
// }
// 
// // Объединяем с новыми данными
// foreach ($data as $section => $params) {
//     $currentConfig[$section] = $params;
// }
// 
// // Формируем новый INI-файл
// $newIniContent = '';
// foreach ($currentConfig as $section => $params) {
//     $newIniContent .= "[$section]\n";
//     foreach ($params as $key => $value) {
//         $newIniContent .= "$key=$value\n";
//     }
//     $newIniContent .= "\n";
// }
// 
// // Сохраняем
// $result = file_put_contents('TS.ini', trim($newIniContent));
// 
// echo json_encode([
//     'success' => $result !== false,
//     'message' => $result !== false ? 'Config updated' : 'Failed to update config'
// ]);
// Закрывающий тег PHP в исходнике опущен: последовательность из вопросительного знака
// и угловой скобки нельзя писать в строковом комментарии с двумя слешами, PHP воспринимает
// её как выход из режима PHP и печатает весь код после как обычный текст.

// Уязвимости исходной версии:
// 1) Имена секций, ключи и значения из запроса писались в INI без проверок.
//    Значение "999\n[Взлом]\nL=1" добавляло в TS.ini произвольную секцию.
// 2) При разборе strpos($section, ']') не проверялся на false: битый файл давал warning
//    в начале ответа, из-за чего JSON ломался.
// 3) $currentConfig[$section] = $params ЗАМЕНИЯ секцию целиком, даже если $params не массив.
// 4) Путь 'TS.ini' зависел от CWD, а не от __DIR__.
// 5) file_put_contents() без LOCK_EX, при сбое — усечённый конфиг.
// 6) Комментарии и исходное форматирование TS.ini не сохранялись.

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
 * fix: strpos() проверялся на false, иначе битый конфиг ломал JSON warning'ом | 2026-10-05 | Моро
 * БЫЛО (разбор одним explode('[', ...), терял содержимое секции вида
 * "[Вагон] 1768, T: 276, H: 286" из-за комментария после закрывающей скобки):
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
 * Пишем во временный файл рядом, проверяем результат, и только потом
 * подменяем целевой файл. При сбое rename() конфиг возвращается из бэкапа.
 */
function writeIniSafely(string $target, string $content): bool
{
    $dir = dirname($target);
    $tmp = $dir . DIRECTORY_SEPARATOR . '.TS.ini.' . getmypid() . '.tmp';
    $bak = $target . '.bak';

    $written = @file_put_contents($tmp, $content, LOCK_EX);

    if ($written === false || $written !== strlen($content)) {
        @unlink($tmp);
        error_log('update_ts_config: не удалось записать временный файл ' . $tmp);
        return false;
    }

    if (is_file($target) && !@copy($target, $bak)) {
        @unlink($tmp);
        error_log('update_ts_config: не удалось создать резервную копию ' . $bak);
        return false;
    }

    // rename() в PHP на Windows не перезаписывает существующий файл.
    if (is_file($target) && !@unlink($target)) {
        @unlink($tmp);
        error_log('update_ts_config: не удалось удалить прежний TS.ini');
        return false;
    }

    if (!@rename($tmp, $target)) {
        @unlink($tmp);

        if (is_file($bak)) {
            @copy($bak, $target);
        }

        error_log('update_ts_config: не удалось переименовать временный файл в TS.ini');
        return false;
    }

    return true;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    respond(false, 'Invalid request method', 405);
}

$rawBody = file_get_contents('php://input');

if ($rawBody === false) {
    error_log('update_ts_config: не удалось прочитать тело запроса');
    respond(false, 'Failed to read request body', 400);
}

if (strlen($rawBody) > MAX_BODY_SIZE) {
    respond(false, 'Request body too large', 413);
}

$data = json_decode($rawBody, true);

if (json_last_error() !== JSON_ERROR_NONE || !is_array($data) || $data === []) {
    respond(false, 'Invalid JSON data', 400);
}

// fix: путь к конфигу строится от __DIR__ и проверяется по размеру | 2026-10-05 | Моро
// БЫЛО:
// $currentConfig = [];
// if (file_exists('TS.ini')) {
//     $iniContent = file_get_contents('TS.ini');
$target = __DIR__ . DIRECTORY_SEPARATOR . 'TS.ini';
$currentConfig = [];

if (is_file($target)) {
    $iniContent = @file_get_contents($target);

    if ($iniContent === false) {
        error_log('update_ts_config: не удалось прочитать ' . $target);
        respond(false, 'Failed to read config', 500);
    }

    if (strlen($iniContent) > MAX_INI_SIZE) {
        error_log('update_ts_config: конфиг больше допустимого размера');
        respond(false, 'Config too large', 500);
    }

    $currentConfig = parseIniValues($iniContent);
}

// Валидируем и склеиваем новые данные с существующим конфигом.
// fix: секции и параметры проверяются, недопустимые отклоняются, секция не затирается мусором | 2026-10-05 | Моро
// БЫЛО:
// // Объединяем с новыми данными
// foreach ($data as $section => $params) {
//     $currentConfig[$section] = $params;
// }
foreach ($data as $section => $params) {
    $section = (string)$section;

    if (!isSafeIniName($section, MAX_SECTION_LEN)) {
        respond(false, 'Invalid section name', 400);
    }

    if (!is_array($params)) {
        respond(false, 'Invalid params for section ' . $section, 400);
    }

    if (count($params) > MAX_SECTIONS) {
        respond(false, 'Too many params in section ' . $section, 400);
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

    // fix: переданные ключи заменяли секцию ЦЕЛИКОМ, поэтому частичный запрос
    //       удалял все остальные параметры этой секции | 2026-10-05 | Моро
    // БЫЛО:
    // $currentConfig[$section] = $cleanParams;
    // Теперь ключи вставляются в существующую секцию: указанные обновляются,
    // не указанные остаются. Новая секция создаётся как раньше.
    if (isset($currentConfig[$section]) && is_array($currentConfig[$section])) {
        $currentConfig[$section] = array_merge($currentConfig[$section], $cleanParams);
    } else {
        $currentConfig[$section] = $cleanParams;
    }
}

if (count($currentConfig) > MAX_SECTIONS) {
    respond(false, 'Too many sections', 400);
}

// fix: содержимое формируется из проверенных данных и пишется атомарно с бэкапом | 2026-10-05 | Моро
// БЫЛО:
// // Формируем новый INI-файл
// $newIniContent = '';
// foreach ($currentConfig as $section => $params) {
//     $newIniContent .= "[$section]\n";
//     foreach ($params as $key => $value) {
//         $newIniContent .= "$key=$value\n";
//     }
//     $newIniContent .= "\n";
// }
// 
// // Сохраняем
// $result = file_put_contents('TS.ini', trim($newIniContent));
// 
// echo json_encode([
//     'success' => $result !== false,
//     'message' => $result !== false ? 'Config updated' : 'Failed to update config'
// ]);
$newIniContent = buildIni($currentConfig);

if (strlen($newIniContent) > MAX_INI_SIZE) {
    respond(false, 'Config too large', 400);
}

if (!writeIniSafely($target, $newIniContent)) {
    respond(false, 'Failed to update config', 500);
}

respond(true, 'Config updated');