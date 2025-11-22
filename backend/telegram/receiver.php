<?php
// backend/telegram/receiver.php
ini_set('display_errors', 0);
ini_set('log_errors', 1);
error_reporting(E_ALL);

// 加载依赖
require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../db_operations.php';
require_once __DIR__ . '/parser.php';
require_once __DIR__ . '/bot_api.php';

// 安全验证
$secret = config('TELEGRAM_WEBHOOK_SECRET');
if (($_GET['secret'] ?? '') !== $secret) {
    http_response_code(403);
    exit;
}

// 获取输入
$input = file_get_contents('php://input');
$update = json_decode($input, true);

if (!$update) exit;

// === 场景 A: 处理频道开奖消息 (Channel Post) ===
if (isset($update['channel_post'])) {
    $post = $update['channel_post'];
    $text = $post['text'] ?? '';
    
    // 调用解析器
    $result = parse_channel_post($text);
    
    if ($result) {
        try {
            $pdo = get_db_connection();
            $stmt = $pdo->prepare("
                INSERT INTO lottery_results 
                (lottery_type, issue_number, winning_numbers, zodiac_signs, colors, drawing_date)
                VALUES (?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                winning_numbers = VALUES(winning_numbers),
                zodiac_signs = VALUES(zodiac_signs),
                colors = VALUES(colors),
                drawing_date = VALUES(drawing_date)
            ");
            
            $stmt->execute([
                $result['lottery_type'],
                $result['issue_number'],
                json_encode($result['winning_numbers']),
                json_encode($result['zodiac_signs']),
                json_encode($result['colors']),
                $result['drawing_date']
            ]);
            
            error_log("频道开奖数据已保存: " . $result['lottery_type'] . " " . $result['issue_number']);
        } catch (Exception $e) {
            error_log("保存开奖数据失败: " . $e->getMessage());
        }
    }
    exit;
}

// === 场景 B: 处理私聊消息 (Private Message) ===
if (isset($update['message'])) {
    $msg = $update['message'];
    $chatId = $msg['chat']['id'];
    $text = trim($msg['text'] ?? '');
    $userId = $msg['from']['id'];
    
    // 验证管理员身份
    $adminId = (int)config('TELEGRAM_ADMIN_ID');
    
    if ($userId !== $adminId) {
        // 非管理员只回复简单信息
        sendTelegramMessage($chatId, "🤖 这是一个自动机器人，仅供管理员使用。");
        exit;
    }

    // --- 1. 处理回复逻辑 (ForceReply) ---
    // 如果这条消息是对机器人“请输入邮箱”的回复
    if (isset($msg['reply_to_message']['text'])) {
        $replyText = $msg['reply_to_message']['text'];
        
        if (strpos($replyText, '请输入要删除的用户的邮箱') !== false) {
            // 执行删除逻辑
            $resultMsg = handleDeleteUser($text);
            sendTelegramMessage($chatId, $resultMsg);
            // 显示主菜单
            showAdminMenu($chatId);
            exit;
        }
    }

    // --- 2. 处理菜单指令 ---
    switch ($text) {
        case '/start':
        case '❓ 帮助':
            showAdminMenu($chatId);
            break;

        case '🗑 删除用户':
            // 发送强制回复请求
            $forceReply = ['force_reply' => true, 'selective' => true];
            sendTelegramMessage($chatId, "⌨️ 请输入要删除的用户的邮箱地址：", $forceReply);
            break;

        case '📊 系统状态':
            $pdo = get_db_connection();
            $userCount = $pdo->query("SELECT COUNT(*) FROM users")->fetchColumn();
            $emailCount = $pdo->query("SELECT COUNT(*) FROM raw_emails")->fetchColumn();
            $msg = "🖥 <b>系统状态报告</b>\n\n";
            $msg .= "👤 注册用户: {$userCount}\n";
            $msg .= "📧 处理邮件: {$emailCount}\n";
            $msg .= "🕒 服务器时间: " . date('Y-m-d H:i:s');
            sendTelegramMessage($chatId, $msg);
            break;
            
        case '🔄 强制刷新开奖':
             sendTelegramMessage($chatId, "⚠️ 此功能暂未对接，请等待频道自动推送。");
             break;

        default:
            sendTelegramMessage($chatId, "❓ 未知指令，请使用下方菜单。");
            showAdminMenu($chatId);
    }
}
?>