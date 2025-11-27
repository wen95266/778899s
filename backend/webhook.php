<?php
require_once 'utils/Env.php';
require_once 'utils/Db.php';
require_once 'utils/LotteryLogic.php';
require_once 'utils/Settings.php';
require_once 'utils/ZodiacManager.php';

Env::load(__DIR__ . '/.env');
ini_set('display_errors', 0); error_reporting(E_ALL);

// ... 辅助函数保持不变 ...
function sendMsg($chatId, $text, $keyboard = null) {
    $token = trim($_ENV['TG_BOT_TOKEN']); if (!$token) return false;
    $url = "https://api.telegram.org/bot$token/sendMessage";
    $data = ['chat_id' => $chatId, 'text' => $text, 'parse_mode' => 'Markdown'];
    if ($keyboard) $data['reply_markup'] = json_encode($keyboard);
    $ch = curl_init(); curl_setopt($ch, CURLOPT_URL, $url); curl_setopt($ch, CURLOPT_POST, 1); curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query($data)); curl_setopt($ch, CURLOPT_RETURNTRANSFER, true); $res = curl_exec($ch); curl_close($ch); return json_decode($res, true);
}
function editMsg($chatId, $msgId, $text, $keyboard = null) {
    $token = trim($_ENV['TG_BOT_TOKEN']); $url = "https://api.telegram.org/bot$token/editMessageText";
    $data = ['chat_id' => $chatId, 'message_id' => $msgId, 'text' => $text, 'parse_mode' => 'Markdown'];
    if ($keyboard) $data['reply_markup'] = json_encode($keyboard);
    $ch = curl_init(); curl_setopt($ch, CURLOPT_URL, $url); curl_setopt($ch, CURLOPT_POST, 1); curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query($data)); curl_setopt($ch, CURLOPT_RETURNTRANSFER, true); curl_exec($ch); curl_close($ch);
}
function answerCallback($callbackId, $text = null) {
    $token = trim($_ENV['TG_BOT_TOKEN']); $url = "https://api.telegram.org/bot$token/answerCallbackQuery";
    $data = ['callback_query_id' => $callbackId]; if ($text) $data['text'] = $text;
    $ch = curl_init(); curl_setopt($ch, CURLOPT_URL, $url); curl_setopt($ch, CURLOPT_POST, 1); curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query($data)); curl_exec($ch); curl_close($ch);
}
function cleanText($text) {
    $text = urldecode($text); $text = str_replace(["\r", "\n", "\r\n"], ' ', $text);
    $text = preg_replace('/\p{Z}+/u', ' ', $text); $text = preg_replace('/\p{C}+/u', ' ', $text); $text = preg_replace('/\s+/', ' ', $text);
    return trim($text);
}
function startEvolution() {
    Settings::set('is_evolving', '1'); Settings::set('evolution_gen', '0'); Settings::set('evolution_population', ''); 
    $url = "https://" . $_SERVER['HTTP_HOST'] . "/backend/cron_evolve.php";
    $ctx = stream_context_create(['http' => ['timeout' => 1]]); @file_get_contents($url, false, $ctx);
}

// --- 核心逻辑：风控与展示 ---
function getProgressMsg() {
    $gen = intval(Settings::get('evolution_gen'));
    $json = Settings::get('staging_prediction');
    $isEvolving = Settings::get('is_evolving');
    $lastRun = intval(Settings::get('last_cron_run'));
    
    $timeDiff = time() - $lastRun;
    $cronStatus = ($timeDiff < 120) ? "💓 引擎正常" : "💀 引擎停跳";
    $statusIcon = ($isEvolving == '1') ? "⚡ 进化中" : "💤 已暂停";
    $load = ['🟩⬜⬜⬜⬜', '🟩🟩⬜⬜⬜', '🟩🟩🟩⬜⬜', '🟩🟩🟩🟩⬜', '🟩🟩🟩🟩🟩']; $bar = $load[time() % 5];

    if ($json) {
        $pred = json_decode($json, true);
        $score = 0; if (isset($pred['strategy_used']) && preg_match('/分:([\d\.]+)/', $pred['strategy_used'], $m)) $score = $m[1];
        
        // 风控检查
        $pdo = Db::connect();
        $stmt = $pdo->query("SELECT is_hit_six FROM prediction_history WHERE result_zodiac IS NOT NULL ORDER BY issue DESC LIMIT 3");
        $history = $stmt->fetchAll();
        $loseCount = 0; foreach($history as $h) if($h['is_hit_six']==0) $loseCount++;
        
        $warning = "";
        if ($loseCount >= 2) $warning = "⚠️ *风控警报*: 近期规律波动，建议观望！\n";
        if (isset($pred['confidence']) && $pred['confidence'] < 50) $warning .= "⚠️ *信心不足*: 仅 {$pred['confidence']}%\n";

        $stmt = $pdo->query("SELECT issue FROM lottery_records ORDER BY issue DESC LIMIT 1");
        $nextIssue = ($stmt->fetch()['issue'] ?? 0) + 1;
        
        $cMap = ['red'=>'红','blue'=>'蓝','green'=>'绿'];
        $sixStr = implode(" ", $pred['six_xiao']); $threeStr = implode(" ", $pred['three_xiao']); 
        $w1 = $cMap[$pred['color_wave']['primary']] ?? ''; $w2 = $cMap[$pred['color_wave']['secondary']] ?? '';
        $bs = $pred['bs'] ?? '-'; $oe = $pred['oe'] ?? '-'; $killed = $pred['killed'] ?? '-';
        
        $timeStr = date("H:i:s");

        $msg = "🧬 *AI 进化监控台*\n";
        $msg .= "------------------\n";
        $msg .= "{$cronStatus}\n{$statusIcon} | 进度 `{$gen}` 代\n{$bar}\n";
        $msg .= "------------------\n";
        $msg .= "🎯 目标：*{$nextIssue}*\n";
        if($warning) $msg .= $warning;
        $msg .= "🚫 *暂杀*: {$killed}\n";
        $msg .= "🦁 *暂六*: {$sixStr}\n";
        $msg .= "🔥 *暂三*: {$threeStr}\n";
        $msg .= "🌊 *波色*: {$w1} / {$w2}\n";
        $msg .= "👊 *主攻*: {$w1}\n";
        $msg .= "⚖️ *属性*: {$bs} / {$oe}\n";
        $msg .= "------------------\n";
        $msg .= "🕒 {$timeStr} (实时)";
        return $msg;
    } else {
        return "⏳ AI 初始化中...\n{$cronStatus}\n请等待...";
    }
}

// ... (后续逻辑保持不变，请复用之前的 content 解析、录入、菜单部分) ...
// 为确保完整性，以下是必须的解析代码
$content = file_get_contents("php://input"); $update = json_decode($content, true); if (!$update) exit('ok');

if (isset($update['callback_query'])) {
    $cq = $update['callback_query'];
    $chatId = $cq['message']['chat']['id']; $msgId = $cq['message']['message_id']; $data = $cq['data'];
    if ($data === 'refresh_progress') {
        answerCallback($cq['id'], "正在获取最新数据...");
        $text = getProgressMsg();
        $randIcons = ['✨','🔥','⚡','🚀','💫']; $text .= " " . $randIcons[rand(0, 4)];
        $keyboard = ['inline_keyboard' => [[['text' => '🔄 立即刷新', 'callback_data' => 'refresh_progress']]]];
        editMsg($chatId, $msgId, $text, $keyboard);
        Settings::set('progress_msg_id', $msgId); Settings::set('progress_chat_id', $chatId);
    }
    exit('ok');
}

$msgType = isset($update['channel_post']) ? 'channel_post' : (isset($update['message']) ? 'message' : '');
if (!$msgType) exit('ok');
$data = $update[$msgType]; $rawText = $data['text'] ?? ($data['caption'] ?? ''); $chatId = $data['chat']['id'];

$text = cleanText($rawText);
preg_match('/第[:：]?\s*(\d+)\s*期/u', $text, $issueMatch);

if (!empty($issueMatch)) {
    $issue = $issueMatch[1]; $textWithoutIssue = str_replace($issue, '', $text);
    preg_match_all('/(?<!\d)(\d{2})(?!\d)/', $textWithoutIssue, $numMatches);
    $validNums = []; foreach ($numMatches[1] as $n) { $val = intval($n); if ($val >= 1 && $val <= 49) $validNums[] = $n; }
    if (count($validNums) >= 7) {
        $nums = array_slice($validNums, 0, 7);
        try {
            $pdo = Db::connect();
            $sql = "INSERT INTO lottery_records (issue, n1, n2, n3, n4, n5, n6, spec) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE n1=?, n2=?, n3=?, n4=?, n5=?, n6=?, spec=?";
            $stmt = $pdo->prepare($sql); $params = array_merge([$issue], $nums, $nums); $stmt->execute($params);
            LotteryLogic::verifyPrediction($issue, $nums[6]);
            startEvolution();
            if ($msgType === 'message') sendMsg($chatId, "✅ *录入成功* - 第 `{$issue}` 期\n🧬 进化引擎已启动...");
            elseif ($msgType === 'channel_post') { $adminId = trim($_ENV['TG_ADMIN_ID']); if ($adminId) sendMsg($adminId, "📢 频道同步第 $issue 期，进化开始"); }
        } catch (Exception $e) {}
        echo 'ok'; exit;
    }
}

if ($msgType === 'message') {
    $senderId = $data['from']['id']; $adminId = trim($_ENV['TG_ADMIN_ID']);
    if ((string)$senderId === (string)$adminId) {
        $mainKeyboard = ['keyboard' => [[['text' => '🔮 查看计算进度'], ['text' => '🚀 发布预测到前端']], [['text' => '📊 查看最新录入'], ['text' => '⚙️ 设置生肖数据']]], 'resize_keyboard' => true, 'persistent_keyboard' => true];
        if ($rawText === '/start') sendMsg($chatId, "👋 系统就绪", $mainKeyboard);
        elseif ($rawText === '🔮 查看计算进度') {
            $msg = getProgressMsg();
            $keyboard = ['inline_keyboard' => [[['text' => '🔄 立即刷新', 'callback_data' => 'refresh_progress']]]];
            $res = sendMsg($chatId, $msg, $keyboard);
            if ($res && isset($res['result']['message_id'])) { Settings::set('progress_msg_id', $res['result']['message_id']); Settings::set('progress_chat_id', $chatId); }
        }
        elseif ($rawText === '🚀 发布预测到前端') {
            $staging = Settings::get('staging_prediction');
            if (!$staging) sendMsg($chatId, "❌ 无数据");
            else {
                Settings::set('public_prediction', $staging); Settings::set('is_evolving', '0');
                $pred = json_decode($staging, true);
                $pdo = Db::connect(); $stmt = $pdo->query("SELECT issue FROM lottery_records ORDER BY issue DESC LIMIT 1"); $nextIssue = ($stmt->fetch()['issue'] ?? 0) + 1;
                $sql = "INSERT IGNORE INTO prediction_history (issue, six_xiao, three_xiao, wave_primary, wave_secondary, strategy_used) VALUES (?, ?, ?, ?, ?, ?)";
                $stmtPred = $pdo->prepare($sql);
                $stmtPred->execute([$nextIssue, implode(',', $pred['six_xiao']), implode(',', $pred['three_xiao']), $pred['color_wave']['primary'], $pred['color_wave']['secondary'], $pred['strategy_used']]);
                require_once 'manual_push.php'; sendMsg($chatId, "✅ **已发布！**");
            }
        }
        elseif ($rawText === '📊 查看最新录入') {
             $pdo = Db::connect(); $stmt = $pdo->query("SELECT * FROM lottery_records ORDER BY issue DESC LIMIT 1"); $row = $stmt->fetch();
             if ($row) sendMsg($chatId, "📅 *最新: 第 {$row['issue']} 期*\n🔢 `{$row['n1']} {$row['n2']} {$row['n3']} {$row['n4']} {$row['n5']} {$row['n6']} + {$row['spec']}`");
        }
        elseif ($rawText === '⚙️ 设置生肖数据') { sendMsg($chatId, "🛠 发 JSON"); }
        elseif (strpos(trim($rawText), '{') === 0) {
             $json = json_decode($rawText, true);
             if ($json && count($json) >= 12) { Settings::set('zodiac_config', $rawText); startEvolution(); sendMsg($chatId, "✅ 配置更新"); }
        }
        elseif (preg_match('/^删除(\d+)$/', $rawText, $delMatch)) {
             $delIssue = $delMatch[1]; $pdo = Db::connect(); $stmt = $pdo->prepare("DELETE FROM lottery_records WHERE issue = ?"); $stmt->execute([$delIssue]);
             if($stmt->rowCount()>0) { startEvolution(); sendMsg($chatId, "🗑 已删除"); } else sendMsg($chatId, "⚠️ 未找到");
        }
    }
}
echo 'ok';
?>