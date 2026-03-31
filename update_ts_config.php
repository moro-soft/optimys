<?php
header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    echo json_encode(['success' => false, 'message' => 'Invalid request method']);
    exit;
}

$data = json_decode(file_get_contents('php://input'), true);
if (!$data) {
    echo json_encode(['success' => false, 'message' => 'Invalid JSON data']);
    exit;
}

// Читаем существующий конфиг
$currentConfig = [];
if (file_exists('TS.ini')) {
    $iniContent = file_get_contents('TS.ini');
    $sections = explode('[', $iniContent);
    
    foreach ($sections as $section) {
        if (empty(trim($section))) continue;
        
        $sectionEnd = strpos($section, ']');
        $sectionName = trim(substr($section, 0, $sectionEnd));
        $sectionContent = substr($section, $sectionEnd + 1);
        
        $currentConfig[$sectionName] = [];
        
        foreach (explode("\n", $sectionContent) as $line) {
            if (empty(trim($line)) || strpos(trim($line), ';') === 0) continue;
            
            $eqPos = strpos($line, '=');
            if ($eqPos === false) continue;
            
            $key = trim(substr($line, 0, $eqPos));
            $value = trim(substr($line, $eqPos + 1));
            
            if (!empty($key)) {
                $currentConfig[$sectionName][$key] = $value;
            }
        }
    }
}

// Объединяем с новыми данными
foreach ($data as $section => $params) {
    $currentConfig[$section] = $params;
}

// Формируем новый INI-файл
$newIniContent = '';
foreach ($currentConfig as $section => $params) {
    $newIniContent .= "[$section]\n";
    foreach ($params as $key => $value) {
        $newIniContent .= "$key=$value\n";
    }
    $newIniContent .= "\n";
}

// Сохраняем
$result = file_put_contents('TS.ini', trim($newIniContent));

echo json_encode([
    'success' => $result !== false,
    'message' => $result !== false ? 'Config updated' : 'Failed to update config'
]);
?>