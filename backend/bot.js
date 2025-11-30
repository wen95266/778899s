const { Telegraf, Markup } = require('telegraf');
const db = require('./db');
const { parseLotteryResult, generateSinglePrediction, scorePrediction } = require('./utils');

// --- 全局配置 ---
let AUTO_SEND_ENABLED = true;

// 核心状态机
let CALC_TASK = {
    isRunning: false,
    phase: 1, 
    startTime: 0,
    targetDuration: 0,
    targetIterations: 0,
    currentIssue: '',
    bestScore: -1,
    bestPrediction: null,
    iterations: 0,
    historyCache: null
};

const userStates = {};

// --- 辅助函数 ---
function getMainMenu() {
    const autoSendIcon = AUTO_SEND_ENABLED ? '✅' : '❌';
    const autoSendText = `${autoSendIcon} 自动推送: ${AUTO_SEND_ENABLED ? '开' : '关'}`;
    
    return Markup.keyboard([
        ['🔮 下期预测', '⏳ 计算进度'],
        ['🔭 深度演算', '📊 历史走势'],
        ['📡 手动发频道(深度)', autoSendText], 
        ['🗑 删除记录']
    ]).resize();
}

// 格式化文案
function formatPredictionText(issue, pred, isFinalOrTitle = false) {
    const waveMap = { red: '🔴 红波', blue: '🔵 蓝波', green: '🟢 绿波' };
    
    let title = '';
    if (typeof isFinalOrTitle === 'string') {
        title = isFinalOrTitle;
    } else {
        title = isFinalOrTitle ? `🏁 第 ${issue} 期 最终决策` : `🧠 第 ${issue} 期 AI 演算中...`;
    }
    
    const mainHead = pred.hot_head !== undefined ? pred.hot_head : '?';
    const defHead = pred.fang_head !== undefined ? pred.fang_head : '?';
    const tails = pred.rec_tails ? pred.rec_tails.join('、') : (pred.hot_tail || '?');
    const safeJoin = (arr) => arr ? arr.join(' ') : '?';
    
    // 格式化一肖一码阵
    let zodiacGrid = '';
    if (pred.zodiac_one_code && Array.isArray(pred.zodiac_one_code)) {
        let lines = [];
        let currentLine = [];
        pred.zodiac_one_code.forEach((item, index) => {
            const numStr = String(item.num).padStart(2, '0');
            currentLine.push(`${item.zodiac}[${numStr}]`);
            if ((index + 1) % 3 === 0) {
                lines.push(currentLine.join('  '));
                currentLine = [];
            }
        });
        if (currentLine.length > 0) lines.push(currentLine.join('  '));
        zodiacGrid = lines.join('\n');
    } else {
        zodiacGrid = '数据计算中...';
    }

    return `
${title}
━━━━━━━━━━━━━━
🦁 **全肖一码阵** (重点推荐)
${zodiacGrid}

🎯 **六肖推荐**
${safeJoin(pred.liu_xiao)}

🔥 **主攻三肖**
${safeJoin(pred.zhu_san)}

🔢 **数据围捕**
头数：主 ${mainHead} 头 | 防 ${defHead} 头
尾数：推荐 ${tails} 尾

🌊 **波色定位**
主：${waveMap[pred.zhu_bo]} | 防：${waveMap[pred.fang_bo]}

⚖️ **形态参考**
${pred.da_xiao} / ${pred.dan_shuang}
━━━━━━━━━━━━━━
${typeof isFinalOrTitle === 'boolean' && isFinalOrTitle ? '✅ 数据库已更新 | 等待开奖验证' : `🔄 模型迭代次数: ${CALC_TASK.iterations}`}
`.trim();
}

// --- Bot 主逻辑 ---
function startBot() {
    const bot = new Telegraf(process.env.BOT_TOKEN);
    const ADMIN_ID = parseInt(process.env.ADMIN_ID);
    const CHANNEL_ID = process.env.CHANNEL_ID;

    // --- 后台计算任务循环 ---
    setInterval(async () => {
        if (!CALC_TASK.isRunning) return;

        const now = Date.now();
        const timeElapsed = now - CALC_TASK.startTime;
        
        // 判定条件：时间到达 AND 次数到达
        const isTimeUp = timeElapsed >= CALC_TASK.targetDuration;
        const isIterUp = CALC_TASK.iterations >= CALC_TASK.targetIterations;

        if (isTimeUp && isIterUp) {
            CALC_TASK.isRunning = false;
            console.log(`[计算完成] 第 ${CALC_TASK.currentIssue} 期 (Phase ${CALC_TASK.phase}) - 最终迭代: ${CALC_TASK.iterations}`);
            
            try {
                const nextIssue = parseInt(CALC_TASK.currentIssue) + 1;
                const jsonPred = JSON.stringify(CALC_TASK.bestPrediction);

                // Phase 1 (基础) 完成
                if (CALC_TASK.phase === 1) {
                    await db.execute('UPDATE lottery_results SET next_prediction=? WHERE issue=?', [jsonPred, CALC_TASK.currentIssue]);
                    
                    if (AUTO_SEND_ENABLED && CHANNEL_ID && CALC_TASK.bestPrediction) {
                        const msg = formatPredictionText(nextIssue, CALC_TASK.bestPrediction, true);
                        await bot.telegram.sendMessage(CHANNEL_ID, msg, { parse_mode: 'Markdown' });
                        bot.telegram.sendMessage(ADMIN_ID, `✅ 第 ${nextIssue} 期 (基础版) 计算完毕 (迭代${CALC_TASK.iterations}次)，已自动推送频道。`);
                    }
                } 
                // Phase 2 (深度) 完成
                else if (CALC_TASK.phase === 2) {
                    await db.execute('UPDATE lottery_results SET deep_prediction=? WHERE issue=?', [jsonPred, CALC_TASK.currentIssue]);
                    
                    bot.telegram.sendMessage(ADMIN_ID, `✅ 第 ${nextIssue} 期 **深度计算** 已完成！\n共迭代 ${CALC_TASK.iterations} 次\n请点击下方按钮查看或手动发送。`, {
                        parse_mode: 'Markdown',
                        ...Markup.inlineKeyboard([
                            Markup.button.callback('👁️ 立即查看结果', 'show_deep_final')
                        ])
                    });
                }
            } catch (e) { console.error('任务完成处理失败:', e); }
            return;
        }

        // --- 执行计算 ---
        try {
            if (!CALC_TASK.historyCache) {
                const [rows] = await db.query('SELECT numbers, special_code, shengxiao FROM lottery_results ORDER BY issue DESC LIMIT 50');
                CALC_TASK.historyCache = rows;
            }
            
            for(let i=0; i<100; i++) {
                const tempPred = generateSinglePrediction(CALC_TASK.historyCache);
                const score = scorePrediction(tempPred, CALC_TASK.historyCache);
                
                if (score > CALC_TASK.bestScore) {
                    CALC_TASK.bestScore = score;
                    CALC_TASK.bestPrediction = tempPred;
                    
                    if (i === 99) { 
                        const jsonPred = JSON.stringify(tempPred);
                        if (CALC_TASK.phase === 1) await db.execute('UPDATE lottery_results SET next_prediction=? WHERE issue=?', [jsonPred, CALC_TASK.currentIssue]);
                        else if (CALC_TASK.phase === 2) await db.execute('UPDATE lottery_results SET deep_prediction=? WHERE issue=?', [jsonPred, CALC_TASK.currentIssue]);
                    }
                }
                CALC_TASK.iterations++;
            }
        } catch (e) { console.error("计算出错:", e); }
    }, 10); 

    // --- 中间件 ---
    bot.use(async (ctx, next) => {
        if (ctx.channelPost) {
            if (CHANNEL_ID && String(ctx.chat.id) === String(CHANNEL_ID)) return next();
            return;
        }
        if (ctx.from && ctx.from.id === ADMIN_ID) return next();
    });

    bot.start((ctx) => {
        userStates[ctx.from.id] = null;
        ctx.reply('🤖 智能预测系统 V7.1 (正式版) 已就绪', getMainMenu());
    });

    // --- 功能: 下期预测 ---
    const sendPredictionMsg = async (ctx, isEdit = false) => {
        try {
            const [rows] = await db.query('SELECT * FROM lottery_results ORDER BY issue DESC LIMIT 1');
            if (!rows.length) return ctx.reply('暂无数据');
            
            const row = rows[0];
            const nextIssue = parseInt(row.issue) + 1;
            let pred = row.next_prediction;
            
            if (typeof pred === 'string') {
                try { pred = JSON.parse(pred); } catch(e) { pred = {}; }
            }

            const isCalculating = CALC_TASK.isRunning && CALC_TASK.phase === 1 && CALC_TASK.currentIssue == row.issue;
            
            const text = formatPredictionText(nextIssue, pred || {}, !isCalculating);
            const extra = {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([Markup.button.callback('🔄 刷新数据', 'refresh_pred')])
            };

            if (isEdit) { await ctx.editMessageText(text, extra).catch(()=>{}); await ctx.answerCbQuery('已刷新'); } 
            else await ctx.reply(text, extra);
        } catch (e) { console.error(e); }
    };
    bot.hears('🔮 下期预测', (ctx) => sendPredictionMsg(ctx, false));
    bot.action('refresh_pred', (ctx) => sendPredictionMsg(ctx, true));

    // --- 功能: 深度演算 ---
    const handleDeepCalc = async (ctx, isRefresh = false) => {
        try {
            const [rows] = await db.query('SELECT * FROM lottery_results ORDER BY issue DESC LIMIT 1');
            if (!rows.length) return ctx.reply('暂无数据');
            const row = rows[0];
            const nextIssue = parseInt(row.issue) + 1;

            if (CALC_TASK.isRunning && CALC_TASK.phase === 2 && CALC_TASK.currentIssue == row.issue) {
                const now = Date.now();
                const timePct = Math.min(100, Math.floor(((now - CALC_TASK.startTime) / CALC_TASK.targetDuration) * 100));
                const iterPct = Math.min(100, Math.floor((CALC_TASK.iterations / CALC_TASK.targetIterations) * 100));
                const timeLeft = Math.ceil((CALC_TASK.targetDuration - (now - CALC_TASK.startTime)) / 1000 / 60);

                const text = `
🌌 **深度模型演算中...**
━━━━━━━━━━━━━━
🎯 目标：${nextIssue} 期
🔄 当前迭代：${CALC_TASK.iterations} / ${CALC_TASK.targetIterations}
⏱️ 时间进度：${timePct}% (剩 ${timeLeft > 0 ? timeLeft : 0} 分)
🧠 算力进度：${iterPct}%
━━━━━━━━━━━━━━
`;
                const extra = { 
                    parse_mode: 'Markdown', 
                    ...Markup.inlineKeyboard([
                        [Markup.button.callback('👁️ 偷看结果', 'peek_deep')],
                        [Markup.button.callback('🔄 刷新进度', 'refresh_deep')]
                    ]) 
                };
                return isRefresh ? ctx.editMessageText(text, extra).catch(()=>{}) : ctx.reply(text, extra);
            }

            if (row.deep_prediction && !isRefresh) {
                let deepPred = typeof row.deep_prediction === 'string' ? JSON.parse(row.deep_prediction) : row.deep_prediction;
                const text = formatPredictionText(nextIssue, deepPred, '🚀 深度加强版 (已完成)');
                return ctx.reply(text, {parse_mode:'Markdown'});
            }

            if (CALC_TASK.isRunning && CALC_TASK.phase === 1) {
                 const msg = '⚠️ **基础计算尚未完成**\n请等待基础任务推送后再启动深度计算。';
                 return isRefresh ? ctx.answerCbQuery(msg, {show_alert:true}) : ctx.replyWithMarkdown(msg);
            }

            let startPred = null;
            if (row.next_prediction) startPred = typeof row.next_prediction === 'string' ? JSON.parse(row.next_prediction) : row.next_prediction;
            const baseIterations = CALC_TASK.iterations || 0;

            CALC_TASK = {
                isRunning: true,
                phase: 2,
                startTime: Date.now(),
                targetDuration: 5 * 60 * 60 * 1000, // 5小时
                targetIterations: baseIterations + 10000000, // +1000万次
                currentIssue: row.issue,
                bestScore: -1,
                bestPrediction: startPred,
                iterations: baseIterations,
                historyCache: null 
            };

            const startMsg = `🚀 **深度计算已启动**\n\n🎯 目标：${nextIssue} 期\n⏱️ 耗时：5 小时\n🧠 增量迭代：1000万次\n\n完成后需手动推送。`;
            return isRefresh ? ctx.editMessageText(startMsg, {parse_mode:'Markdown'}) : ctx.replyWithMarkdown(startMsg);

        } catch (e) { console.error(e); ctx.reply('错误'); }
    };
    bot.hears('🔭 深度演算', (ctx) => handleDeepCalc(ctx, false));
    bot.action('refresh_deep', (ctx) => handleDeepCalc(ctx, true));
    bot.action('show_deep_final', (ctx) => handleDeepCalc(ctx, false));

    bot.action('peek_deep', async (ctx) => {
        if (!CALC_TASK.isRunning || !CALC_TASK.bestPrediction) return ctx.answerCbQuery('无数据');
        const nextIssue = parseInt(CALC_TASK.currentIssue) + 1;
        const msg = formatPredictionText(nextIssue, CALC_TASK.bestPrediction, '👁️ 偷看 (计算中)');
        await ctx.reply(msg, { parse_mode: 'Markdown' });
    });

    // --- 功能: 进度查询 ---
    const sendProgressMsg = async (ctx, isEdit = false) => {
        if (!CALC_TASK.isRunning) {
            const msg = '💤 当前无活跃任务。';
            return isEdit ? ctx.answerCbQuery(msg, {show_alert:true}) : ctx.reply(msg);
        }
        const now = Date.now();
        const timePct = Math.min(100, Math.floor(((now - CALC_TASK.startTime) / CALC_TASK.targetDuration) * 100));
        const iterPct = Math.min(100, Math.floor((CALC_TASK.iterations / CALC_TASK.targetIterations) * 100));
        const phaseName = CALC_TASK.phase === 1 ? 'Phase 1 (基础)' : 'Phase 2 (深度)';

        const text = `
🖥 **AI 算力监控**
━━━━━━━━━━━━━━
🎯 目标：${parseInt(CALC_TASK.currentIssue) + 1} 期
⚡ 阶段：${phaseName}
🔄 迭代：${CALC_TASK.iterations}
⭐ 得分：${CALC_TASK.bestScore.toFixed(1)}
📊 进度：时间 ${timePct}% | 算力 ${iterPct}%
━━━━━━━━━━━━━━
`;
        const extra = { parse_mode: 'Markdown', ...Markup.inlineKeyboard([Markup.button.callback('🔄 刷新', 'refresh_prog')]) };
        if (isEdit) { await ctx.editMessageText(text, extra).catch(()=>{}); await ctx.answerCbQuery('更新成功'); }
        else await ctx.reply(text, extra);
    };
    bot.hears('⏳ 计算进度', (ctx) => sendProgressMsg(ctx, false));
    bot.action('refresh_prog', (ctx) => sendProgressMsg(ctx, true));

    // --- 功能: 手动推送 (优先深度) ---
    bot.hears(/手动发频道/, async (ctx) => {
        if (!CHANNEL_ID) return ctx.reply('无频道ID');
        try {
            const [rows] = await db.query('SELECT * FROM lottery_results ORDER BY issue DESC LIMIT 1');
            const row = rows[0];
            const nextIssue = parseInt(row.issue) + 1;
            
            let pred = null;
            let title = '';

            if (row.deep_prediction) {
                pred = typeof row.deep_prediction === 'string' ? JSON.parse(row.deep_prediction) : row.deep_prediction;
                title = '🚀 深度加强版';
            } else if (row.next_prediction) {
                pred = typeof row.next_prediction === 'string' ? JSON.parse(row.next_prediction) : row.next_prediction;
                title = '🏁 基础版 (深度暂未完成)';
            }
            
            if (!pred) return ctx.reply('暂无任何预测数据');

            const msgText = formatPredictionText(nextIssue, pred, title);
            await ctx.telegram.sendMessage(CHANNEL_ID, msgText, { parse_mode: 'Markdown' });
            ctx.reply(`✅ 已手动推送：${title}`);
        } catch (e) { ctx.reply('发送失败: ' + e.message); }
    });

    bot.hears(/自动推送/, (ctx) => {
        AUTO_SEND_ENABLED = !AUTO_SEND_ENABLED;
        ctx.reply(`自动推送: ${AUTO_SEND_ENABLED ? '✅ 开' : '❌ 关'}`, getMainMenu());
    });

    bot.hears('📊 历史走势', async (ctx) => {
        const [rows] = await db.query('SELECT issue, special_code, shengxiao FROM lottery_results ORDER BY issue DESC LIMIT 10');
        let msg = '📉 **近期特码**\n\n';
        rows.forEach(r => msg += `\`${r.issue}期\` : **${r.special_code}** (${r.shengxiao})\n`);
        ctx.reply(msg, { parse_mode: 'Markdown' });
    });

    bot.hears('🗑 删除记录', (ctx) => {
        userStates[ctx.from.id] = 'WAITING_DELETE_ISSUE';
        ctx.reply('请输入要删除的期号', Markup.removeKeyboard());
    });

    // --- 消息处理 ---
    bot.on(['text', 'channel_post'], async (ctx) => {
        const text = ctx.message?.text || ctx.channelPost?.text;
        if (!text) return;

        if (ctx.chat.type === 'private' && userStates[ctx.from.id] === 'WAITING_DELETE_ISSUE') {
            if (text === '取消') { userStates[ctx.from.id] = null; return ctx.reply('已取消', getMainMenu()); }
            if (!/^\d+$/.test(text)) return ctx.reply('请输入数字');
            await db.execute('DELETE FROM lottery_results WHERE issue = ?', [text]);
            userStates[ctx.from.id] = null;
            return ctx.reply(`✅ 第 ${text} 期已删除`, getMainMenu());
        }

        const result = parseLotteryResult(text);
        if (result) {
            const { issue, flatNumbers, specialCode, shengxiao } = result;
            let initialPred = {};
            try {
                const [h] = await db.query('SELECT numbers, special_code, shengxiao FROM lottery_results ORDER BY issue DESC LIMIT 50');
                initialPred = generateSinglePrediction(h || []);
            } catch(e) { initialPred = generateSinglePrediction([]); }

            const jsonNums = JSON.stringify(flatNumbers);
            const jsonPred = JSON.stringify(initialPred);
            
            try {
                // 1. 存入数据库
                await db.execute(`
                    INSERT INTO lottery_results (issue, numbers, special_code, shengxiao, next_prediction, deep_prediction, open_date)
                    VALUES (?, ?, ?, ?, ?, NULL, NOW())
                    ON DUPLICATE KEY UPDATE numbers=?, special_code=?, shengxiao=?, next_prediction=?, deep_prediction=NULL, open_date=NOW()
                `, [issue, jsonNums, specialCode, shengxiao, jsonPred, jsonNums, specialCode, shengxiao, jsonPred]);

                // 2. 启动 Phase 1 (正式配置: 5小时, 1000万次)
                CALC_TASK = {
                    isRunning: true,
                    phase: 1,
                    startTime: Date.now(),
                    targetDuration: 5 * 60 * 60 * 1000, // 5小时
                    targetIterations: 10000000,         // 1000万次
                    currentIssue: issue,
                    bestScore: -1,
                    bestPrediction: initialPred,
                    iterations: 0,
                    historyCache: null
                };

                const msg = `✅ **第 ${issue} 期录入成功**\n\n🚀 **Phase 1 (正式版) 启动**\n目标时长：5 小时\n目标算力：10,000,000 次\n\n(完成后自动推送)`;
                if (ctx.chat.type === 'private') ctx.replyWithMarkdown(msg);
                else console.log(`频道录入: ${issue}`);
            } catch (err) { console.error(err); }
        }
    });

    bot.launch().catch(err => console.error(err));
    process.once('SIGINT', () => bot.stop('SIGINT'));
    process.once('SIGTERM', () => bot.stop('SIGTERM'));

    return bot;
}

module.exports = startBot;
