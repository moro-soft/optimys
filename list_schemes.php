<?php
header('Content-Type: application/json');

// Убедитесь, что папка schemes существует
if (!file_exists(__DIR__ . '/data')) {
    mkdir(__DIR__ . '/data', 0755, true);
}

// Получаем список JSON файлов
$files = glob(__DIR__ . '/data/*.json');
$result = array_map(function($file) {
    return basename($file);
}, $files);

rsort($result); // позние вверху
echo json_encode($result);
?>