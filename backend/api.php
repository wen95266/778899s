<?php
require_once 'utils/Env.php';
require_once 'utils/Db.php';
require_once 'utils/ZodiacManager.php';
require_once 'utils/LotteryLogic.php';
require_once 'utils/Settings.php';

Env::load(__DIR__ . '/.env');

$allowed_origin = $_ENV['FRONTEND_URL'];
header("Access-Control-Allow-Origin: " . $allowed_origin);
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");
header("Content-Type: application/json");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') exit;

$action = $_GET['action'] ?? '';

try {
    $pdo = Db::connect();

    // 1. 获取主数据 (历史 + 预测)
    if ($action === 'get_data') {
        $limit = isset($_GET['limit']) ? intval($_GET['limit']) : 50;
        if ($limit > 500) $limit = 500;
        if ($limit < 10) $limit = 10;

        $stmt = $pdo->prepare("SELECT * FROM lottery_records ORDER BY issue DESC LIMIT ?");
        $stmt->bindValue(1, $limit, PDO::PARAM_INT);
        $stmt->execute();
        $history = $stmt->fetchAll();

        $processedHistory = [];
        foreach ($history as $row) {
            $nums = [];
            for($i=1; $i<=6; $i++) $nums[] = ZodiacManager::getInfo($row["n$i"]);
            $specInfo = ZodiacManager::getInfo($row['spec']);
            $processedHistory[] = [
                'id' => $row['id'],
                'issue' => $row['issue'],
                'normals' => $nums,
                'spec' => $specInfo,
                'created_at' => $row['created_at']
            ];
        }

        $savedJson = Settings::get('current_prediction');
        if ($savedJson) {
            $prediction = json_decode($savedJson, true);
        } else {
            $fullStmt = $pdo->query("SELECT * FROM lottery_records ORDER BY issue DESC LIMIT 100");
            $fullHistory = $fullStmt->fetchAll();
            $prediction = LotteryLogic::predict($fullHistory);
            Settings::set('current_prediction', json_encode($prediction));
        }

        $countStmt = $pdo->query("SELECT COUNT(*) FROM lottery_records");
        $totalCount = $countStmt->fetchColumn();
        
        $nextIssue = isset($history[0]) ? $history[0]['issue'] + 1 : '???';

        echo json_encode([
            'status' => 'success',
            'data' => [
                'history' => $processedHistory,
                'prediction' => $prediction,
                'next_issue' => $nextIssue,
                'total_count' => $totalCount
            ]
        ]);
    } 
    // 2. 【新增】获取预测历史战绩
    elseif ($action === 'get_history') {
        // 只返回已开奖的(即result_zodiac有值)
        $stmt = $pdo->query("SELECT * FROM prediction_history WHERE result_zodiac IS NOT NULL ORDER BY issue DESC LIMIT 20");
        $list = $stmt->fetchAll();
        echo json_encode(['status'=>'success', 'data'=>$list]);
    }
    else {
        echo json_encode(['status' => 'error', 'message' => 'Invalid action']);
    }

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
}
?>
