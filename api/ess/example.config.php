<?php
/**
 * ESS API - Example Configuration
 *
 * Copy this file to config.php on the server and update credentials.
 * The config.php on the server is already configured — do NOT overwrite it.
 */

function getDbConnection() {
    static $conn = null;
    if ($conn !== null && $conn->ping()) {
        return $conn;
    }

    // Update these for your server
    $host     = 'localhost';
    $username = 'your_db_username';
    $password = 'your_db_password';
    $dbname   = 'your_db_name';

    $conn = new mysqli($host, $username, $password, $dbname);

    if ($conn->connect_error) {
        http_response_code(500);
        header('Content-Type: application/json');
        echo json_encode(['success' => false, 'error' => 'Database connection failed']);
        exit;
    }

    $conn->set_charset('utf8mb4');
    return $conn;
}
