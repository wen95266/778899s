<?php
// 文件路径: backend/telegram_webhook.php (带键盘菜单的版本)

// ... (文件顶部的 DEBUG 和 write_log 函数保持不变) ...
define('DEBUG', true);
define('LOG_FILE', __DIR__ . '/webhook_debug.log');
function write_log($message) { /* ... */ }

write_log("--- Webhook triggered ---");

try {
    require_once __DIR__ . '/config/database.php';
    require_once __DIR__ . '/lib/TelegramBot.php';
    require_once __DIR__ . '/lib/GameLogic.php';

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
    
    // --- 定义键盘和命令 ---
    // 按钮上显示的文本
    define('BTN_CHECK_STOCK', '📊 检查库存');
    define('BTN_FILL_STOCK', '📦 补满库存');
    // 未来可扩展
    // define('BTN_USER_MANAGEMENT', '👤 用户管理');
    // define('BTN_GAME_LOGS', '📜 游戏日志');

    // 将按钮文本映射到实际执行的命令
    $command_map = [
        BTN_CHECK_STOCK => '/check_stock',
        BTN_FILL_STOCK => '/fill_stock',
    ];

    // 如果收到的文本是键盘按钮，将其转换为命令
    $command_text = $command_map[$text] ?? $text;

    // --- 解析并执行指令 ---
    $parts = explode(' ', $command_text);
    $command = $parts[0];
    $params = array_slice($parts, 1);
    
    $reply = '';
    
    // --- 定义键盘布局 ---
    $main_keyboard = [
        [BTN_CHECK_STOCK, BTN_FILL_STOCK],
        // [BTN_USER_MANAGEMENT, BTN_GAME_LOGS],
    ];

    switch ($command) {
        case '/start':
        case '/menu':
            $reply = "欢迎使用十三水管理后台！请选择操作：";
            $bot->sendMessageWithKeyboard($chat_id, $reply, $main_keyboard);
            // 因为已经发送了消息，所以退出脚本
            exit();
            
        case '/check_stock':
            $count = $gameLogic->getUnusedHandsCount();
            $reply = "当前牌局库存剩余: *{$count}* 局。";
            break;
            
        case '/fill_stock':
            $target_level = 960;
            $current_stock = $gameLogic->getUnusedHandsCount();
            if ($current_stock >= $target_level){
                $reply = "库存已满 ({$current_stock}局)，无需补充。";
            } else {
                $needed = $target_level - $current_stock;
                $generated = $gameLogic->generateNewHands($needed);
                $reply = "库存已从 {$current_stock} 补满至 " . ($current_stock + $generated) . "。\n本次新增 *{$generated}* 局。";
            }
            break;

        case '/generate_hands': // 手动输入命令依然保留
            $count = (int)($params[0] ?? 0);
            if ($count > 0 && $count <= 2000) {
                $generated = $gameLogic->generateNewHands($count);
                $new_total = $gameLogic->getUnusedHandsCount();
                $reply = "成功生成 *{$generated}* 局牌。\n当前总库存: *{$new_total}* 局。";
            } else {
                $reply = "用法: `/generate_hands 100`";
            }
            break;
        
        default:
            $reply = "未知指令或操作。";
    }
    
    // 发送常规回复
    $bot->sendMessage($chat_id, $reply);

} catch (Exception $e) {
    // ... (异常处理代码保持不变) ...
    write_log("!!! SCRIPT CRASHED !!! ... ");
    if (isset($bot) && isset($admin_chat_id)) {
        $bot->sendMessage($admin_chat_id, "机器人后台发生严重错误，请检查日志。");
    }
}

write_log("--- Webhook execution finished ---");