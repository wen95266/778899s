<?php
require_once 'utils/Env.php';
require_once 'utils/Db.php';
require_once 'utils/LotteryLogic.php';
require_once 'utils/Settings.php';
require_once 'utils/ZodiacManager.php';

Env::load(__DIR__ . '/.env');

// --- 辅助函数 ---
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

function cleanText($text) {
    $text = urldecode($text);
    $text = preg_replace('/\p{Z}+/u', ' ', $text);
    $text = preg_replace('/\p{C}+/u', ' ', $text);
    $text = preg_replace('/\s+/', ' ', $text);
    return trim($text);
}

// 刷新预测并保存
function refreshAndSave() {
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
// 入口验证
// ==========================================
$secretHeader = $_SERVER['HTTP_X_TELEGRAM_BOT_API_SECRET_TOKEN'] ?? '';
if ($secretHeader !== trim($_ENV['TG_SECRET_TOKEN'])) {
    http_response_code(403); die('Forbidden');
}

$content = file_get_contents("php://input");
$update = json_decode($content, true);

$msgType = '';
if (isset($update['channel_post'])) $msgType = 'channel_post';
elseif (isset($update['message'])) $msgType = 'message';
else { echo 'ok'; exit; }

$data = $update[$msgType];
$rawText = $data['text'] ?? '';
$chatId = $data['chat']['id'];

// ==========================================
// 1. 频道开奖录入 (自动)
// ==========================================
$text = cleanText($rawText);
preg_match('/第[:：]?\s*(\d+)\s*期/u', $text, $issueMatch);

if (!empty($issueMatch)) {
    $issue = $issueMatch[1];
    $textWithoutIssue = str_replace($issue, '', $text);
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
                    ON DUPLICATE KEY UPDATE n1=?, n2=?, n3=?, n4=?, n5=?, n6=?, spec=?";
            $stmt = $pdo->prepare($sql);
            $params = array_merge([$issue], $nums, $nums);
            $stmt->execute($params);
            
            // 录入成功后，立即重新推算
            refreshAndSave();
            
            if ($msgType === 'message') {
                sendMsg($chatId, "✅ *录入成功*\n第 `{$issue}` 期\n号码: " . implode(" ", $nums));
            }
        } catch (Exception $e) {}
        echo 'ok'; exit;
    }
}

// ==========================================
// 2. 管理员菜单 (仅私聊)
// ==========================================
if ($msgType === 'message') {
    $senderId = $data['from']['id'];
    $adminId = trim($_ENV['TG_ADMIN_ID']);

    if ((string)$senderId === (string)$adminId) {
        
        // --- 更新后的键盘布局 ---
        $mainKeyboard = [
            'keyboard' => [
                // 第一行：查看 vs 推送
                [['text' => '🔮 查看下期预测'], ['text' => '🚀 推送预测到频道']], 
                // 第二行：查看数据 vs 设置
                [['text' => '📊 查看最新录入'], ['text' => '⚙️ 设置生肖数据']]
            ],
            'resize_keyboard' => true,
            'persistent_keyboard' => true
        ];

        if ($rawText === '/start') {
            sendMsg($chatId, "👋 欢迎使用智能彩票分析系统", $mainKeyboard);
        }

        // --- 查看下期预测 (私有) ---
        elseif ($rawText === '🔮 查看下期预测') {
            $json = Settings::get('current_prediction');
            
            // 获取下一期期号
            $pdo = Db::connect();
            $stmt = $pdo->query("SELECT issue FROM lottery_records ORDER BY issue DESC LIMIT 1");
            $row = $stmt->fetch();
            $nextIssue = $row ? $row['issue'] + 1 : '???';

            if ($json) {
                $pred = json_decode($json, true);
                
                // 格式化输出
                $sxEmoji = ['鼠'=>'🐀','牛'=>'🐂','虎'=>'🐅','兔'=>'🐇','龙'=>'🐉','蛇'=>'🐍','马'=>'🐎','羊'=>'🐏','猴'=>'🐒','鸡'=>'🐓','狗'=>'🐕','猪'=>'🐖'];
                $sixXiaoStr = "";
                foreach ($pred['six_xiao'] as $sx) {
                    $sixXiaoStr .= ($sxEmoji[$sx]??'') . "*{$sx}* ";
                }
                
                $colorMap = ['red'=>'🔴 红波', 'blue'=>'🔵 蓝波', 'green'=>'🟢 绿波'];
                $waveStr = $colorMap[$pred['color_wave']] ?? '';

                $msg = "🕵️ *管理员预览模式*\n\n";
                $msg .= "🎯 *第 {$nextIssue} 期 预测结果*\n";
                $msg .= "------------------------------\n";
                $msg .= "🦁 六肖：{$sixXiaoStr}\n";
                $msg .= "🌊 波色：{$waveStr}\n";
                $msg .= "------------------------------\n";
                $msg .= "💡 确认无误后，点击右侧按钮推送到频道。";
                
                sendMsg($chatId, $msg);
            } else {
                sendMsg($chatId, "❌ 暂无预测数据，请先录入历史开奖。");
            }
        }
        
        // --- 手动推送预测 (公开) ---
        elseif ($rawText === '🚀 推送预测到频道') {
            sendMsg($chatId, "🚀 正在发送...");
            require_once 'manual_push.php'; // 你的推送脚本
            sendMsg($chatId, "✅ 推送完成。");
        }
        
        // --- 查看最新 ---
        elseif ($rawText === '📊 查看最新录入') {
            $pdo = Db::connect();
            $stmt = $pdo->query("SELECT * FROM lottery_records ORDER BY issue DESC LIMIT 1");
            $row = $stmt->fetch();
            if ($row) {
                sendMsg($chatId, "📅 *最新: 第 {$row['issue']} 期*\n🔢 `{$row['n1']} {$row['n2']} {$row['n3']} {$row['n4']} {$row['n5']} {$row['n6']} + {$row['spec']}`");
            } else {
                sendMsg($chatId, "📭 无数据");
            }
        }
        
        // --- 引导设置生肖 ---
        elseif ($rawText === '⚙️ 设置生肖数据') {
            $msg = "🛠 *生肖配置模式*\n\n请按以下 JSON 格式发送新的生肖数据：\n\n";
            $msg .= "`{\"鼠\":[1,13...], \"牛\":[2,14...], ...}`\n\n";
            $msg .= "⚠️ 提示：\n1. 必须包含12生肖\n2. 每年换生肖时更新一次即可";
            sendMsg($chatId, $msg);
        }
        
        // --- 识别 JSON 配置更新 ---
        elseif (strpos(trim($rawText), '{') === 0) {
            $json = json_decode($rawText, true);
            if ($json && count($json) >= 12) {
                Settings::set('zodiac_config', $rawText);
                sendMsg($chatId, "✅ 生肖数据已更新！\n前端和预测算法将立即使用新配置。");
                refreshAndSave(); // 配置变了，预测也要重算
            } else {
                sendMsg($chatId, "❌ JSON 格式错误或生肖数量不足。");
            }
        }
    }
}

echo 'ok';
?>