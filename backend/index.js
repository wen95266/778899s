require('dotenv').config();
const express = require('express');
const cors = require('cors');
const db = require('./db');
const startBot = require('./bot'); // 引入 Bot 模块

const app = express();
const PORT = process.env.PORT || 45775;

// --- 启动 API 服务 ---
app.use(cors({
    origin: ['https://88.9526.ip-ddns.com', 'http://localhost:5173'],
    methods: ['GET']
}));
app.use(express.json());

// API 1: 最新一期
app.get('/api/latest', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM lottery_results ORDER BY issue DESC LIMIT 1');
        if (rows.length === 0) return res.json({ success: false, message: '暂无数据' });
        res.json({ success: true, data: rows[0] });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Database error' });
    }
});

// API 2: 历史记录
app.get('/api/history', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT issue, open_date, numbers, special_code, shengxiao FROM lottery_results ORDER BY issue DESC LIMIT 50');
        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Database error' });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 API Server running on port ${PORT}`);
    
    // --- 在服务器启动后，启动 Bot ---
    startBot();
});