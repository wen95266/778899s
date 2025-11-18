<?php
// 文件路径: backend/lib/TelegramBot.php
class TelegramBot {
    private $token;
    private $api_url = "https://api.telegram.org/bot";

    public function __construct($token) {
        $this->token = $token;
    }

    // 这是你已有的方法，不用动
    public function sendMessage($chat_id, $text) {
        $data = [
            'chat_id' => $chat_id,
            'text' => $text,
            'parse_mode' => 'Markdown'
        ];
        return $this->sendRequest("sendMessage", $data);
    }

    // --- 新增的方法 ---
    /**
     * 发送带自定义键盘的消息
     * @param int $chat_id 接收者ID
     * @param string $text 消息文本
     * @param array $keyboard 键盘布局数组
     */
    public function sendMessageWithKeyboard($chat_id, $text, $keyboard) {
        $reply_markup = [
            'keyboard' => $keyboard,
            'resize_keyboard' => true, // 让键盘大小自适应
            'one_time_keyboard' => false // false表示键盘会一直显示，除非用户手动关闭
        ];

        $data = [
            'chat_id' => $chat_id,
            'text' => $text,
            'parse_mode' => 'Markdown',
            'reply_markup' => json_encode($reply_markup)
        ];

        return $this->sendRequest("sendMessage", $data);
    }

    // --- 新增一个私有方法来统一处理 API 请求 ---
    private function sendRequest($method, $data) {
        $url = $this->api_url . $this->token . "/" . $method;

        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, $url);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query($data));
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        
        $response = curl_exec($ch);
        $error = curl_error($ch);
        curl_close($ch);

        if ($error) {
            // 在生产环境中，应该记录日志而不是直接输出
            error_log("Telegram API Error: " . $error);
            return false;
        }
        return json_decode($response, true);
    }
}