const { Telegraf } = require('telegraf');
const db = require('./db');
const { parseLotteryResult, generatePrediction } = require('./utils');

// 导出启动函数，而不是直接启动
function startBot() {
    const bot = new Telegraf(process.env.BOT_TOKEN);
    const ADMIN_ID = parseInt(process.env.ADMIN_ID);
    const CHANNEL_ID = process.env.CHANNEL_ID; // 字符串形式比较比较安全

    // --- 中间件：权限控制 ---
    bot.use(async (ctx, next) => {
        // 1. 如果是频道消息
        if (ctx.channelPost) {
            // 校验是不是指定的频道
            if (String(ctx.chat.id) === String(CHANNEL_ID)) {
                return next();
            }
            return; // 忽略其他频道
        }

        // 2. 如果是私聊/群组消息
        if (ctx.from && ctx.from.id === ADMIN_ID) {
            return next();
        }

        // 其它情况（陌生人）不响应
    });

    // --- 命令处理 ---
    bot.start((ctx) => ctx.reply('管理员您好，Bot 已就绪。请转发开奖信息。'));

    // --- 监听文本消息 (包含频道推送 channel_post) ---
    bot.on(['text', 'channel_post'], async (ctx) => {
        const text = ctx.message?.text || ctx.channelPost?.text;
        if (!text) return;

        // 调用工具函数解析
        const result = parseLotteryResult(text);
        
        if (result) {
            const { issue, flatNumbers, specialCode, shengxiao } = result;
            const prediction = generatePrediction();

            const sql = `
                INSERT INTO lottery_results (issue, numbers, special_code, shengxiao, next_prediction)
                VALUES (?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE numbers=?, special_code=?, shengxiao=?, next_prediction=?
            `;
            
            const jsonNumbers = JSON.stringify(flatNumbers);
            const jsonPrediction = JSON.stringify(prediction);

            try {
                await db.execute(sql, [
                    issue, jsonNumbers, specialCode, shengxiao, jsonPrediction,
                    jsonNumbers, specialCode, shengxiao, jsonPrediction
                ]);
                
                // 如果是私聊，回复一下；如果是频道，可以选择回复或者静默
                if (ctx.chat.type === 'private') {
                    ctx.reply(`✅ 第 ${issue} 期录入成功！\n特码: ${specialCode} (${shengxiao})`);
                } else {
                    console.log(`频道自动录入成功: 第 ${issue} 期`);
                }

            } catch (err) {
                console.error(err);
                if (ctx.chat.type === 'private') ctx.reply('❌ 数据库错误');
            }
        } else {
            // 解析失败，仅私聊提示，频道里不说话
            if (ctx.chat.type === 'private') {
                ctx.reply('❓ 无法识别格式，请检查。');
            }
        }
    });

    // 启动
    bot.launch().then(() => {
        console.log('🤖 Telegram Bot 已启动...');
    }).catch(err => console.error('Bot启动失败:', err));

    // 优雅退出处理
    process.once('SIGINT', () => bot.stop('SIGINT'));
    process.once('SIGTERM', () => bot.stop('SIGTERM'));
    
    return bot;
}

module.exports = startBot;