<?php
// fix: отображение PHP-ошибок в ответе и отсутствие обработки сбоя glob() | 2026-10-05 | Моро
// БЫЛО (файл целиком):
// <?php
// header('Content-Type: application/json');
// 
// // Убедитесь, что папка schemes существует
// if (!file_exists(__DIR__ . '/data')) {
//     mkdir(__DIR__ . '/data', 0755, true);
// }
// 
// // Получаем список JSON файлов
// $files = glob(__DIR__ . '/data/*.json');
// $result = array_map(function($file) {
//     return basename($file);
// }, $files);
// 
// rsort($result); // позние вверху
// echo json_encode($result);
// (закрывающий тег PHP в старом коде намеренно не приведён буквально:
//  закрывающий тег внутри комментария с двумя слешами закрыл бы PHP-режим
//  и весь код ниже стал бы выводиться как HTML)

// Ошибки не выводим в ответ — только в лог сервера
@ini_set('display_errors', '0');
@ini_set('log_errors', '1');
error_reporting(E_ALL);

header('Content-Type: application/json; charset=utf-8');

// fix: сбой glob() молча возвращал пустой массив и HTTP 200 — клиент считал,
//       что схем нет. Теперь это явная ошибка 500 | 2026-10-05 | Моро
// БЫЛО:
// $files = glob(__DIR__ . '/data/*.json');
// $result = array_map(function($file) {
//     return basename($file);
// }, $files);
$dataDir = __DIR__ . '/data';
$files = @glob($dataDir . '/*.json');

if ($files === false) {
    error_log('list_schemes: не удалось прочитать каталог ' . $dataDir);
    http_response_code(500);
    echo json_encode(['error' => 'Failed to read schemes directory']);
    exit;
}

$result = array_map('basename', $files);

rsort($result); // поздние вверху

echo json_encode($result);