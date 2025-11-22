<?php
// backend/telegram/receiver.php (修复版)
ini_set('display_errors', 0);
ini_set('log_errors', 1);
error_reporting(E_ALL);

// 记录日志
$logFile = __DIR__ . '/debug_bot.log';
function write_log($text) {
    global $logFile;
    file_put_contents($logFile, date('[Y-m-d H:i:s] ') . $text . "\n", FILE_APPEND);
}

// 加载依赖
try {
    require_once __DIR__ . '/../config.php';
    require_once __DIR__ . '/../db_operations.php';
    require_once __DIR__ . '/parser.php';
    require_once __DIR__ . '/bot_api.php';
} catch (Exception $e) {
    write_log("❌ 依赖加载失败: " . $e->getMessage());
    exit;
}

// 验证 Secret
$envSecret = config('TELEGRAM_WEBHOOK_SECRET');
$getSecret = $_GET['secret'] ?? '';
if (empty($envSecret) || $getSecret !== $envSecret) {
    write_log("❌ Secret 验证失败");
    http_response_code(403);
    exit;
}

$input = file_get_contents('php://input');
$update = json_decode($input, true);
if (!$update) exit;

// === 辅助函数：保存开奖数据到数据库 ===
function save_lottery_to_db($data) {
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
            $data['lottery_type'],
            $data['issue_number'],
            json_encode($data['winning_numbers']),
            json_encode($data['zodiac_signs']),
            json_encode($data['colors']),
            $data['drawing_date']
        ]);
        return true;
    } catch (Exception $e) {
        write_log("数据库保存错误: " . $e->getMessage());
        return false;
    }
}

// === 场景 1: 处理回调查询 (点击了行内按钮) ===
if (isset($update['callback_query'])) {
    $cb = $update['callback_query'];
    $cbId = $cb['id'];
    $userId = $cb['from']['id'];
    $data = $cb['data'];
    $msg = $cb['message']; // 修正：从 message 字段获取
    $msgId = $msg['message_id'];
    $chatId = $msg['chat']['id'];
    
    // 鉴权
    if ((string)$userId !== (string)config('TELEGRAM_ADMIN_ID')) {
        answerCallbackQuery($cbId, "🚫 权限不足", true);
        exit;
    }

    if (strpos($data, 'users_page:') === 0) {
        // 翻页
        $page = (int)explode(':', $data)[1];
        $keyboard = getUserListKeyboard($page);
        editMessageText($chatId, $msgId, "👥 <b>用户管理面板</b>\n点击按钮直接删除用户：", $keyboard);
        answerCallbackQuery($cbId);
    } 
    elseif (strpos($data, 'del_user:') === 0) {
        // 删除用户
        $parts = explode(':', $data);
        $uidToDelete = $parts[1];
        $currentPage = $parts[2];
        
        $pdo = get_db_connection();
        $stmt = $pdo->prepare("DELETE FROM users WHERE id = ?");
        $stmt->execute([$uidToDelete]);
        
        // 刷新列表
        $keyboard = getUserListKeyboard($currentPage);
        editMessageText($chatId, $msgId, "✅ 用户 ID:{$uidToDelete} 已删除。\n\n👥 <b>用户管理面板</b>", $keyboard);
        answerCallbackQuery($cbId, "用户已删除", false);
    }
    elseif ($data === 'ignore') {
        answerCallbackQuery($cbId);
    }
    exit;
}

// === 场景 2: 处理普通消息 ===
if (isset($update['message'])) {
    $msg = $update['message'];
    $chatId = $msg['chat']['id'];
    $text = trim($msg['text'] ?? '');
    $userId = $msg['from']['id'];
    
    // 鉴权
    if ((string)$userId !== (string)config('TELEGRAM_ADMIN_ID')) {
        // 非管理员不回应，或者回复拒绝
        // sendTelegramMessage($chatId, "🚫 权限不足");
        exit;
    }

    // 处理指令
    switch ($text) {
        case '/start':
            showMainMenu($chatId);
            break;
            
        case '👥 用户管理':
            $keyboard = getUserListKeyboard(1);
            sendTelegramMessage($chatId, "👥 <b>用户管理面板</b>\n点击按钮直接删除用户：", $keyboard);
            break;
            
        case '📊 系统状态':
            $pdo = get_db_connection();
            $userCount = $pdo->query("SELECT COUNT(*) FROM users")->fetchColumn();
            $emailCount = $pdo->query("SELECT COUNT(*) FROM raw_emails")->fetchColumn();
            $lastEmail = $pdo->query("SELECT received_at FROM raw_emails ORDER BY id DESC LIMIT 1")->fetchColumn();
            $lastEmailStr = $lastEmail ? $lastEmail : '无';
            
            $info = "🖥 <b>系统运行状态</b>\n\n";
            $info .= "👤 注册用户: <b>{$userCount}</b>\n";
            $info .= "📧 邮件总数: <b>{$emailCount}</b>\n";
            $info .= "🕒 最后接收: {$lastEmailStr}\n";
            $info .= "✅ Webhook: 正常";
            sendTelegramMessage($chatId, $info);
            break;
            
        case '🎲 最新开奖':
            $pdo = get_db_connection();
            $stmt = $pdo->query("SELECT * FROM lottery_results ORDER BY updated_at DESC LIMIT 3");
            $results = $stmt->fetchAll();
            
            if (!$results) {
                sendTelegramMessage($chatId, "📭 暂无开奖数据。");
            } else {
                $reply = "🎲 <b>最新数据库开奖记录</b>\n\n";
                foreach ($results as $r) {
                    $nums = json_decode($r['winning_numbers']);
                    $strNums = is_array($nums) ? implode(' ', $nums) : '格式错误';
                    $reply .= "🏆 <b>{$r['lottery_type']}</b> (第{$r['issue_number']}期)\n";
                    $reply .= "🔢 {$strNums}\n";
                    $reply .= "🕒 {$r['drawing_date']}\n\n";
                }
                sendTelegramMessage($chatId, $reply);
            }
            break;

        case '🛠 手动解析':
            sendTelegramMessage($chatId, "请直接转发包含开奖信息的文本消息给我，我将尝试解析并存入数据库。");
            break;

        default:
            // 尝试解析文本（手动解析功能）
            $parseResult = parse_channel_post($text);
            if ($parseResult) {
                if (save_lottery_to_db($parseResult)) {
                    sendTelegramMessage($chatId, "✅ 手动解析并保存成功！\n类型：{$parseResult['lottery_type']}\n期号：{$parseResult['issue_number']}");
                } else {
                    sendTelegramMessage($chatId, "❌ 解析成功但数据库保存失败，请检查日志。");
                }
            } else {
                // 如果不是指令也不是开奖文本，重新显示菜单
                showMainMenu($chatId, "❓ 未知指令，请使用下方菜单：");
            }
            break;
    }
}

// === 场景 3: 频道消息 (自动抓取) ===
if (isset($update['channel_post'])) {
    $text = $update['channel_post']['text'] ?? '';
    $result = parse_channel_post($text);
    if ($result) {
        if (save_lottery_to_db($result)) {
            write_log("频道自动抓取成功: {$result['issue_number']}");
        }
    }
}
?>