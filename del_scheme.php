<?php
// fix: утечка внутренних сообщений ($e->getMessage()), неверный HTTP-код для GET,
//       отображение PHP-ошибок и отсутствие whitelist расширения | 2026-10-05 | Моро
// БЫЛО (файл целиком):
// <?php
// header('Content-Type: application/json');
// 
// // Проверяем, что запрос пришел методом POST
// if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
//     echo json_encode(['success' => false, 'message' => 'Only POST method allowed']);
//     exit;
// }
// 
// // Получаем данные
// $json = file_get_contents('php://input');
// $data = json_decode($json, true);
// 
// // Проверяем наличие имени файла
// if (empty($data['filename'])) {
//     echo json_encode(['success' => false, 'message' => 'Filename is required']);
//     exit;
// }
// 
// $filename = basename($data['filename']);
// $filepath = __DIR__ . '/data/' . $filename;
// 
// // Проверяем существование файла
// if (!file_exists($filepath)) {
//     echo json_encode(['success' => false, 'message' => 'File not found']);
//     exit;
// }
// 
// // Пытаемся удалить файл
// try {
//     if (!unlink($filepath)) {
//         throw new Exception('Failed to delete file');
//     }
//     
//     echo json_encode([
//         'success' => true,
//         'message' => 'File deleted successfully',
//         'filename' => $filename
//     ]);
//     
// } catch (Exception $e) {
//     echo json_encode([
//         'success' => false,
//         'message' => $e->getMessage(),
//         'filename' => $filename
//     ]);
// }
// (закрывающий тег PHP в старом коде намеренно не приведён буквально:
//  закрывающий тег внутри комментария с двумя слешами закрыл бы PHP-режим
//  и весь код ниже стал бы выводиться как HTML)

// Ошибки не выводим в ответ — только в лог сервера
@ini_set('display_errors', '0');
@ini_set('log_errors', '1');
error_reporting(E_ALL);

header('Content-Type: application/json; charset=utf-8');

// fix: неверный HTTP-код 200 при отказе в методе запроса | 2026-10-05 | Моро
// БЫЛО:
// if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
//     echo json_encode(['success' => false, 'message' => 'Only POST method allowed']);
//     exit;
// }
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    http_response_code(405);
    header('Allow: POST');
    echo json_encode(['success' => false, 'message' => 'Only POST method allowed']);
    exit;
}

// Получаем данные
$json = file_get_contents('php://input');
$data = json_decode($json, true);

// fix: ожидаемые ошибки возвращались кодами 400/404 — на этом сервере nginx
//       превращает ЛЮБОЙ не-2xx ответ на POST в 405 с HTML-страницей, поэтому
//       response.json() в браузере падал и пользователь видел «ошибку соединения».
//       Теперь ошибки отдаются кодом 200 с success:false (как в save_scheme.php) | 2026-10-05 | Моро
// БЫЛО:
// if (!is_array($data) || empty($data['filename']) || !is_string($data['filename'])) {
//     http_response_code(400);
//     echo json_encode(['success' => false, 'message' => 'Filename is required']);
//     exit;
// }
if (!is_array($data) || empty($data['filename']) || !is_string($data['filename'])) {
    echo json_encode(['success' => false, 'message' => 'Filename is required']);
    exit;
}

// fix: whitelist расширения и проверка длины — basename() не мешал удалить
//       любой файл каталога data/ по известному имени | 2026-10-05 | Моро
// БЫЛО:
// $filename = basename($data['filename']);
// $filepath = __DIR__ . '/data/' . $filename;
$filename = basename($data['filename']);

if (strlen($filename) > 255 || !preg_match('/^[A-Za-z0-9_.\-]+\.json$/', $filename)) {
    echo json_encode(['success' => false, 'message' => 'Invalid filename']);
    exit;
}

// Путь строим от __DIR__, дополнительно проверяем, что файл внутри каталога data
$filepath = __DIR__ . '/data/' . $filename;
$realBase  = realpath(__DIR__ . '/data');
$realFile  = realpath($filepath);

if ($realBase === false || $realFile === false || strpos($realFile, $realBase . DIRECTORY_SEPARATOR) !== 0) {
    echo json_encode(['success' => false, 'message' => 'File not found', 'filename' => $filename]);
    exit;
}

// Пытаемся удалить файл
try {
    if (!unlink($realFile)) {
        throw new Exception('unlink failed');
    }

    echo json_encode([
        'success' => true,
        'message' => 'File deleted successfully',
        'filename' => $filename
    ]);

    // fix: наружу отдавалось $e->getMessage() — утечка путей и внутренних ошибок | 2026-10-05 | Моро
    // БЫЛО:
    // } catch (Exception $e) {
    //     echo json_encode([
    //         'success' => false,
    //         'message' => $e->getMessage(),
    //         'filename' => $filename
    //     ]);
    // }
} catch (Exception $e) {
    // Подробности — только в лог сервера
    error_log('del_scheme: ' . $e->getMessage() . ' file=' . $filename);

    echo json_encode([
        'success' => false,
        'message' => 'Delete failed',
        'filename' => $filename
    ]);
}