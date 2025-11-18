<?php
// 文件路径: backend/telegram_webhook.php (层级式菜单版本)

// ... (文件顶部的 DEBUG 和 write_log 函数保持不变) ...
define('DEBUG', true);
define('LOG_FILE', __DIR__ . '/webhook_debug.log');
function write_log($message) { 
    if (DEBUG) {
        $log_entry = "[" . date('Y-m-d H:i:s') . "] " . (is_array($message) || is_object($message) ? print_r($message, true) : $message) . "
";
        file_put_contents(LOG_FILE, $log_entry, FILE_APPEND);
    }
}

write_log("--- Webhook triggered ---");

try {
    require_once __DIR__ . '/config/database.php';
    require_once __DIR__ . '/lib/TelegramBot.php';
    require_once __DIR__ . '/lib/GameLogic.php';
    require_once __DIR__ . '/lib/AdminLogic.php'; // 引入新的管理逻辑文件

    // ... (获取配置和解析Telegram数据的代码保持不变) ...
    $bot_token = getEnvVariable('TELEGRAM_BOT_TOKEN');
    $admin_chat_id = (int)getEnvVariable('ADMIN_CHAT_ID');
    $update = json_decode(file_get_contents('php://input'), true);
    $message = $update['message'] ?? null;
    $chat_id = (int)($message['chat']['id'] ?? 0);
    $text = $message['text'] ?? '';
    
    if ($chat_id !== $admin_chat_id) {
        exit();
    }
    
    $bot = new TelegramBot($bot_token);
    $pdo = getDBConnection();
    $gameLogic = new GameLogic($pdo);
    $adminLogic = new AdminLogic($pdo); // 实例化AdminLogic

    // --- 定义所有键盘按钮 ---
    // 主菜单
    define('BTN_HANDS_MENU', '🃏 牌局管理');
    define('BTN_USERS_MENU', '👥 用户管理');
    // 通用
    define('BTN_BACK_TO_MAIN', '« 返回主菜单');
    // 牌局管理
    define('BTN_CHECK_STOCK', '📊 检查库存');
    define('BTN_FILL_STOCK', '📦 补满库存');
    // 用户管理
    define('BTN_FIND_USER', '🔎 查询用户');
    define('BTN_UPDATE_POINTS', '💰 增减积分');
    define('BTN_DELETE_USER', '❌ 删除用户');

    // --- 定义键盘布局 ---
    $main_keyboard = [[BTN_HANDS_MENU, BTN_USERS_MENU]];
    $hands_keyboard = [[BTN_CHECK_STOCK, BTN_FILL_STOCK], [BTN_BACK_TO_MAIN]];
    $users_keyboard = [[BTN_FIND_USER, BTN_UPDATE_POINTS], [BTN_DELETE_USER], [BTN_BACK_TO_MAIN]];

    // --- 解析命令和参数 ---
    $parts = explode(' ', $text);
    $command_or_button_text = $parts[0];
    $params = array_slice($parts, 1);
    
    // --- 处理菜单切换 ---
    switch ($command_or_button_text) {
        case '/start':
        case '/menu':
        case BTN_BACK_TO_MAIN:
            $reply_text = "欢迎来到主菜单！";
            $bot->sendMessageWithKeyboard($chat_id, $reply_text, $main_keyboard);
            exit();

        case BTN_HANDS_MENU:
            $reply_text = "进入*牌局管理*菜单。";
            $bot->sendMessageWithKeyboard($chat_id, $reply_text, $hands_keyboard);
            exit();

        case BTN_USERS_MENU:
            $reply_text = "进入*用户管理*菜单。";
            $bot->sendMessageWithKeyboard($chat_id, $reply_text, $users_keyboard);
            exit();
    }

    // --- 处理功能指令 ---
    $final_reply = null;
    switch ($command_or_button_text) {
        // 牌局管理功能
        case BTN_CHECK_STOCK:
        case '/check_stock':
            $count = $gameLogic->getUnusedHandsCount();
            $final_reply = "当前牌局库存剩余: *{$count}* 局。";
            break;
            
        case BTN_FILL_STOCK:
        case '/fill_stock':
            $target_level = 960;
            $current_stock = $gameLogic->getUnusedHandsCount();
            if ($current_stock >= $target_level){
                $final_reply = "库存已满 ({$current_stock}局)，无需补充。";
            } else {
                $needed = $target_level - $current_stock;
                $generated = $gameLogic->generateNewHands($needed);
                $final_reply = "库存已从 {$current_stock} 补满至 " . ($current_stock + $generated) . "。
本次新增 *{$generated}* 局。";
            }
            break;

        // 用户管理功能
        case BTN_FIND_USER:
        case '/find_user':
            if (count($params) < 1) {
                $final_reply = "用法: `/find_user 手机号或PublicID`";
            } else {
                $user = $adminLogic->findUser($params[0]);
                if ($user) {
                    $final_reply = "找到用户:
- ID: `{$user['public_id']}`
- 手机: `{$user['phone']}`
- 积分: *{$user['points']}*
- 注册时间: {$user['created_at']}";
                } else {
                    $final_reply = "未找到用户 `{$params[0]}`。";
                }
            }
            break;
            
        case BTN_UPDATE_POINTS:
        case '/update_points':
             if (count($params) < 2 || !is_numeric($params[1])) {
                $final_reply = "用法: `/update_points 手机号或ID 数量`
例如: `/update_points user123 -50`";
            } else {
                $final_reply = $adminLogic->updateUserPoints($params[0], (int)$params[1]);
            }
            break;

        case BTN_DELETE_USER:
        case '/delete_user':
            if (count($params) < 1) {
                $final_reply = "⚠️ *危险操作* ⚠️
用法: `/delete_user 手机号或PublicID`";
            } else {
                $final_reply = "⚠️ *危险操作已执行* ⚠️
" . $adminLogic->deleteUser($params[0]);
            }
            break;

        default:
            $final_reply = "未知指令: `{$command_or_button_text}`
请使用键盘或输入有效命令。";
    }
    
    if ($final_reply) {
        $bot->sendMessage($chat_id, $final_reply);
    }

} catch (Exception $e) {
    write_log("!!! SCRIPT CRASHED !!!
" . $e->getMessage() . "
" . $e->getTraceAsString());
    if (isset($bot) && isset($admin_chat_id)) {
        $bot->sendMessage($admin_chat_id, "机器人后台发生严重错误，请检查日志。");
    }
}

write_log("--- Webhook execution finished ---");
