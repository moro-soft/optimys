<?php
header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $data = json_decode(file_get_contents('php://input'), true);
    
    if (!$data || !isset($data['section']) || !isset($data['params'])) {
        echo json_encode(['success' => false, 'message' => 'Invalid data']);
        exit;
    }
    
    $iniContent = "";
    foreach ($data['params'] as $section => $params) {
        $iniContent .= "[$section]\n";
        foreach ($params as $key => $value) {
            $iniContent .= "$key=$value\n";
        }
        $iniContent .= "\n";
    }
    
    $result = file_put_contents('TS.ini', $iniContent);
    
    echo json_encode([
        'success' => (bool)$result,
        'message' => $result ? 'Config saved' : 'Failed to save config'
    ]);
} else {
    echo json_encode(['success' => false, 'message' => 'Invalid request method']);
}
?>