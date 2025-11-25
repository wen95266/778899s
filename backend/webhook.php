<?php
require_once 'utils/Env.php';
require_once 'utils/Db.php';
require_once 'utils/LotteryLogic.php';
require_once 'utils/Settings.php';
require_once 'utils/ZodiacManager.php';

Env::load(__DIR__ . '/.env');

ini_set('display_errors', 0);
error_reporting(E_ALL);

function sendMsg($chatId, $text, $keyboard = null) {
    $token = trim($_ENV['TG_BOT_TOKEN']);
    if (!$token) return;
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
    $text = str_replace(["\r", "\n", "\r\n"], ' ', $text);
    $text = preg_replace('/\p{Z}+/u', ' ', $text);
    $text = preg_replace('/\p{C}+/u', ' ', $text);
    $text = preg_replace('/\s+/', ' ', $text);
    return trim($text);
}

function refreshAndSave() {
    try {
        $pdo = Db::connect();
        $stmt = $pdo->query("SELECT * FROM lottery_records ORDER BY issue DESC LIMIT 100");
        $history = $stmt->fetchAll();
        if ($history) {
            $pred = LotteryLogic::predict($history);
            Settings::set('current_prediction', json_encode($pred));
            
            $nextIssue = $history[0]['issue'] + 1;
            $sql = "INSERT IGNORE INTO prediction_history 
                    (issue, six_xiao, three_xiao, wave_primary, wave_secondary, strategy_used) 
                    VALUES (?, ?, ?, ?, ?, ?)";
            $stmtPred = $pdo->prepare($sql);
            $stmtPred->execute([
                $nextIssue, 
                implode(',', $pred['six_xiao']), 
                implode(',', $pred['three_xiao']), 
                $pred['color_wave']['primary'], 
                $pred['color_wave']['secondary'], 
                $pred['strategy_used']
            ]);
            return true;
        }
    } catch (Exception $e) {}
    return false;
}

$content = file_get_contents("php://input");
$update = json_decode($content, true);

$msgType = '';
if (isset($update['channel_post'])) $msgType = 'channel_post';
elseif (isset($update['message'])) $msgType = 'message';
else { echo 'ok'; exit; }

$data = $update[$msgType];
$rawText = $data['text'] ?? ($data['caption'] ?? '');
$chatId = $data['chat']['id'];

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
            
            LotteryLogic::verifyPrediction($issue, $nums[6]);
            refreshAndSave();
            
            if ($msgType === 'message') {
                sendMsg($chatId, "✅ *录入成功*\n第 `{$issue}` 期\n号码: " . implode(" ", $nums));
            } elseif ($msgType === 'channel_post') {
                 $adminId = trim($_ENV['TG_ADMIN_ID']);
                 if ($adminId) sendMsg($adminId, "📢 频道同步成功: 第 $issue 期");
            }
        } catch (Exception $e) {}
        echo 'ok'; exit;
    }
}

if ($msgType === 'message') {
    $senderId = $data['from']['id'];
    $adminId = trim($_ENV['TG_ADMIN_ID']);

    if ((string)$senderId === (string)$adminId) {
        $mainKeyboard = [
            'keyboard' => [
                [['text' => '🔮 查看下期预测'], ['text' => '🚀 推送预测到频道']], 
                [['text' => '📊 查看最新录入'], ['text' => '⚙️ 设置生肖数据']]
            ],
            'resize_keyboard' => true, 'persistent_keyboard' => true
        ];

        if ($rawText === '/start') {
            sendMsg($chatId, "👋 系统就绪", $mainKeyboard);
        }
        elseif ($rawText === '📊 查看最新录入') {
            $pdo = Db::connect();
            $stmt = $pdo->query("SELECT * FROM lottery_records ORDER BY issue DESC LIMIT 1");
            $row = $stmt->fetch();
            if ($row) sendMsg($chatId, "📅 *最新: 第 {$row['issue']} 期*\n🔢 `{$row['n1']} {$row['n2']} {$row['n3']} {$row['n4']} {$row['n5']} {$row['n6']} + {$row['spec']}`");
            else sendMsg($chatId, "📭 无数据");
        }
        elseif ($rawText === '🔮 查看下期预测') {
            $json = Settings::get('current_prediction');
            $pdo = Db::connect();
            $stmt = $pdo->query("SELECT issue FROM lottery_records ORDER BY issue DESC LIMIT 1");
            $row = $stmt->fetch();
            $nextIssue = $row ? $row['issue'] + 1 : '???';
            if ($json) {
                $pred = json_decode($json, true);
                $sxEmoji = ['鼠'=>'🐀','牛'=>'🐂','虎'=>'🐅','兔'=>'🐇','龙'=>'🐉','蛇'=>'🐍','马'=>'🐎','羊'=>'🐏','猴'=>'🐒','鸡'=>'🐓','狗'=>'🐕','猪'=>'🐖'];
                $cMap = ['red'=>'🔴红','blue'=>'🔵蓝','green'=>'🟢绿'];
                
                $sixStr = ""; foreach ($pred['six_xiao'] as $sx) $sixStr .= ($sxEmoji[$sx]??'') . "*$sx* ";
                $threeXiao = $pred['three_xiao'] ?? array_slice($pred['six_xiao'], 0, 3);
                $threeStr = ""; foreach ($threeXiao as $sx) $threeStr .= ($sxEmoji[$sx]??'') . "*$sx* ";
                $w1 = $cMap[$pred['color_wave']['primary']] ?? '';
                $w2 = $cMap[$pred['color_wave']['secondary']] ?? '';
                $bs = $pred['bs'] ?? '算';
                $oe = $pred['oe'] ?? '算';
                
                $killedStr = '';
                if (preg_match('/杀[:：](.+)/u', $pred['strategy_used'], $m)) $killedStr = $m[1];

                $msg = "🕵️ *管理员预览*\n";
                $msg .= "🎯 *第 {$nextIssue} 期*\n";
                if ($killedStr) $msg .= "🚫 *绝杀一肖*：{$killedStr}\n";
                $msg .= "----------------------\n";
                $msg .= "🦁 *六肖*：{$sixStr}\n";
                $msg .= "🔥 *三肖*：{$threeStr}\n";
                $msg .= "🌊 *波色*：{$w1} / {$w2}\n";
                $msg .= "👊 *主攻*：{$w1}\n";
                $msg .= "⚖️ *大小*：{$bs}  |  *单双*：{$oe}";
                sendMsg($chatId, $msg);
            } else sendMsg($chatId, "❌ 无数据");
        }
        elseif ($rawText === '🚀 推送预测到频道') {
            sendMsg($chatId, "🚀 发送中..."); require_once 'manual_push.php'; sendMsg($chatId, "✅ 完成");
        }
        elseif ($rawText === '⚙️ 设置生肖数据') {
            sendMsg($chatId, "🛠 发 JSON");
        }
        elseif (strpos(trim($rawText), '{') === 0) {
            $json = json_decode($rawText, true);
            if ($json && count($json) >= 12) {
                Settings::set('zodiac_config', $rawText);
                refreshAndSave();
                sendMsg($chatId, "✅ 更新成功");
            }
        }
        elseif (preg_match('/^删除(\d+)$/', $rawText, $delMatch)) {
            $delIssue = $delMatch[1];
            $pdo = Db::connect();
            $stmt = $pdo->prepare("DELETE FROM lottery_records WHERE issue = ?");
            $stmt->execute([$delIssue]);
            if($stmt->rowCount()>0) { refreshAndSave(); sendMsg($chatId, "🗑 已删除"); }
            else sendMsg($chatId, "⚠️ 未找到");
        }
    }
}
echo 'ok';
?>
