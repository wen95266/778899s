<?php
// backend/telegram/bot_api.php

function sendTelegramMessage($chatId, $text, $keyboard = null) {
    $token = config('TELEGRAM_BOT_TOKEN');
    if (!$token) return;

    $data = [
        'chat_id' => $chatId,
        'text' => $text,
        'parse_mode' => 'HTML',
        'disable_web_page_preview' => true
    ];

    if ($keyboard) {
        $data['reply_markup'] = json_encode($keyboard);
    }

    $url = "https://api.telegram.org/bot{$token}/sendMessage";
    
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_POST, 1);
    curl_setopt($ch, CURLOPT_POSTFIELDS, $data);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 5);
    curl_exec($ch);
    curl_close($ch);
}

function showAdminMenu($chatId) {
    $keyboard = [
        'keyboard' => [
            [['text' => '🗑 删除用户'], ['text' => '📊 系统状态']],
            [['text' => '🔄 强制刷新开奖'], ['text' => '❓ 帮助']]
        ],
        'resize_keyboard' => true,
        'one_time_keyboard' => false
    ];
    sendTelegramMessage($chatId, "👋 管理员控制台已就绪，请选择操作：", $keyboard);
}

function handleDeleteUser($email) {
    $pdo = get_db_connection();
    
    // 检查用户是否存在
    $stmt = $pdo->prepare("SELECT id FROM users WHERE email = ?");
    $stmt->execute([trim($email)]);
    $user = $stmt->fetch();

    if (!$user) {
        return "❌ 未找到邮箱为 {$email} 的用户。";
    }

    // 删除用户 (外键约束会自动删除 raw_emails, parsed_bets 等)
    $stmt = $pdo->prepare("DELETE FROM users WHERE id = ?");
    $stmt->execute([$user['id']]);

    return "✅ 用户 {$email} (ID: {$user['id']}) 及其所有数据已彻底删除。";
}
?>