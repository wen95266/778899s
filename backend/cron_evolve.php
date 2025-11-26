<?php
ignore_user_abort(true);
set_time_limit(60);

require_once 'utils/Env.php';
require_once 'utils/Db.php';
require_once 'utils/LotteryLogic.php';
require_once 'utils/Settings.php';
require_once 'utils/ZodiacManager.php';

Env::load(__DIR__ . '/.env');

if (Settings::get('is_evolving') !== '1') exit;

function editMsgFromCron($chatId, $msgId, $text) {
    $token = trim($_ENV['TG_BOT_TOKEN']);
    $url = "https://api.telegram.org/bot$token/editMessageText";
    $data = ['chat_id' => $chatId, 'message_id' => $msgId, 'text' => $text, 'parse_mode' => 'Markdown'];
    // 移除了 inline keyboard
    $ch = curl_init(); curl_setopt($ch, CURLOPT_URL, $url); curl_setopt($ch, CURLOPT_POST, 1); curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query($data)); curl_setopt($ch, CURLOPT_RETURNTRANSFER, true); curl_exec($ch); curl_close($ch);
}

function getProgressMsg($gen, $pred, $isEvolving) {
    $pdo = Db::connect();
    $stmt = $pdo->query("SELECT issue FROM lottery_records ORDER BY issue DESC LIMIT 1");
    $nextIssue = ($stmt->fetch()['issue'] ?? 0) + 1;
    
    $score = 0;
    if (isset($pred['strategy_used']) && preg_match('/分:([\d\.]+)/', $pred['strategy_used'], $m)) $score = $m[1];
    
    $cMap = ['red'=>'红','blue'=>'蓝','green'=>'绿'];
    
    // 构建纯文字报表
    $msg = "🧬 *深度进化中...*\n";
    $msg .= "📊 *进度*: 第 `{$gen}` 代 (50期深度回测)\n";
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
}

try {
    $pdo = Db::connect();
    $stmt = $pdo->query("SELECT * FROM lottery_records ORDER BY issue DESC LIMIT 100");
    $history = $stmt->fetchAll();
    if (!$history) exit;

    $popJson = Settings::get('evolution_population');
    $gen = intval(Settings::get('evolution_gen'));
    
    if ($popJson) {
        $population = json_decode($popJson, true);
    } else {
        // 种群数量设为 15 (配合50期回测)
        $population = [];
        for($i=0; $i<15; $i++) $population[] = ['w_trend'=>rand(0,100)/10, 'w_omiss'=>rand(0,100)/10, 'w_link'=>rand(0,100)/10, 'w_tail'=>rand(0,100)/10, 'w_head'=>rand(0,100)/10, 'w_color'=>rand(0,100)/10, 'w_wuxing'=>rand(0,100)/10, 'w_hist'=>rand(0,100)/10, 'w_flat'=>rand(0,100)/10, 'w_off'=>rand(0,100)/10, 'fitness'=>0];
    }

    $start = time();
    $batchCount = 0;
    // 死循环跑满50秒
    while(time() - $start < 50) {
        $res = LotteryLogic::evolveStep($history, $population);
        $population = $res['population']; 
        $bestGene = $res['best']; 
        $gen++;
        $batchCount++;
    }

    Settings::set('evolution_population', json_encode($population));
    Settings::set('evolution_gen', $gen);
    $pred = LotteryLogic::generateResult($history, $bestGene, $gen);
    Settings::set('staging_prediction', json_encode($pred));
    Settings::set('last_cron_run', time());

    // 【修改点】每10代更新一次，因为现在一代算很久，10代已经很久了
    if ($gen % 10 == 0) {
        $chatId = Settings::get('progress_chat_id');
        $msgId = Settings::get('progress_msg_id');
        if ($chatId && $msgId) editMsgFromCron($chatId, $msgId, getProgressMsg($gen, $pred, '1'));
    }

} catch (Exception $e) { echo $e->getMessage(); }
?>