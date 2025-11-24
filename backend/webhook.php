<?php
// 引入依赖
require_once 'utils/Env.php';
require_once 'utils/Db.php';
require_once 'utils/LotteryLogic.php';
require_once 'utils/Settings.php';

Env::load(__DIR__ . '/.env');

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

// --- 核心：数据清洗函数 ---
function cleanText($text) {
    // 1. 替换 URL 编码的空格 (%C2%A0 等)
    $text = urldecode($text);
    // 2. 替换 UTF-8 不换行空格 (NBSP) \xC2\xA0
    $text = str_replace("\xC2\xA0", ' ', $text);
    // 3. 替换全角空格
    $text = str_replace("　", ' ', $text);
    // 4. 将连续的空格合并为一个
    $text = preg_replace('/\s+/', ' ', $text);
    return trim($text);
}

// ==========================================
// 1. 入口验证
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
// 2. 尝试录入开奖数据 (优先处理)
// ==========================================

// 第一步：清洗文本 (解决你遇到的录不进去的问题)
$text = cleanText($rawText);

// 第二步：提取期号 (支持 "第:2025316期", "第2025316期", "第 2025316 期")
preg_match('/第[:：]?\s*(\d+)\s*期/u', $text, $issueMatch);

// 第三步：提取号码 (清洗后，数字间只有标准空格，\d{2} 配合边界识别更准)
// 这里的逻辑是：查找所有单独存在的两位数字
preg_match_all('/\b\d{2}\b/', $text, $numMatches);

if (!empty($issueMatch) && count($numMatches[0]) >= 7) {
    $issue = $issueMatch[1];
    $nums = array_slice($numMatches[0], 0, 7); // 取前7个
    
    try {
        $pdo = Db::connect();
        
        // 使用 REPLACE INTO 或 ON DUPLICATE KEY UPDATE
        // 这样如果你发现旧数据错了，重新发一遍新的，它会覆盖旧的！
        $sql = "INSERT INTO lottery_records (issue, n1, n2, n3, n4, n5, n6, spec) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE 
                n1=?, n2=?, n3=?, n4=?, n5=?, n6=?, spec=?";
                
        $stmt = $pdo->prepare($sql);
        $params = array_merge(
            [$issue], $nums, // INSERT 部分
            $nums            // UPDATE 部分
        );
        
        $stmt->execute($params);
        
        // 录入成功后：
        // 1. 立即计算新预测
        $stmtAll = $pdo->query("SELECT * FROM lottery_records ORDER BY issue DESC LIMIT 100");
        $newPred = LotteryLogic::predict($stmtAll->fetchAll());
        Settings::set('current_prediction', json_encode($newPred));
        
        // 2. 如果是频道消息，可以选择回复（也可以不回，保持安静）
        // 此时数据已更新，前端页面刷新即可见
        
    } catch (Exception $e) {
        // 错误处理
    }
    
    // 如果匹配到了开奖数据，处理完直接结束，不再响应菜单命令
    echo 'ok'; exit;
}

// ==========================================
// 3. 处理管理员菜单 (仅限私聊)
// ==========================================

if ($msgType === 'message') {
    $senderId = $data['from']['id'];
    $adminId = trim($_ENV['TG_ADMIN_ID']);

    if ((string)$senderId === (string)$adminId) {
        
        $mainKeyboard = [
            'keyboard' => [
                [['text' => '🔮 生成/查看下期预测'], ['text' => '📊 查看最新录入']],
                [['text' => '✅ 开启自动推送'], ['text' => '🛑 关闭自动推送']]
            ],
            'resize_keyboard' => true,
            'persistent_keyboard' => true
        ];

        switch ($rawText) { // 菜单命令不需要 cleanText
            case '/start':
                sendMsg($chatId, "👋 管理员面板", $mainKeyboard);
                break;
                
            case '📊 查看最新录入':
                $pdo = Db::connect();
                $stmt = $pdo->query("SELECT * FROM lottery_records ORDER BY issue DESC LIMIT 1");
                $row = $stmt->fetch();
                if ($row) {
                    $msg = "📅 *最新: 第 {$row['issue']} 期*\n";
                    $msg .= "🔢 `{$row['n1']} {$row['n2']} {$row['n3']} {$row['n4']} {$row['n5']} {$row['n6']} + {$row['spec']}`\n";
                    $msg .= "⏱ {$row['created_at']}";
                } else {
                    $msg = "📭 暂无数据";
                }
                sendMsg($chatId, $msg);
                break;
            
            case '🔮 生成/查看下期预测':
                // 从数据库读取当前的预测（确保和前端一致）
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
                    
                    $msg = "🔮 *第 {$nextIssue} 期 预测*\n六肖：`{$sxStr}`\n波色：{$wave}色";
                } else {
                    $msg = "❌ 尚未生成预测，请先录入开奖数据";
                }
                sendMsg($chatId, $msg);
                break;
                
            case '✅ 开启自动推送':
                Settings::set('push_enabled', '1');
                sendMsg($chatId, "✅ 已开启");
                break;
                
            case '🛑 关闭自动推送':
                Settings::set('push_enabled', '0');
                sendMsg($chatId, "🛑 已关闭");
                break;
        }
    }
}

echo 'ok';
?>
