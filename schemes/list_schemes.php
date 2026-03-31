<?php
header('Content-Type: application/json');
$files = glob(__DIR__ . '/scheme_*.json');
echo json_encode(array_map('basename', $files));
?>