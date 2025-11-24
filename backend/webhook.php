<?php
/**
 * 全能版 Lottery Bot Webhook
 * 功能：频道监听录入、私聊管理、数据修正、自动清理、预测控制
 */

require_once 'utils/Env.php';
require_once 'utils/Db.php';
require_once 'utils/LotteryLogic.php';
require_once 'utils/Settings.php';

Env::load(__DIR__ . '/.env');

// --- 基础配置 ---
$KEEP_LIMIT = 100; // "清理旧数据"时，保留最近多少期

// --- 辅助函数：发送消息 ---
function sendMsg($chatId, $text, $keyboard = null) {
    $token = trim($_ENV['TG_BOT_TOKEN']);
    $url = "https://api.telegram.org/bot$token/sendMessage";
    $data = ['chat_id' => $chatId, 'text' => $text, 'parse_mode' => 'Markdown'];
    if ($keyboard) $data['reply_markup'] = json_encode($keyboard);
    
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_POST, 1);
    curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query($data));
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    curl_exec($ch);
    curl_close($ch);
}

// --- 辅助函数：强力文本清洗 ---
function cleanText($text) {
    $text = urldecode($text);
    $text = preg_replace('/\p{Z}+/u', ' ', $text); // 替换所有Unicode空格
    $text = preg_replace('/\p{C}+/u', ' ', $text); // 替换控制字符
    $text = preg_replace('/\s+/', ' ', $text);     // 合并空格
    return trim($text);
}

// --- 辅助函数：刷新预测结果 ---
// 当数据变动（录入、删除）时调用此函数
function refreshPrediction() {
    $pdo = Db::connect();
    $stmt = $pdo->query("SELECT * FROM lottery_records ORDER BY issue DESC LIMIT 100");
    $history = $stmt->fetchAll();
    if ($history) {
        $pred = LotteryLogic::predict($history);
        Settings::set('current_prediction', json_encode($pred));
        return true;
    }
    return false;
}

// ==========================================
// 1. 安全验证
// ==========================================
$secretHeader = $_SERVER['HTTP_X_TELEGRAM_BOT_API_SECRET_TOKEN'] ?? '';
if ($secretHeader !== trim($_ENV['TG_SECRET_TOKEN'])) {
    http_response_code(403); die('Forbidden');
}

$content = file_get_contents("php://input");
$update = json_decode($content, true);

// 识别消息类型
$msgType = '';
if (isset($update['channel_post'])) $msgType = 'channel_post';
elseif (isset($update['message'])) $msgType = 'message';
else { echo 'ok'; exit; }

$data = $update[$msgType];
$rawText = $data['text'] ?? '';
$chatId = $data['chat']['id'];

// ==========================================
// 2. 核心业务：开奖号码录入 (频道+私聊通用)
// ==========================================

// 预处理文本
$text = cleanText($rawText);

// 匹配期号：支持 "第:2025xxx期"
preg_match('/第[:：]?\s*(\d+)\s*期/u', $text, $issueMatch);

if (!empty($issueMatch)) {
    $issue = $issueMatch[1];
    
    // 移除期号部分，避免干扰号码提取
    $textWithoutIssue = str_replace($issue, '', $text);
    
    // 匹配号码：查找独立的两位数字 (01-49)
    preg_match_all('/(?<!\d)(\d{2})(?!\d)/', $textWithoutIssue, $numMatches);
    
    $validNums = [];
    foreach ($numMatches[1] as $n) {
        $val = intval($n);
        if ($val >= 1 && $val <= 49) $validNums[] = $n;
    }

    if (count($validNums) >= 7) {
        $nums = array_slice($validNums, 0, 7);
        try {
            $pdo = Db::connect();
            $sql = "INSERT INTO lottery_records (issue, n1, n2, n3, n4, n5, n6, spec) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    ON DUPLICATE KEY UPDATE 
                    n1=?, n2=?, n3=?, n4=?, n5=?, n6=?, spec=?";
            $stmt = $pdo->prepare($sql);
            $params = array_merge([$issue], $nums, $nums);
            $stmt->execute($params);
            
            // 刷新预测
            refreshPrediction();
            
            // 仅在私聊时回复，频道保持安静
            if ($msgType === 'message') {
                sendMsg($chatId, "✅ *录入成功*\n第 `{$issue}` 期\n号码: " . implode(" ", $nums));
            }
        } catch (Exception $e) {
            if ($msgType === 'message') sendMsg($chatId, "❌ DB Error: " . $e->getMessage());
        }
        echo 'ok'; exit;
    }
}

// ==========================================
// 3. 管理员命令控制台 (仅私聊)
// ==========================================

if ($msgType === 'message') {
    $senderId = $data['from']['id'];
    $adminId = trim($_ENV['TG_ADMIN_ID']);

    if ((string)$senderId === (string)$adminId) {
        
        // 定义键盘菜单
        $mainKeyboard = [
            'keyboard' => [
                [['text' => '🔮 查看下期预测'], ['text' => '📊 查看最新录入']],
                [['text' => '🗑 清理旧数据'], ['text' => '🔄 强制刷新']],
                [['text' => '✅ 开启推送'], ['text' => '🛑 关闭推送']]
            ],
            'resize_keyboard' => true,
            'persistent_keyboard' => true
        ];

        // --- 逻辑分支 ---
        
        // 1. 基础菜单
        if ($rawText === '/start' || $rawText === '/help') {
            $msg = "🛠 *管理员控制台*\n\n";
            $msg .= "📥 *录入数据*：直接发送 `第2025xxx期 01 02...`\n";
            $msg .= "🗑 *删除单条*：发送 `删除2025999`\n";
            $msg .= "🧹 *批量清理*：点击 `清理旧数据` (保留最近{$KEEP_LIMIT}条)\n";
            sendMsg($chatId, $msg, $mainKeyboard);
        }
        
        elseif ($rawText === '📊 查看最新录入') {
            $pdo = Db::connect();
            $stmt = $pdo->query("SELECT * FROM lottery_records ORDER BY issue DESC LIMIT 1");
            $row = $stmt->fetch();
            if ($row) {
                sendMsg($chatId, "📅 *最新: 第 {$row['issue']} 期*\n🔢 `{$row['n1']} {$row['n2']} {$row['n3']} {$row['n4']} {$row['n5']} {$row['n6']} + {$row['spec']}`");
            } else {
                sendMsg($chatId, "📭 数据库为空");
            }
        }
        
        elseif ($rawText === '🔮 查看下期预测') {
            $json = Settings::get('current_prediction');
            $pred = json_decode($json, true);
            
            // 获取最新期号
            $pdo = Db::connect();
            $stmt = $pdo->query("SELECT issue FROM lottery_records ORDER BY issue DESC LIMIT 1");
            $row = $stmt->fetch();
            $nextIssue = $row ? $row['issue'] + 1 : '???';

            if ($pred) {
                $sxStr = implode(" ", $pred['six_xiao']);
                $colorMap = ['red'=>'🔴','blue'=>'🔵','green'=>'🟢'];
                $wave = $colorMap[$pred['color_wave']] ?? '';
                sendMsg($chatId, "🔮 *第 {$nextIssue} 期 预测*\n\n六肖：`{$sxStr}`\n波色：{$wave}色\n\n_前端页面已同步_");
            } else {
                sendMsg($chatId, "❌ 暂无预测数据");
            }
        }
        
        // 2. 推送控制
        elseif ($rawText === '✅ 开启推送') {
            Settings::set('push_enabled', '1'); sendMsg($chatId, "✅ 自动推送已开启");
        }
        elseif ($rawText === '🛑 关闭推送') {
            Settings::set('push_enabled', '0'); sendMsg($chatId, "🛑 自动推送已关闭");
        }
        
        // 3. 高级维护功能
        elseif ($rawText === '🔄 强制刷新') {
            if (refreshPrediction()) {
                sendMsg($chatId, "✅ 已重新运行算法并更新前端缓存。");
            } else {
                sendMsg($chatId, "❌ 数据库为空，无法生成预测。");
            }
        }
        
        elseif ($rawText === '🗑 清理旧数据') {
            $pdo = Db::connect();
            // 先查询第 100 条的期号
            $stmt = $pdo->prepare("SELECT issue FROM lottery_records ORDER BY issue DESC LIMIT 1 OFFSET ?");
            $stmt->execute([$KEEP_LIMIT - 1]);
            $boundary = $stmt->fetchColumn();
            
            if ($boundary) {
                $delStmt = $pdo->prepare("DELETE FROM lottery_records WHERE issue < ?");
                $delStmt->execute([$boundary]);
                $count = $delStmt->rowCount();
                sendMsg($chatId, "🧹 清理完成\n已删除第 {$boundary} 期之前的 {$count} 条旧记录。\n目前保留最近 {$KEEP_LIMIT} 期。");
            } else {
                sendMsg($chatId, "⚠️ 数据量不足 {$KEEP_LIMIT} 条，无需清理。");
            }
        }
        
        // 4. 正则指令：删除指定期号
        elseif (preg_match('/^删除(\d+)$/', $rawText, $delMatch)) {
            $delIssue = $delMatch[1];
            $pdo = Db::connect();
            $stmt = $pdo->prepare("DELETE FROM lottery_records WHERE issue = ?");
            $stmt->execute([$delIssue]);
            
            if ($stmt->rowCount() > 0) {
                refreshPrediction(); // 删除后必须重算
                sendMsg($chatId, "🗑 已删除第 `{$delIssue}` 期。\n预测结果已自动校准。");
            } else {
                sendMsg($chatId, "⚠️ 未找到第 `{$delIssue}` 期。");
            }
        }
    }
}

echo 'ok';
?>
