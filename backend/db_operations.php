<?php
// backend/db_operations.php

if (defined('DB_OPERATIONS_LOADED')) return;
define('DB_OPERATIONS_LOADED', true);

require_once __DIR__ . '/config.php';

function get_db_connection() {
    static $pdo = null;
    
    if ($pdo === null) {
        $host = config('DB_HOST', 'localhost');
        $port = config('DB_PORT', '3306');
        $db   = config('DB_DATABASE');
        $user = config('DB_USERNAME');
        $pass = config('DB_PASSWORD');

        if (!$db || !$user) {
            die(json_encode(['status'=>'error', 'message'=>'Database config missing']));
        }

        $dsn = "mysql:host=$host;port=$port;dbname=$db;charset=utf8mb4";
        
        try {
            $pdo = new PDO($dsn, $user, $pass, [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false
            ]);
        } catch (PDOException $e) {
            error_log("DB Connection Error: " . $e->getMessage());
            die(json_encode(['status'=>'error', 'message'=>'Database Connection Error']));
        }
    }
    return $pdo;
}
?>