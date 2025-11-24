<?php
// 允许命令行执行，或者通过 webhook 传参 manual 执行
if (isset($_SERVER['REMOTE_ADDR']) && !in_array($argv[1]??'', ['manual'])) {
    die('Forbidden');
}

require_once __DIR__ . '/utils/Env.php';
require_once __DIR__ . '/utils/Db.php';
require_once __DIR__ . '/utils/LotteryLogic.php';
require_once __DIR__ . '/utils/Settings.php'; // 引入配置

Env::load(__DIR__ . '/.env');

// 1. 检查开关
// 如果是手动触发(manual)，则忽略开关，强制发送
$isManual = ($argv[1] ?? '') === 'manual';
$isEnabled = Settings::get('push_enabled', '0') === '1';

if (!$isEnabled && !$isManual) {
    echo "Push is disabled in settings.\n";
    exit;
}

function broadcastToChannel($text) {
    $token = trim($_ENV['TG_BOT_TOKEN']);
    $channelId = trim($_ENV['TG_CHANNEL_ID']);
    $url = "https://api.telegram.org/bot$token/sendMessage";
    $data = ['chat_id' => $channelId, 'text' => $text, 'parse_mode' => 'Markdown'];
    
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_POST, 1);
    curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query($data));
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    curl_exec($ch);
    curl_close($ch);
}

try {
    $pdo = Db::connect();
    $stmt = $pdo->query("SELECT * FROM lottery_records ORDER BY issue DESC LIMIT 100");
    $history = $stmt->fetchAll();
    
    if (empty($history)) exit;

    $lastIssue = $history[0]['issue'];
    $nextIssue = $lastIssue + 1;

    // 2. 重新生成预测 (确保推送的是最新鲜的)
    $pred = LotteryLogic::predict($history);
    
    // 3. 同时更新数据库里的“前端显示数据”，保持同步
    Settings::set('current_prediction', json_encode($pred));

    // 4. 构建文案
    $sxEmoji = ['鼠'=>'🐀','牛'=>'🐂','虎'=>'🐅','兔'=>'🐇','龙'=>'🐉','蛇'=>'🐍','马'=>'🐎','羊'=>'🐏','猴'=>'🐒','鸡'=>'🐓','狗'=>'🐕','猪'=>'🐖'];
    $sixXiaoStr = "";
    foreach ($pred['six_xiao'] as $sx) {
        $sixXiaoStr .= ($sxEmoji[$sx]??'') . "*{$sx}*  ";
    }
    $colorMap = ['red'=>'🔴 红波', 'blue'=>'🔵 蓝波', 'green'=>'🟢 绿波'];
    $waveStr = $colorMap[$pred['color_wave']];

    $message = "🔮 *第 {$nextIssue} 期 智能算法预测* 🔮\n\n";
    $message .= "🦁 *六肖推荐*：\n{$sixXiaoStr}\n\n";
    $message .= "🌊 *主攻波色*：\n{$waveStr}\n\n";
    $message .= "-------------------------------\n";
    $message .= "⚠️ _数据仅供技术统计，理性参考_";

    broadcastToChannel($message);
    echo "Pushed successfully.\n";

} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
}
?>