<?php
// backend/functions.php
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/db_operations.php'; // <--- 必须加上这一行！

function json_response($data, $status = 200) {
    http_response_code($status);
    header('Content-Type: application/json');
    echo json_encode($data);
    exit;
}

// 身份验证
function check_auth() {
    if (session_status() === PHP_SESSION_NONE) {
        session_set_cookie_params([
            'lifetime' => 86400 * 7,
            'path' => '/',
            'domain' => '', 
            'secure' => false,
            'httponly' => true,
            'samesite' => 'Lax'
        ]);
        session_start();
    }
    if (!isset($_SESSION['user_id'])) {
        json_response(['status' => 'error', 'message' => '未登录或会话过期'], 401);
    }
    return $_SESSION['user_id'];
}

function login($email, $password) {
    $pdo = get_db_connection();
    $stmt = $pdo->prepare("SELECT id, password_hash, status FROM users WHERE email = ?");
    $stmt->execute([$email]);
    $user = $stmt->fetch();

    if ($user && password_verify($password, $user['password_hash'])) {
        if ($user['status'] === 'banned') json_response(['status' => 'error', 'message' => '账户已封禁'], 403);
        
        if (session_status() === PHP_SESSION_NONE) session_start();
        $_SESSION['user_id'] = $user['id'];
        return ['status' => 'success', 'user' => ['id' => $user['id'], 'email' => $email]];
    }
    return ['status' => 'error', 'message' => '账号或密码错误'];
}

function register($email, $password) {
    $pdo = get_db_connection();
    $stmt = $pdo->prepare("SELECT id FROM users WHERE email = ?");
    $stmt->execute([$email]);
    if ($stmt->fetch()) return ['status' => 'error', 'message' => '邮箱已存在'];

    $hash = password_hash($password, PASSWORD_DEFAULT);
    $stmt = $pdo->prepare("INSERT INTO users (email, password_hash) VALUES (?, ?)");
    if ($stmt->execute([$email, $hash])) {
        return ['status' => 'success', 'message' => '注册成功'];
    }
    return ['status' => 'error', 'message' => '注册失败'];
}

function get_emails($user_id) {
    $pdo = get_db_connection();
    $stmt = $pdo->prepare("SELECT id, status, received_at FROM raw_emails WHERE user_id = ? ORDER BY received_at DESC LIMIT 20");
    $stmt->execute([$user_id]);
    return ['status' => 'success', 'data' => $stmt->fetchAll()];
}

function get_lottery_results() {
    $pdo = get_db_connection();
    $sql = "SELECT r1.* FROM lottery_results r1 
            JOIN (SELECT lottery_type, MAX(id) as max_id FROM lottery_results GROUP BY lottery_type) r2 
            ON r1.id = r2.max_id";
    $stmt = $pdo->query($sql);
    $rows = $stmt->fetchAll();
    
    $data = [];
    $types = ['香港六合彩', '新澳门六合彩', '老澳门六合彩'];
    
    foreach($rows as $row) {
        $row['winning_numbers'] = json_decode($row['winning_numbers']);
        $row['zodiac_signs'] = json_decode($row['zodiac_signs']);
        $row['colors'] = json_decode($row['colors']);
        $data[$row['lottery_type']] = $row;
    }
    // 确保所有类型都有键，方便前端遍历
    foreach($types as $t) {
        if (!isset($data[$t])) $data[$t] = null;
    }
    return ['status' => 'success', 'data' => $data];
}
?>