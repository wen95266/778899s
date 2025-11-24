<?php
require_once 'utils/Env.php';
require_once 'utils/Db.php';
require_once 'utils/LotteryLogic.php';
require_once 'utils/Settings.php'; // 引入新类

Env::load(__DIR__ . '/.env');

// CORS 配置
$allowed_origin = $_ENV['FRONTEND_URL'];
header("Access-Control-Allow-Origin: " . $allowed_origin);
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");
header("Content-Type: application/json");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') exit;

$action = $_GET['action'] ?? '';

try {
    $pdo = Db::connect();

    if ($action === 'get_data') {
        // 1. 获取历史记录 (前 50 条)
        $stmt = $pdo->query("SELECT * FROM lottery_records ORDER BY issue DESC LIMIT 50");
        $history = $stmt->fetchAll();

        // 处理历史数据格式
        $processedHistory = [];
        foreach ($history as $row) {
            $nums = [];
            for($i=1; $i<=6; $i++) $nums[] = LotteryLogic::getInfo($row["n$i"]);
            $specInfo = LotteryLogic::getInfo($row['spec']);
            
            $processedHistory[] = [
                'id' => $row['id'],
                'issue' => $row['issue'],
                'normals' => $nums,
                'spec' => $specInfo,
                'created_at' => $row['created_at']
            ];
        }

        // 2. 获取下一期期号
        $nextIssue = isset($history[0]) ? $history[0]['issue'] + 1 : '???';

        // 3. 【核心修改】直接从数据库读取 Bot 生成的预测结果
        // 如果数据库里没有（比如刚初始化），则临时算一个
        $savedPrediction = Settings::get('current_prediction');
        
        if ($savedPrediction) {
            $prediction = json_decode($savedPrediction, true);
        } else {
            // 兜底策略：如果没有存档，临时算一个
            $prediction = LotteryLogic::predict($history);
        }

        echo json_encode([
            'status' => 'success',
            'data' => [
                'history' => $processedHistory,
                'prediction' => $prediction,
                'next_issue' => $nextIssue
            ]
        ]);
    } else {
        echo json_encode(['status' => 'error', 'message' => 'Invalid action']);
    }

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
}
?>