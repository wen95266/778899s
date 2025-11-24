<?php
require_once 'Db.php';

class Settings {
    // 获取配置
    public static function get($key, $default = null) {
        $pdo = Db::connect();
        $stmt = $pdo->prepare("SELECT key_value FROM system_settings WHERE key_name = ?");
        $stmt->execute([$key]);
        $res = $stmt->fetch();
        return $res ? $res['key_value'] : $default;
    }

    // 设置配置
    public static function set($key, $value) {
        $pdo = Db::connect();
        $stmt = $pdo->prepare("INSERT INTO system_settings (key_name, key_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE key_value = ?");
        $stmt->execute([$key, $value, $value]);
    }
}
?>