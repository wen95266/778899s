const { Telegraf } = require('telegraf');
const db = require('./db');
const { parseLotteryResult, generatePrediction } = require('./utils');

function startBot() {
    const bot = new Telegraf(process.env.BOT_TOKEN);
    const ADMIN_ID = parseInt(process.env.ADMIN_ID);
    const CHANNEL_ID = process.env.CHANNEL_ID; 

    bot.use(async (ctx, next) => {
        // 1. 频道消息
        if (ctx.channelPost) {
            // 调试模式：打印所有频道消息的ID，帮您确认 .env 配置对不对
            // console.log("收到频道消息, ID:", ctx.chat.id);
            if (!CHANNEL_ID || String(ctx.chat.id) === String(CHANNEL_ID)) {
                return next();
            }
            return;
        }
        // 2. 私聊消息
        if (ctx.from && ctx.from.id === ADMIN_ID) {
            return next();
        }
    });

    bot.start((ctx) => ctx.reply('🤖 管理员好，请发送开奖模板测试。'));

    bot.on(['text', 'channel_post'], async (ctx) => {
        const text = ctx.message?.text || ctx.channelPost?.text;
        if (!text) return;

        // 尝试解析
        const result = parseLotteryResult(text);
        
        if (result) {
            // --- 解析成功，开始处理 ---
            const { issue, flatNumbers, specialCode, shengxiao } = result;

            // 提示用户正在计算（如果是私聊）
            if (ctx.chat.type === 'private') {
                await ctx.reply(`⏳ 收到第 ${issue} 期数据，正在计算预测模型...`);
            }

            // 获取历史数据
            let prediction = {};
            try {
                const [historyRows] = await db.query('SELECT numbers, special_code FROM lottery_results ORDER BY issue DESC LIMIT 50');
                const currentData = { numbers: flatNumbers, special_code: specialCode };
                const allData = [currentData, ...historyRows];
                
                prediction = generatePrediction(allData);
            } catch (e) {
                console.error("预测计算失败:", e);
                // 如果数据库挂了，至少保证入库能成
                prediction = generatePrediction([]); 
            }

            // 入库
            const sql = `
                INSERT INTO lottery_results (issue, numbers, special_code, shengxiao, next_prediction, open_date)
                VALUES (?, ?, ?, ?, ?, NOW())
                ON DUPLICATE KEY UPDATE numbers=?, special_code=?, shengxiao=?, next_prediction=?, open_date=NOW()
            `;
            
            const jsonNumbers = JSON.stringify(flatNumbers);
            const jsonPrediction = JSON.stringify(prediction);

            try {
                await db.execute(sql, [
                    issue, jsonNumbers, specialCode, shengxiao, jsonPrediction,
                    jsonNumbers, specialCode, shengxiao, jsonPrediction
                ]);
                
                // 构造成功的回复
                const replyText = `✅ **录入成功！**\n\n第 ${issue} 期\n特码: ${specialCode} (${shengxiao})\n\n🔮 **下期预测已生成**\n六肖: ${prediction.liu_xiao.join(' ')}\n主攻: ${prediction.zhu_bo == 'red'?'红波':prediction.zhu_bo=='blue'?'蓝波':'绿波'}`;

                if (ctx.chat.type === 'private') {
                    ctx.replyWithMarkdown(replyText);
                } else {
                    console.log(`频道录入成功: ${issue}`);
                }

            } catch (err) {
                console.error("SQL Error:", err);
                if (ctx.chat.type === 'private') ctx.reply('❌ 数据库写入失败');
            }

        } else {
            // --- 解析失败的反馈 ---
            // 只有当文本看起来像是要录入数据时（包含"第"和数字），才报错，防止聊天干扰
            if (ctx.chat.type === 'private' && /第.*期/.test(text)) {
                ctx.reply('❌ 格式解析失败。\n请确保包含：\n1. "第xxxx期"\n2. 包含7个两位数字的一行 (如 01 02 ...)\n\n后台日志已打印详情。');
            }
        }
    });

    bot.launch().then(() => console.log('🚀 Bot 启动成功')).catch(e => console.error(e));

    process.once('SIGINT', () => bot.stop('SIGINT'));
    process.once('SIGTERM', () => bot.stop('SIGTERM'));

    return bot;
}

module.exports = startBot;