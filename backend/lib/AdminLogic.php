<?php
// 文件路径: backend/telegram_webhook.php (层级式菜单版本)

// ... (文件顶部的 DEBUG 和 write_log 函数保持不变) ...
define('DEBUG', true);
define('LOG_FILE', __DIR__ . '/webhook_debug.log');
function write_log($message) { /* ... */ }

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
    
    // 默认回复
    $reply_text = "请选择一个操作。";
    $reply_keyboard = $main_keyboard;

    // --- 处理菜单切换 ---
    switch ($command_or_button_text) {
        case '/start':
        case '/menu':
        case BTN_BACK_TO_MAIN:
            $reply_text = "欢迎来到主菜单！";
            $reply_keyboard = $main_keyboard;
            $bot->sendMessageWithKeyboard($chat_id, $reply_text, $reply_keyboard);
            exit();

        case BTN_HANDS_MENU:
            $reply_text = "进入*牌局管理*菜单。";
            $reply_keyboard = $hands_keyboard;
            $bot->sendMessageWithKeyboard($chat_id, $reply_text, $reply_keyboard);
            exit();

        case BTN_USERS_MENU:
            $reply_text = "进入*用户管理*菜单。";
            $reply_keyboard = $users_keyboard;
            $bot->sendMessageWithKeyboard($chat_id, $reply_text, $reply_keyboard);
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
            
        case BTN_FILL_<?php
// 文件路径: backend/lib/AdminLogic.php
class AdminLogic {
    private $pdo;

    public function __construct($pdo) {
        $this->pdo = $pdo;
    }

    /**
     * 根据手机号或Public ID查找用户
     * @param string $identifier
     * @return array|false
     */
    public function findUser($identifier) {
        $stmt = $this->pdo->prepare("SELECT public_id, phone, points, created_at FROM users WHERE phone = :identifier OR public_id = :identifier");
        $stmt->execute([':identifier' => $identifier]);
        return $stmt->fetch();
    }

    /**
     * 修改用户积分
     * @param string $identifier
     * @param int $amount (可以是正数或负数)
     * @return string
     */
    public function updateUserPoints($identifier, $amount) {
        $this->pdo->beginTransaction();
        try {
            // 先锁定用户行，防止并发问题
            $stmt = $this->pdo->prepare("SELECT id, points FROM users WHERE phone = :identifier OR public_id = :identifier FOR UPDATE");
            $stmt->execute([':identifier' => $identifier]);
            $user = $stmt->fetch();

            if (!$user) {
                $this->pdo->rollBack();
                return "用户不存在！";
            }

            $new_points = $user['points'] + $amount;
            if ($new_points < 0) {
                $this->pdo->rollBack();
                return "操作失败，用户积分不能为负数！";
            }

            $stmt = $this->pdo->prepare("UPDATE users SET points = ? WHERE id = ?");
            $stmt->execute([$new_points, $user['id']]);

            $this->pdo->commit();

            $action = $amount >= 0 ? "增加" : "减少";
            return "操作成功！\n用户: `{$identifier}`\n{$action}: " . abs($amount) . " 分\n最新积分: *{$new_points}*";
        } catch (Exception $e) {
            $this->pdo->rollBack();
            return "数据库操作失败: " . $e->getMessage();
        }
    }

    /**
     * 删除用户
     * @param string $identifier
     * @return string
     */
    public function deleteUser($identifier) {
        // 重要：在生产环境中，删除用户可能是危险操作。
        // 最好是做一个“软删除”（比如设置一个 is_deleted 标志），而不是物理删除。
        // 这里为了简单，我们直接做物理删除。
        $user = $this->findUser($identifier);
        if (!$user) {
            return "用户 `{$identifier}` 不存在！";
        }

        $stmt = $this->pdo->prepare("DELETE FROM users WHERE phone = :identifier OR public_id = :identifier");
        $stmt->execute([':identifier' => $identifier]);
        
        if ($stmt->rowCount() > 0) {
            return "用户 `{$identifier}` (手机号: {$user['phone']}) 已被成功删除。";
        } else {
            return "删除用户 `{$identifier}` 失败。";
        }
    }
}