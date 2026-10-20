<?php
header('Content-Type: application/json');

// Проверяем, что запрос пришел методом POST
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    echo json_encode(['success' => false, 'message' => 'Only POST method allowed']);
    exit;
}

// Получаем raw JSON данные
// БЫЛО:
// $json = file_get_contents('php://input');
// $data = json_decode($json, true);
// Проверяем валидность JSON
// if (json_last_error() !== JSON_ERROR_NONE) {
//     echo json_encode(['success' => false, 'message' => 'Invalid JSON data']);
//     exit;
// }
// Создаем имя файла с временной меткой
// $timestamp = date('Y.m.d_H-i-s');
// $setstamp = 'HxD_';
// forEach ( $data['rollSets'] as $rollSet) {
// 	$setstamp .= $rollSet['H'].'x'.$rollSet['D'].'_';
// };
// $filename = "$setstamp$timestamp.json";
// fix: Path Traversal + произвольная запись файла — H/D из тела запроса подставлялись в имя файла
//      без очистки, поэтому значение вида "..\\..\\..\\x" позволяло записать файл ВНЕ каталога data/
//      (в корень сайта) под контролируемым именем; теперь H/D очищаются до цифр, имя файла
//      проверяется белым списком, добавлен лимит размера запроса и проверка структуры rollSets | 2026-10-05 | Моро
$json = file_get_contents('php://input');
$data = json_decode($json, true);

// fix: ограничение размера тела запроса — защита от DoS через огромный JSON | 2026-10-05 | Моро
if (strlen($json) > 10 * 1024 * 1024) {
    echo json_encode(['success' => false, 'message' => 'Payload too large']);
    exit;
}

// Проверяем валидность JSON
if (json_last_error() !== JSON_ERROR_NONE || !is_array($data)) {
    echo json_encode(['success' => false, 'message' => 'Invalid JSON data']);
    exit;
}

// fix: проверка структуры — без неё foreach по отсутствующему rollSets давал warning и пустое имя файла | 2026-10-05 | Моро
if ( !isset($data['rollSets']) || !is_array($data['rollSets']) || count($data['rollSets']) < 1 ) {
    echo json_encode(['success' => false, 'message' => 'Field rollSets is required']);
    exit;
}

// Создаем имя файла с временной меткой
$timestamp = date('Y.m.d_H-i-s');
$setstamp = 'HxD_';
foreach ( $data['rollSets'] as $rollSet) {
    if ( !is_array($rollSet) ) continue;
    // fix: оставляем только цифры в H/D — это ключевая защита от path traversal в имени файла | 2026-10-05 | Моро
    $H = preg_replace('/[^0-9]/', '', (string)($rollSet['H'] ?? ''));
    $D = preg_replace('/[^0-9]/', '', (string)($rollSet['D'] ?? ''));
    $setstamp .= $H.'x'.$D.'_';
}
$filename = $setstamp.$timestamp.'.json';

// Проверка расширения файла
// БЫЛО:
// if (!preg_match('/^sHD_\(.+\)\d{4}\.\d{2}\.\d{2}_\d{2}\-\d{2}\-\d{2}\.json$/', $filename)) {
//     echo json_encode(['success' => false, 'message' => 'Invalid filename '.$filename]);
//     exit;
// }
// fix: белый список на итоговое имя файла — допускаем только буквы/цифры/подчёркивание/точку
//      и обязательное расширение .json (иначе в каталог можно было положить .php/.phtml) | 2026-10-05 | Моро
if ( !preg_match('/^[A-Za-z0-9_.\-]+\.json$/', $filename) ) {
    echo json_encode(['success' => false, 'message' => 'Invalid filename']);
    exit;
}

// Проверка директории
if (!is_writable(__DIR__. '/data')) {
    echo json_encode(['success' => false, 'message' => 'Directory not writable']);
    exit;
}

// Путь для сохранения (в текущей директории)
$filepath = __DIR__ . '/data/' . $filename;

// БЫЛО:
// try {
//     $result = file_put_contents($filepath, $json);
//     if ($result === false) {
//         throw new Exception('Failed to write file');
//     }
//     echo json_encode([
//         'success' => true,
//         'filename' => $filename,
//         'saved_at' => date('Y-m-d H:i:s')
//     ]);
// } catch (Exception $e) {
//     echo json_encode([
//         'success' => false,
//         'message' => $e->getMessage(),
//         'filename' => $filename
//     ]);
// }
// fix: (1) $e->getMessage() утекал в ответ путь/детали файловой системы;
//      (2) file_put_contents без LOCK_EX — при параллельных автосохранениях файл мог остаться
//      частично записанным, т.е. битым и нечитаемым для клиента;
//      (3) при ошибке записи в тело ответа попадал PHP-warning и JSON ломался | 2026-10-05 | Моро
try {
    // fix: '@' + проверка результата — подавляем warning в stdout, детали уходят в лог сервера | 2026-10-05 | Моро
    $result = @file_put_contents($filepath, $json, LOCK_EX);

    if ($result === false || $result !== strlen($json)) {
        throw new Exception('Failed to write file');
    }

    // Возвращаем успешный ответ
    echo json_encode([
        'success' => true,
        'filename' => $filename,
        'saved_at' => date('Y-m-d H:i:s')
    ]);

} catch (Exception $e) {
    // fix: утечка исключения — детали пишем в error_log(), клиенту отдаём нейтральное сообщение | 2026-10-05 | Моро
    error_log('save_scheme: ' . $e->getMessage() . ' | file=' . $filepath);
    echo json_encode([
        'success' => false,
        'message' => 'Failed to write file',
        'filename' => $filename
    ]);
}
?>