require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Telegraf } = require('telegraf');
const db = require('./db');

const app = express();
const bot = new Telegraf(process.env.BOT_TOKEN);
const PORT = process.env.PORT || 45775;
const ADMIN_ID = parseInt(process.env.ADMIN_ID);

// --- 中间件 ---
app.use(cors({
    origin: ['https://88.9526.ip-ddns.com', 'http://localhost:5173'], // 允许前端域名和本地调试
    methods: ['GET']
}));
app.use(express.json());

// --- 工具函数：生成简单的预测号码 (随机5个不重复的1-49) ---
function generatePrediction() {
    const nums = new Set();
    while(nums.size < 6) {
        nums.add(Math.floor(Math.random() * 49) + 1);
    }
    return Array.from(nums).sort((a, b) => a - b);
}

// --- API 路由 ---

// 1. 获取最新一期和预测
app.get('/api/latest', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM lottery_results ORDER BY issue DESC LIMIT 1');
        if (rows.length === 0) return res.json({ success: false, message: '暂无数据' });
        res.json({ success: true, data: rows[0] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: 'Database error' });
    }
});

// 2. 获取历史记录 (最近50期)
app.get('/api/history', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT issue, open_date, numbers, special_code, shengxiao FROM lottery_results ORDER BY issue DESC LIMIT 50');
        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Database error' });
    }
});

// --- Telegram Bot 逻辑 ---

// 权限验证中间件
bot.use(async (ctx, next) => {
    if (ctx.from && ctx.from.id === ADMIN_ID) {
        return next();
    }
    return ctx.reply('⛔ 您没有权限操作此机器人。');
});

bot.start((ctx) => ctx.reply('欢迎管理员。发送格式：\n/add 期号 平1 平2 平3 平4 平5 平6 特码\n例如：/add 2024001 01 02 03 04 05 06 07'));

// 录入命令: /add 2024001 01 02 03 04 05 06 07
bot.command('add', async (ctx) => {
    try {
        const args = ctx.message.text.split(' ').slice(1);
        if (args.length !== 8) {
            return ctx.reply('❌ 格式错误！需要8个参数：期号 + 6个平码 + 1个特码');
        }

        const issue = args[0];
        const numbers = args.slice(1, 7).map(Number); // 平码数组
        const special = Number(args[7]);

        // 生成下期预测
        const prediction = generatePrediction();

        // 简单的生肖/单双描述 (示例，可根据算法扩展)
        const desc = special % 2 === 0 ? "双" : "单"; 

        // 存入数据库
        const sql = `
            INSERT INTO lottery_results (issue, numbers, special_code, shengxiao, next_prediction)
            VALUES (?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE numbers=?, special_code=?, shengxiao=?, next_prediction=?
        `;
        
        const jsonNumbers = JSON.stringify(numbers);
        const jsonPrediction = JSON.stringify(prediction);

        await db.execute(sql, [
            issue, jsonNumbers, special, desc, jsonPrediction, // INSERT
            jsonNumbers, special, desc, jsonPrediction         // UPDATE
        ]);

        ctx.reply(`✅ 第 ${issue} 期录入成功！\n特码：${special}\n下期预测：${prediction.join(', ')}`);

    } catch (err) {
        console.error(err);
        ctx.reply('❌ 数据库错误：' + err.message);
    }
});

// 启动 Bot (使用轮询模式，无需配置 Webhook)
bot.launch().then(() => {
    console.log('Bot started');
}).catch(err => console.error('Bot launch failed', err));

// 启动 Express
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

// 优雅退出
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));