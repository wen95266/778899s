<?php
// backend/config.php
ini_set('display_errors', 1);
error_reporting(E_ALL);

// 定义调试日志路径
define('CONFIG_LOG', __DIR__ . '/config_error.log');

function log_config($msg) {
    file_put_contents(CONFIG_LOG, date('[Y-m-d H:i:s] ') . $msg . "\n", FILE_APPEND);
}

// 定义前端域名
define('FRONTEND_ORIGIN', 'http://88.9526.ip-ddns.com');

function config($key, $default = null) {
    static $env_cache = null;

    if ($env_cache === null) {
        $envPath = __DIR__ . '/.env';
        
        if (!file_exists($envPath)) {
            log_config("错误: 找不到 .env 文件，路径: " . $envPath);
            return $default;
        }

        // 使用 parse_ini_file 读取
        $env_cache = parse_ini_file($envPath);
        
        if ($env_cache === false) {
            log_config("错误: .env 文件解析失败 (可能是格式错误)");
            return $default;
        }
        
        log_config("成功加载 .env 文件");
    }

    return $env_cache[$key] ?? $default;
}

// 简单的 CORS 处理
function handle_cors() {
    // ... (保持原样即可，这里不影响 Bot)
}
?>