<?php
require_once 'utils/Env.php';
require_once 'utils/Db.php';
require_once 'utils/LotteryLogic.php';
require_once 'utils/Settings.php';
require_once 'utils/ZodiacManager.php';

Env::load(__DIR__ . '/.env');
ini_set('display_errors', 0); error_reporting(E_ALL);

function sendMsg($chatId, $text, $keyboard = null) {
    $token = trim($_ENV['TG_BOT_TOKEN']); if (!$token) return false;
    $url = "https://api.telegram.org/bot$token/sendMessage";
    $data = ['chat_id' => $chatId, 'text' => $text, 'parse_mode' => 'Markdown'];
    if ($keyboard) $data['reply_markup'] = json_encode($keyboard);
    $ch = curl_init(); curl_setopt($ch, CURLOPT_URL, $url); curl_setopt($ch, CURLOPT_POST, 1); curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query($data)); curl_setopt($ch, CURLOPT_RETURNTRANSFER, true); $res = curl_exec($ch); curl_close($ch); return json_decode($res, true);
}

function cleanText($text) {
    $text = urldecode($text);
    $text = str_replace(["\r", "\n", "\r\n"], ' ', $text);
    $text = preg_replace('/\p{Z}+/u', ' ', $text);
    $text = preg_replace('/\p{C}+/u', ' ', $text);
    $text = preg_replace('/\s+/', ' ', $text);
    return trim($text);
}

function startEvolution() {
    Settings::set('is_evolving', '1'); Settings::set('evolution_gen', '0'); Settings::set('evolution_population', ''); 
    $url = "https://" . $_SERVER['HTTP_HOST'] . "/backend/cron_evolve.php";
    $ctx = stream_context_create(['http' => ['timeout' => 1]]); @file_get_contents($url, false, $ctx);
}

function getProgressMsg() {
    $gen = intval(Settings::get('evolution_gen'));
    $json = Settings::get('staging_prediction');
    $cMap = ['red'=>'红','blue'=>'蓝','green'=>'绿'];

    if ($json) {
        $pred = json_decode($json, true);
        $score = 0; if (isset($pred['strategy_used']) && preg_match('/分:([\d\.]+)/', $pred['strategy_used'], $m)) $score = $m[1];
        
        $pdo = Db::connect();
        $stmt = $pdo->query("SELECT issue FROM lottery_records ORDER BY issue DESC LIMIT 1");
        $nextIssue = ($stmt->fetch()['issue'] ?? 0) + 1;
        
        $msg = "🧬 *AI 深度进化监控*\n";
        $msg .= "📊 *进度*: 第 `{$gen}` 代 (50期回测)\n";
        $msg .= "🧠 *适应度*: {$score}\n";
        $msg .= "----------------------\n";
        $msg .= "🎯 *目标*: 第 {$nextIssue} 期\n";
        $msg .= "🚫 *杀肖*: {$pred['killed']}\n";
        $msg .= "🦁 *六肖*: " . implode(" ", $pred['six_xiao']) . "\n";
        $msg .= "🔥 *三肖*: " . implode(" ", $pred['three_xiao']) . "\n";
        $msg .= "🌊 *波色*: {$cMap[$pred['color_wave']['primary']]} / {$cMap[$pred['color_wave']['secondary']]}\n";
        $msg .= "👊 *主攻*: {$cMap[$pred['color_wave']['primary']]}\n";
        $msg .= "⚖️ *属性*: {$pred['bs']} / {$pred['oe']}\n";
        $msg .= "----------------------\n";
        $msg .= "🕒 " . date("H:i:s");
        return $msg;
    } else {
        return "⏳ AI 初始化中... 请稍候";
    }
}

$content = file_get_contents("php://input");
$update = json_decode($content, true);
if (!$update) exit('ok');

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
            if ($msgType === 'message') sendMsg($chatId, "✅ *录入成功* - 第 `{$issue}` 期\n🧬 进化已启动...");
            elseif ($msgType === 'channel_post') { $adminId = trim($_ENV['TG_ADMIN_ID']); if ($adminId) sendMsg($adminId, "📢 频道同步，开始计算"); }
        } catch (Exception $e) {}
        echo 'ok'; exit;
    }
}

if ($msgType === 'message') {
    $senderId = $data['from']['id']; $adminId = trim($_ENV['TG_ADMIN_ID']);
    if ((string)$senderId === (string)$adminId) {
        $mainKeyboard = ['keyboard' => [[['text' => '🔮 查看计算进度'], ['text' => '🚀 发布预测到前端']], [['text' => '📊 查看最新录入'], ['text' => '⚙️ 设置生肖数据']]], 'resize_keyboard' => true, 'persistent_keyboard' => true];

        if ($rawText === '/start') { sendMsg($chatId, "👋 系统就绪", $mainKeyboard); }
        elseif ($rawText === '🔮 查看计算进度') {
            $msg = getProgressMsg();
            $res = sendMsg($chatId, $msg); // 不带按钮，纯展示，靠cron更新
            if ($res && isset($res['result']['message_id'])) {
                Settings::set('progress_msg_id', $res['result']['message_id']);
                Settings::set('progress_chat_id', $chatId);
            }
        }
        elseif ($rawText === '🚀 发布预测到前端') {
            $staging = Settings::get('staging_prediction');
            if (!$staging) sendMsg($chatId, "❌ 无数据");
            else {
                Settings::set('public_prediction', $staging); Settings::set('is_evolving', '0');
                $pred = json_decode($staging, true);
                $pdo = Db::connect(); $stmt = $pdo->query("SELECT issue FROM lottery_records ORDER BY issue DESC LIMIT 1");
                $nextIssue = ($stmt->fetch()['issue'] ?? 0) + 1;
                $sql = "INSERT IGNORE INTO prediction_history (issue, six_xiao, three_xiao, wave_primary, wave_secondary, strategy_used) VALUES (?, ?, ?, ?, ?, ?)";
                $stmtPred = $pdo->prepare($sql);
                $stmtPred->execute([$nextIssue, implode(',', $pred['six_xiao']), implode(',', $pred['three_xiao']), $pred['color_wave']['primary'], $pred['color_wave']['secondary'], $pred['strategy_used']]);
                require_once 'manual_push.php';
                sendMsg($chatId, "✅ **已发布！**");
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