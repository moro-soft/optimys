<?php
header('Content-Type: application/json');

// Проверяем, что запрос пришел методом POST
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    echo json_encode(['success' => false, 'message' => 'Only POST method allowed']);
    exit;
}

// Получаем данные
$json = file_get_contents('php://input');
$data = json_decode($json, true);

// Проверяем наличие имени файла
if (empty($data['filename'])) {
    echo json_encode(['success' => false, 'message' => 'Filename is required']);
    exit;
}

$filename = basename($data['filename']);
$filepath = __DIR__ . '/data/' . $filename;

// Проверяем существование файла
if (!file_exists($filepath)) {
    echo json_encode(['success' => false, 'message' => 'File not found']);
    exit;
}

// Пытаемся удалить файл
try {
    if (!unlink($filepath)) {
        throw new Exception('Failed to delete file');
    }
    
    echo json_encode([
        'success' => true,
        'message' => 'File deleted successfully',
        'filename' => $filename
    ]);
    
} catch (Exception $e) {
    echo json_encode([
        'success' => false,
        'message' => $e->getMessage(),
        'filename' => $filename
    ]);
}
?>