const { Telegraf, Markup } = require('telegraf');
const db = require('./db');
const { parseLotteryResult, generateSinglePrediction, scorePrediction } = require('./utils');

// --- 全局配置与状态 ---
let AUTO_SEND_ENABLED = true; // 默认开启自动推送
let CALC_TASK = {
    isRunning: false,
    startTime: 0,
    targetDuration: 2 * 60 * 60 * 1000, // 计算时长：2小时
    currentIssue: '',
    bestScore: -1,
    bestPrediction: null,
    iterations: 0
};

// 用户的操作状态
const userStates = {};

// --- 辅助函数：生成主菜单键盘 ---
function getMainMenu() {
    const autoSendIcon = AUTO_SEND_ENABLED ? '✅' : '❌';
    const autoSendText = `${autoSendIcon} 自动推送: ${AUTO_SEND_ENABLED ? '开' : '关'}`;
    
    return Markup.keyboard([
        ['🔮 下期预测', '⏳ 计算进度'],
        ['📊 历史走势', '📡 手动发频道'],
        [autoSendText, '🗑 删除记录'] // 动态按钮
    ]).resize();
}

// --- 辅助函数：格式化预测文案 ---
function formatPredictionText(issue, pred, isFinal = false) {
    const waveMap = { red: '🔴 红波', blue: '🔵 蓝波', green: '🟢 绿波' };
    const title = isFinal ? `🏁 第 ${issue} 期 最终决策` : `🧠 第 ${issue} 期 AI 演算中...`;
    
    // 处理旧数据兼容性
    const mainHead = pred.hot_head !== undefined ? pred.hot_head : '?';
    const defHead = pred.fang_head !== undefined ? pred.fang_head : '?';
    const tails = pred.rec_tails ? pred.rec_tails.join('、') : (pred.hot_tail || '?');
    
    return `
${title}
━━━━━━━━━━━━━━
🎯 **六肖推荐**
${pred.liu_xiao.join(' ')}

🔥 **主攻三肖**
${pred.zhu_san.join(' ')}

🔢 **数据围捕**
头数：主 ${mainHead} 头 | 防 ${defHead} 头
尾数：推荐 ${tails} 尾

🌊 **波色定位**
主：${waveMap[pred.zhu_bo]} | 防：${waveMap[pred.fang_bo]}

⚖️ **形态参考**
${pred.da_xiao} / ${pred.dan_shuang}
━━━━━━━━━━━━━━
${isFinal ? '✅ 数据库已更新 | 等待开奖验证' : `🔄 模型迭代次数: ${CALC_TASK.iterations}`}
`.trim();
}

// --- 核心：启动 Bot ---
function startBot() {
    const bot = new Telegraf(process.env.BOT_TOKEN);
    const ADMIN_ID = parseInt(process.env.ADMIN_ID);
    const CHANNEL_ID = process.env.CHANNEL_ID;

    // --- 后台计算任务循环 ---
    setInterval(async () => {
        if (!CALC_TASK.isRunning) return;

        const now = Date.now();
        // 1. 检查是否超时（计算完成）
        if (now - CALC_TASK.startTime >= CALC_TASK.targetDuration) {
            CALC_TASK.isRunning = false;
            console.log(`[计算完成] 第 ${CALC_TASK.currentIssue} 期`);
            
            // 🔥 自动推送到频道逻辑
            if (AUTO_SEND_ENABLED && CHANNEL_ID && CALC_TASK.bestPrediction) {
                try {
                    const nextIssue = parseInt(CALC_TASK.currentIssue) + 1;
                    const msg = formatPredictionText(nextIssue, CALC_TASK.bestPrediction, true);
                    await bot.telegram.sendMessage(CHANNEL_ID, msg, { parse_mode: 'Markdown' });
                    // 通知管理员
                    bot.telegram.sendMessage(ADMIN_ID, `✅ 第 ${nextIssue} 期计算完毕，已自动推送到频道。`);
                } catch (e) {
                    console.error('自动推送失败:', e);
                }
            }
            return;
        }

        // 2. 执行计算迭代
        try {
            // 获取历史数据用于回测
            const [historyRows] = await db.query('SELECT numbers, special_code, shengxiao FROM lottery_results ORDER BY issue DESC LIMIT 50');
            
            // 每次跑 5 次模拟，取最优
            for(let i=0; i<5; i++) {
                const tempPred = generateSinglePrediction(historyRows);
                const score = scorePrediction(tempPred, historyRows);
                
                // 如果找到更好的策略
                if (score > CALC_TASK.bestScore) {
                    CALC_TASK.bestScore = score;
                    CALC_TASK.bestPrediction = tempPred;
                    
                    // 实时更新数据库
                    const jsonPred = JSON.stringify(tempPred);
                    await db.execute('UPDATE lottery_results SET next_prediction=? WHERE issue=?', [jsonPred, CALC_TASK.currentIssue]);
                }
                CALC_TASK.iterations++;
            }
        } catch (e) { console.error("后台计算出错:", e); }
    }, 3000); // 每3秒执行一次

    // --- 中间件：权限校验 ---
    bot.use(async (ctx, next) => {
        // 允许频道消息（用于自动录入）
        if (ctx.channelPost) {
            if (CHANNEL_ID && String(ctx.chat.id) === String(CHANNEL_ID)) return next();
            return;
        }
        // 仅允许管理员私聊
        if (ctx.from && ctx.from.id === ADMIN_ID) return next();
    });

    bot.start((ctx) => {
        userStates[ctx.from.id] = null;
        ctx.reply('🤖 智能预测系统 V3.1 (Auto-Pilot) 已就绪', getMainMenu());
    });

    // --- 功能 1: 下期预测 (带刷新按钮) ---
    const sendPredictionMsg = async (ctx, isEdit = false) => {
        try {
            const [rows] = await db.query('SELECT * FROM lottery_results ORDER BY issue DESC LIMIT 1');
            if (rows.length === 0) {
                const msg = '暂无数据';
                return isEdit ? ctx.answerCbQuery(msg) : ctx.reply(msg);
            }
            
            const row = rows[0];
            const nextIssue = parseInt(row.issue) + 1;
            let pred = row.next_prediction;
            if (typeof pred === 'string') pred = JSON.parse(pred);

            // 判断是否还在计算中
            const isCalculating = CALC_TASK.isRunning && CALC_TASK.currentIssue == row.issue;
            
            const text = formatPredictionText(nextIssue, pred, !isCalculating);
            const extra = {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                    Markup.button.callback('🔄 刷新预测数据', 'refresh_pred')
                ])
            };

            if (isEdit) {
                // 如果内容没变，Telegram会报错，所以要捕获
                await ctx.editMessageText(text, extra).catch(() => {});
                await ctx.answerCbQuery('已刷新');
            } else {
                await ctx.reply(text, extra);
            }
        } catch (e) { console.error(e); }
    };

    bot.hears('🔮 下期预测', (ctx) => sendPredictionMsg(ctx, false));
    bot.action('refresh_pred', (ctx) => sendPredictionMsg(ctx, true));

    // --- 功能 2: 计算进度 (带刷新按钮) ---
    const sendProgressMsg = async (ctx, isEdit = false) => {
        if (!CALC_TASK.isRunning) {
            const msg = '💤 当前无计算任务，或计算已完成。';
            return isEdit ? ctx.answerCbQuery(msg, { show_alert: true }) : ctx.reply(msg);
        }

        const now = Date.now();
        const percent = Math.min(100, Math.floor(((now - CALC_TASK.startTime) / CALC_TASK.targetDuration) * 100));
        const timeLeft = Math.ceil((CALC_TASK.targetDuration - (now - CALC_TASK.startTime)) / 1000 / 60);

        const text = `
🖥 **AI 深度计算中...**
━━━━━━━━━━━━━━
🎯 目标期号：${parseInt(CALC_TASK.currentIssue) + 1} 期
🔄 模拟演练：${CALC_TASK.iterations} 次
⭐ 最佳评分：${CALC_TASK.bestScore.toFixed(1)}
⏳ 剩余时间：约 ${timeLeft} 分钟
📊 当前进度：${percent}%
━━━━━━━━━━━━━━
_点击下方按钮刷新实时进度_
`.trim();

        const extra = {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                Markup.button.callback('🔄 刷新进度', 'refresh_prog')
            ])
        };

        if (isEdit) {
            await ctx.editMessageText(text, extra).catch(() => {});
            await ctx.answerCbQuery('进度已更新');
        } else {
            await ctx.reply(text, extra);
        }
    };

    bot.hears('⏳ 计算进度', (ctx) => sendProgressMsg(ctx, false));
    bot.action('refresh_prog', (ctx) => sendProgressMsg(ctx, true));

    // --- 功能 3: 切换自动推送开关 ---
    bot.hears(/自动推送/, (ctx) => {
        AUTO_SEND_ENABLED = !AUTO_SEND_ENABLED;
        const status = AUTO_SEND_ENABLED ? '✅ 已开启' : '❌ 已关闭';
        ctx.reply(`配置已更新：自动推送功能 ${status}`, getMainMenu());
    });

    // --- 功能 4: 历史走势 ---
    bot.hears('📊 历史走势', async (ctx) => {
        const [rows] = await db.query('SELECT issue, special_code, shengxiao FROM lottery_results ORDER BY issue DESC LIMIT 10');
        let msg = '📉 **近期特码走势**\n\n';
        rows.forEach(r => msg += `\`${r.issue}期\` : **${r.special_code}** (${r.shengxiao})\n`);
        ctx.reply(msg, { parse_mode: 'Markdown' });
    });

    // --- 功能 5: 手动发送到频道 ---
    bot.hears('📡 手动发频道', async (ctx) => {
        if (!CHANNEL_ID) return ctx.reply('❌ 未配置频道 ID');
        try {
            const [rows] = await db.query('SELECT * FROM lottery_results ORDER BY issue DESC LIMIT 1');
            const row = rows[0];
            const nextIssue = parseInt(row.issue) + 1;
            let pred = row.next_prediction;
            if (typeof pred === 'string') pred = JSON.parse(pred);
            
            // 无论是否计算完成，手动发送都视为最终版
            const msg = formatPredictionText(nextIssue, pred, true);
            await ctx.telegram.sendMessage(CHANNEL_ID, msg, { parse_mode: 'Markdown' });
            ctx.reply('✅ 已手动推送到频道');
        } catch (e) { ctx.reply('❌ 推送失败: ' + e.message); }
    });

    // --- 功能 6: 删除记录 ---
    bot.hears('🗑 删除记录', (ctx) => {
        userStates[ctx.from.id] = 'WAITING_DELETE_ISSUE';
        ctx.reply('⚠️ **进入删除模式**\n请输入期号 (如 2025334)\n发送 "取消" 退出', Markup.removeKeyboard());
    });

    // --- 文本消息监听 (录入 + 删除逻辑) ---
    bot.on(['text', 'channel_post'], async (ctx) => {
        const text = ctx.message?.text || ctx.channelPost?.text;
        if (!text) return;

        // A. 删除模式逻辑
        if (ctx.chat.type === 'private' && userStates[ctx.from.id] === 'WAITING_DELETE_ISSUE') {
            if (text === '取消') {
                userStates[ctx.from.id] = null;
                return ctx.reply('已取消', getMainMenu());
            }
            if (!/^\d+$/.test(text)) return ctx.reply('❌ 请输入纯数字期号');

            try {
                const [result] = await db.execute('DELETE FROM lottery_results WHERE issue = ?', [text]);
                userStates[ctx.from.id] = null;
                if (result.affectedRows > 0) ctx.reply(`✅ 第 ${text} 期已删除`, getMainMenu());
                else ctx.reply(`❌ 找不到第 ${text} 期`, getMainMenu());
            } catch (e) { ctx.reply('数据库错误', getMainMenu()); }
            return;
        }

        // B. 开奖录入逻辑
        const result = parseLotteryResult(text);
        if (result) {
            const { issue, flatNumbers, specialCode, shengxiao } = result;
            
            // 先生成一个初始预测 (防止计算任务没跑完之前查询报错)
            let initialPred = {};
            try {
                const [h] = await db.query('SELECT numbers, special_code, shengxiao FROM lottery_results ORDER BY issue DESC LIMIT 50');
                initialPred = generateSinglePrediction(h);
            } catch(e) { initialPred = generateSinglePrediction([]); }

            const jsonNums = JSON.stringify(flatNumbers);
            const jsonPred = JSON.stringify(initialPred);
            
            try {
                // 存入数据库
                await db.execute(`
                    INSERT INTO lottery_results (issue, numbers, special_code, shengxiao, next_prediction, open_date)
                    VALUES (?, ?, ?, ?, ?, NOW())
                    ON DUPLICATE KEY UPDATE numbers=?, special_code=?, shengxiao=?, next_prediction=?, open_date=NOW()
                `, [issue, jsonNums, specialCode, shengxiao, jsonPred, jsonNums, specialCode, shengxiao, jsonPred]);

                // 🚀 启动/重置 后台计算任务
                CALC_TASK = {
                    isRunning: true,
                    startTime: Date.now(),
                    targetDuration: 2 * 60 * 60 * 1000, // 2小时
                    currentIssue: issue,
                    bestScore: -1,
                    bestPrediction: initialPred,
                    iterations: 0
                };

                const replyMsg = `✅ **第 ${issue} 期录入成功**\n特码：${specialCode} (${shengxiao})\n\n🚀 **头尾数分析模型已启动** (预计2小时)\n计算完成后将自动推送到频道。`;
                
                if (ctx.chat.type === 'private') {
                    ctx.replyWithMarkdown(replyMsg);
                } else {
                    console.log(`频道自动录入: ${issue}期`);
                }
            } catch (err) { console.error(err); }
        }
    });

    bot.launch().catch(err => console.error(err));
    process.once('SIGINT', () => bot.stop('SIGINT'));
    process.once('SIGTERM', () => bot.stop('SIGTERM'));

    return bot;
}

module.exports = startBot;