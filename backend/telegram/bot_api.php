<?php
// backend/telegram/bot_api.php

function apiRequest($method, $data = []) {
    $token = config('TELEGRAM_BOT_TOKEN');
    if (!$token) return false;
    
    $url = "https://api.telegram.org/bot{$token}/{$method}";
    
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_POST, 1);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
    curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 5);
    $result = curl_exec($ch);
    curl_close($ch);
    
    return json_decode($result, true);
}

function sendTelegramMessage($chatId, $text, $keyboard = null) {
    $data = [
        'chat_id' => $chatId,
        'text' => $text,
        'parse_mode' => 'HTML',
        'disable_web_page_preview' => true
    ];
    if ($keyboard) $data['reply_markup'] = $keyboard;
    return apiRequest('sendMessage', $data);
}

function editMessageText($chatId, $messageId, $text, $keyboard = null) {
    $data = [
        'chat_id' => $chatId,
        'message_id' => $messageId,
        'text' => $text,
        'parse_mode' => 'HTML'
    ];
    if ($keyboard) $data['reply_markup'] = $keyboard;
    return apiRequest('editMessageText', $data);
}

function answerCallbackQuery($callbackQueryId, $text = null, $showAlert = false) {
    $data = [
        'callback_query_id' => $callbackQueryId,
        'show_alert' => $showAlert
    ];
    if ($text) $data['text'] = $text;
    return apiRequest('answerCallbackQuery', $data);
}

// 显示主菜单（底部键盘）
function showMainMenu($chatId, $text = "👋 请选择操作：") {
    $keyboard = [
        'keyboard' => [
            [['text' => '👥 用户管理'], ['text' => '🎲 最新开奖']],
            [['text' => '📊 系统状态'], ['text' => '🛠 手动解析']]
        ],
        'resize_keyboard' => true,
        'persistent' => true
    ];
    sendTelegramMessage($chatId, $text, $keyboard);
}

// 辅助：获取用户列表的行内键盘
function getUserListKeyboard($page = 1) {
    $pdo = get_db_connection();
    $limit = 5; // 每页显示5个
    $offset = ($page - 1) * $limit;
    
    // 获取用户
    $stmt = $pdo->prepare("SELECT id, email, created_at FROM users ORDER BY id DESC LIMIT ? OFFSET ?");
    $stmt->bindParam(1, $limit, PDO::PARAM_INT);
    $stmt->bindParam(2, $offset, PDO::PARAM_INT);
    $stmt->execute();
    $users = $stmt->fetchAll();
    
    // 获取总数
    $total = $pdo->query("SELECT COUNT(*) FROM users")->fetchColumn();
    $totalPages = ceil($total / $limit);
    
    $buttons = [];
    foreach ($users as $user) {
        // 每一行一个用户，点击删除
        $buttons[] = [[
            'text' => "🗑 删除: " . $user['email'],
            'callback_data' => "del_user:{$user['id']}:{$page}"
        ]];
    }
    
    // 翻页按钮
    $navRow = [];
    if ($page > 1) $navRow[] = ['text' => '⬅️ 上一页', 'callback_data' => "users_page:" . ($page - 1)];
    $navRow[] = ['text' => "第 {$page}/{$totalPages} 页", 'callback_data' => "ignore"];
    if ($page < $totalPages) $navRow[] = ['text' => '下一页 ➡️', 'callback_data' => "users_page:" . ($page + 1)];
    
    if (!empty($navRow)) $buttons[] = $navRow;
    $buttons[] = [['text' => '🔄 刷新列表', 'callback_data' => "users_page:{$page}"]];

    return ['inline_keyboard' => $buttons];
}
?>