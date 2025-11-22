<?php
// backend/config.php
ini_set('display_errors', 0); 
ini_set('log_errors', 1);
error_reporting(E_ALL);

// 定义前端域名
define('FRONTEND_ORIGIN', 'https://88.9526.ip-ddns.com');

// 读取 .env 的辅助函数
function config($key, $default = null) {
    static $env_cache = null;
    if ($env_cache === null) {
        $envPath = __DIR__ . '/.env';
        if (file_exists($envPath)) {
            $env_cache = parse_ini_file($envPath);
        } else {
            $env_cache = [];
        }
    }
    return $env_cache[$key] ?? $default;
}

// CORS 处理
function handle_cors() {
    $allowed_origins = [
        FRONTEND_ORIGIN,
        'http://localhost:5173',
        'http://localhost',
        'capacitor://localhost'
    ];

    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';

    if (in_array($origin, $allowed_origins) || empty($origin)) {
        if (!empty($origin)) {
            header("Access-Control-Allow-Origin: $origin");
        }
        header('Access-Control-Allow-Credentials: true');
        header('Access-Control-Max-Age: 86400');
    }

    if ($_SERVER['REQUEST_METHOD'] == 'OPTIONS') {
        if (isset($_SERVER['HTTP_ACCESS_CONTROL_REQUEST_METHOD']))
            header("Access-Control-Allow-Methods: GET, POST, OPTIONS, PUT, DELETE");
        if (isset($_SERVER['HTTP_ACCESS_CONTROL_REQUEST_HEADERS']))
            header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With");
        exit(0);
    }
}
?>