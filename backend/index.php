<?php
// backend/index.php
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/db_operations.php'; // 显式引入 DB
require_once __DIR__ . '/functions.php';

handle_cors();

$endpoint = $_GET['endpoint'] ?? '';
$input = json_decode(file_get_contents('php://input'), true) ?? [];

try {
    switch ($endpoint) {
        case 'check_session':
            session_start();
            $user = isset($_SESSION['user_id']) ? ['id' => $_SESSION['user_id']] : null;
            json_response(['status' => 'success', 'isAuthenticated' => !!$user, 'user' => $user]);
            break;

        case 'login':
            json_response(login($input['email'] ?? '', $input['password'] ?? ''));
            break;

        case 'register':
            json_response(register($input['email'] ?? '', $input['password'] ?? ''));
            break;
            
        case 'logout':
            session_start();
            session_destroy();
            json_response(['status' => 'success']);
            break;

        case 'get_emails':
            $uid = check_auth();
            json_response(get_emails($uid));
            break;

        case 'get_lottery_results':
            json_response(get_lottery_results());
            break;

        default:
            json_response(['status' => 'error', 'message' => 'API Endpoint Not Found'], 404);
    }
} catch (Exception $e) {
    json_response(['status' => 'error', 'message' => $e->getMessage()], 500);
}
?>