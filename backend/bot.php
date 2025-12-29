<?php
require_once 'config.php'; // 加载 .env

// --- 数据库连接 ---
$pdo = null;
try {
    $dsn = "mysql:host=" . DB_HOST . ";port=" . DB_PORT . ";dbname=" . DB_NAME . ";charset=utf8mb4";
    $pdo = new PDO($dsn, DB_USER, DB_PASS);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
} catch (PDOException $e) {
    // 如果数据库连接失败，记录错误但不要中断，因为某些命令可能不需要数据库
    error_log("Bot Database Connection Error: " . $e->getMessage());
}

// --- Telegram API 辅助函数 ---
function sendMessage($chat_id, $text) {
    $url = 'https://api.telegram.org/bot' . BOT_TOKEN . '/sendMessage';
    $payload = ['chat_id' => $chat_id, 'text' => $text, 'parse_mode' => 'HTML'];
    
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query($payload));
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    $response = curl_exec($ch);
    curl_close($ch);
    return $response;
}

// --- 机器人逻辑 ---

$update = json_decode(file_get_contents('php://input'), true);

if (isset($update['message'])) {
    $message = $update['message'];
    $chat_id = $message['chat']['id'];
    $text = $message['text'];
    $user_id = $message['from']['id'];

    // 检查是否为管理员
    if ($user_id != ADMIN_ID) {
        sendMessage($chat_id, "抱歉，您无权使用此机器人。");
        exit;
    }

    // 解析命令
    if (strpos($text, '/') === 0) {
        @list($command, $argument) = explode(' ', $text, 2);

        switch ($command) {
            case '/start':
                $reply = "欢迎，管理员！\n\n";
                $reply .= "可用的命令:\n";
                $reply .= "<code>/deleteuser [手机号]</code> - 删除指定手机号的用户及其数据。\n";
                sendMessage($chat_id, $reply);
                break;

            case '/deleteuser':
                if (empty($argument)) {
                    sendMessage($chat_id, "请提供要删除的用户的手机号。用法: <code>/deleteuser 13800138000</code>");
                    break;
                }
                if(!$pdo) {
                    sendMessage($chat_id, "错误：无法连接到数据库。");
                    break;
                }

                try {
                    $phone_number = trim($argument);
                    
                    $stmt = $pdo->prepare("SELECT * FROM users WHERE phone_number = ?");
                    $stmt->execute([$phone_number]);
                    $user_to_delete = $stmt->fetch(PDO::FETCH_ASSOC);

                    if (!$user_to_delete) {
                        sendMessage($chat_id, "未找到手机号为 `{$phone_number}` 的用户。");
                        break;
                    }

                    $stmt = $pdo->prepare("DELETE FROM users WHERE id = ?");
                    $stmt->execute([$user_to_delete['id']]);

                    sendMessage($chat_id, "成功删除用户！\n<b>ID:</b> {$user_to_delete['public_id']}\n<b>手机号:</b> {$user_to_delete['phone_number']}");

                } catch (Exception $e) {
                    sendMessage($chat_id, "删除用户时发生错误： " . $e->getMessage());
                }
                break;

            default:
                sendMessage($chat_id, "未知命令。输入 /start 查看帮助。");
                break;
        }
    }
}

// 设置 Webhook 的一次性代码（需要手动执行或通过部署脚本调用）
// 要设置 webhook，请访问以下 URL，替换您的真实信息:
// https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook?url=https://9526.ip-ddns.com/bot.php

if (isset($_GET['setup_webhook'])) {
    $bot_url = 'https://' . $_SERVER['HTTP_HOST'] . $_SERVER['REQUEST_URI'];
    $webhook_url = str_replace('?setup_webhook', '', $bot_url);
    $telegram_api = 'https://api.telegram.org/bot' . BOT_TOKEN . '/setWebhook?url=' . urlencode($webhook_url);
    
    echo "点击或访问以下链接来设置Webhook: <a href=\"{$telegram_api}\" target=\"_blank\">{$telegram_api}</a>";
} else {
    // 确认 Telegram 的请求
    http_response_code(200);
}
