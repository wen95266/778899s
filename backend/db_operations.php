<?php
// backend/db_operations.php

// 防止重复加载
if (defined('DB_OPERATIONS_LOADED')) return;
define('DB_OPERATIONS_LOADED', true);

// 确保已加载配置
require_once __DIR__ . '/config.php';

function get_db_connection() {
    static $pdo = null;
    
    if ($pdo === null) {
        // 使用 config() 函数读取配置
        $host = config('DB_HOST', 'localhost');
        $port = config('DB_PORT', '3306');
        $db   = config('DB_DATABASE');
        $user = config('DB_USERNAME');
        $pass = config('DB_PASSWORD');

        if (!$db || !$user) {
            // 如果配置读取失败，抛出详细错误以便调试
            throw new Exception("数据库配置缺失。请检查 .env 文件。");
        }

        $dsn = "mysql:host=$host;port=$port;dbname=$db;charset=utf8mb4";
        
        try {
            $pdo = new PDO($dsn, $user, $pass, [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false
            ]);
        } catch (PDOException $e) {
            // 记录具体错误但不要直接输出给用户
            error_log("DB Connection Failed: " . $e->getMessage());
            throw new Exception("数据库连接失败");
        }
    }
    return $pdo;
}
?>