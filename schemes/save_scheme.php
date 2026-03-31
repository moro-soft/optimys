<?php
header('Content-Type: application/json');

// Проверяем, что запрос пришел методом POST
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    echo json_encode(['success' => false, 'message' => 'Only POST method allowed']);
    exit;
}

// Получаем raw JSON данные
$json = file_get_contents('php://input');
$data = json_decode($json, true);

// Проверяем валидность JSON
if (json_last_error() !== JSON_ERROR_NONE) {
    echo json_encode(['success' => false, 'message' => 'Invalid JSON data']);
    exit;
}

// Создаем имя файла с временной меткой
$timestamp = date('Y-m-d_His');
$filename = "scheme_{$timestamp}.json";

// Проверка расширения файла
if (!preg_match('/^scheme_\d{4}-\d{2}-\d{2}_\d{6}\.json$/', $filename)) {
    echo json_encode(['success' => false, 'message' => 'Invalid filename']);
    exit;
}

// Проверка директории
if (!is_writable(__DIR__)) {
    echo json_encode(['success' => false, 'message' => 'Directory not writable']);
    exit;
}

// Путь для сохранения (в текущей директории)
$filepath = __DIR__ . '/' . $filename;

// Пытаемся сохранить файл
try {
    $result = file_put_contents($filepath, $json);
    
    if ($result === false) {
        throw new Exception('Failed to write file');
    }
    
    // Возвращаем успешный ответ
    echo json_encode([
        'success' => true,
        'filename' => $filename,
        'saved_at' => date('Y-m-d H:i:s')
    ]);
    
} catch (Exception $e) {
    echo json_encode([
        'success' => false,
        'message' => $e->getMessage(),
        'filename' => $filename
    ]);
}
?>