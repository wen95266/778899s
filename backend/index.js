require('dotenv').config();
const express = require('express');
const cors = require('cors');
const db = require('./db');
const startBot = require('./bot');

const app = express();
const PORT = process.env.PORT || 45775;

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

// API 2: 历史记录 (已移除 LIMIT限制，获取全部数据)
app.get('/api/history', async (req, res) => {
    try {
        // 这里去掉了 LIMIT 50，改为获取所有记录
        // 注意：select * 可能会拿太多数据，建议按需字段获取，但为了兼容 next_prediction 我们这里拿全
        const [rows] = await db.query('SELECT * FROM lottery_results ORDER BY issue DESC');
        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Database error' });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 API Server running on port ${PORT}`);
    startBot();
});
