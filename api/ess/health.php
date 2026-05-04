<?php
/**
 * ESS Health Check — no dependencies, always works
 * Usage: GET /api/ess/health
 */
header('Content-Type: application/json');
echo json_encode(array(
    'status' => 'ok',
    'php_version' => phpversion(),
    'time' => date('Y-m-d H:i:s T'),
    'server' => $_SERVER['SERVER_SOFTWARE'] ?? 'unknown',
    'memory' => round(memory_get_usage(true) / 1048576, 2) . ' MB'
), JSON_PRETTY_PRINT);
exit;
