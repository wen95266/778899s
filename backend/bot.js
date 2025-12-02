// 核心配置：强制北京时间
process.env.TZ = 'Asia/Shanghai';

const { Telegraf, Markup } = require('telegraf');
const db = require('./db');
const { parseLotteryResult, generateSinglePrediction, scorePrediction } = require('./utils');

// --- 全局配置 ---
let AUTO_SEND_ENABLED = true;
// 默认时长：3小时 (用户要求)
let DEEP_CALC_DURATION = 3 * 60 * 60 * 1000; 

// 核心状态机
let CALC_TASK = {
    isRunning: false,
    phase: 1, 
    startTime: 0,
    targetDuration: 0,
    targetIterations: 0,
    currentIssue: '',
    bestScore: -9999,
    bestPrediction: null,
    iterations: 0,
    historyCache: null,
    isProcessing: false // 并发锁
};

const userStates = {};

// --- 辅助函数 ---
function safeParse(data) {
    if (!data) return null;
    if (typeof data === 'string') { try { return JSON.parse(data); } catch (e) { return null; } }
    return data;
}

function getMainMenu() {
    const autoIcon = AUTO_SEND_ENABLED ? '✅' : '❌';
    return Markup.keyboard([
        ['🔮 下期预测', '⏳ 计算进度'],
        ['🔭 深度演算', '📊 历史走势'],
        ['⚙️ 设置时长', `自动推送: ${autoIcon}`], 
        ['📡 手动发频道', '🗑 删除记录']
    ]).resize();
}

function getDurationMenu() {
    return Markup.inlineKeyboard([
        [Markup.button.callback('30 分钟', 'set_dur_0.5'), Markup.button.callback('1 小时', 'set_dur_1')],
        [Markup.button.callback('3 小时 (默认)', 'set_dur_3'), Markup.button.callback('5 小时', 'set_dur_5')],
        [Markup.button.callback('10 小时 (极限)', 'set_dur_10')]
    ]);
}

function formatPredictionText(issue, pred, isFinalOrTitle = false) {
    const waveMap = { red: '🔴 红波', blue: '🔵 蓝波', green: '🟢 绿波' };
    let title = '';
    if (typeof isFinalOrTitle === 'string') {
        title = isFinalOrTitle;
    } else {
        title = isFinalOrTitle ? `🏁 第 ${issue} 期 最终决策` : `🧠 第 ${issue} 期 AI 演算中...`;
    }
    
    const safeJoin = (arr) => arr ? arr.join(' ') : '?';
    
    let zodiacGrid = '';
    if (pred.zodiac_one_code && Array.isArray(pred.zodiac_one_code)) {
        zodiacGrid = pred.zodiac_one_code.map(i => `${i.zodiac}[${String(i.num).padStart(2,'0')}]`).join('  ');
    } else {
        zodiacGrid = '⏳ 计算中...';
    }

    const killInfo = (pred.kill_zodiacs && pred.kill_zodiacs.length > 0) ? `\n🚫 **绝杀三肖**: ${pred.kill_zodiacs.join(' ')}` : '';
    const tailsStr = (pred.rec_tails && Array.isArray(pred.rec_tails)) ? pred.rec_tails.join('.') : '?';
    const headStr = (pred.hot_head !== undefined) ? `主 ${pred.hot_head} 头 | 防 ${pred.fang_head} 头` : '?';

    return `
${title}
━━━━━━━━━━━━━━
🔥 **五肖中特** (必中核心)
**${safeJoin(pred.liu_xiao)}**

🎯 **主攻三肖**
${safeJoin(pred.zhu_san)}

🦁 **一码阵 (参考)**
${zodiacGrid}

🚫 **绝杀三肖** (避雷)
${pred.kill_zodiacs ? pred.kill_zodiacs.join(' ') : '无'}

🔢 **围捕数据**
头数：${headStr}
尾数：${tailsStr} 尾
波色：${waveMap[pred.zhu_bo]} (防${waveMap[pred.fang_bo]})
形态：${pred.da_xiao} / ${pred.dan_shuang}${killInfo}
━━━━━━━━━━━━━━
${typeof isFinalOrTitle === 'boolean' && isFinalOrTitle ? '✅ 数据库已更新 | 等待开奖验证' : `🔄 模型迭代: ${CALC_TASK.iterations}`}
`.trim();
}

// --- Bot 启动 ---
function startBot() {
    const bot = new Telegraf(process.env.BOT_TOKEN);
    const ADMIN_ID = parseInt(process.env.ADMIN_ID);
    const CHANNEL_ID = process.env.CHANNEL_ID;

    // ============================
    // 1. 后台计算核心 (严谨逻辑版)
    // ============================
    setInterval(async () => {
        // 如果没有任务，或正在处理结算，直接跳过
        if (!CALC_TASK.isRunning || CALC_TASK.isProcessing) return;

        const now = Date.now();
        // 条件1: 时间是否到了?
        const isTimeUp = (now - CALC_TASK.startTime) >= CALC_TASK.targetDuration;
        // 条件2: 迭代次数是否够了?
        const isIterUp = CALC_TASK.iterations >= CALC_TASK.targetIterations;

        // [关键修正] 必须同时满足【时间到了】且【次数够了】才能结束
        // 如果时间到了但次数不够，继续跑
        // 如果次数够了但时间没到，继续跑 (寻找更优解)
        if (isTimeUp && isIterUp) {
            
            CALC_TASK.isProcessing = true; // 上锁，防止重复触发

            try {
                const nextIssue = parseInt(CALC_TASK.currentIssue) + 1;
                const jsonPred = JSON.stringify(CALC_TASK.bestPrediction);

                // --- Phase 1 结束逻辑 ---
                if (CALC_TASK.phase === 1) {
                    console.log(`[Phase 1 完成] 用时:${(now-CALC_TASK.startTime)/1000}秒 迭代:${CALC_TASK.iterations}`);
                    
                    // 1. 存库
                    await db.execute('UPDATE lottery_results SET next_prediction=? WHERE issue=?', [jsonPred, CALC_TASK.currentIssue]);
                    
                    // 2. 发送频道
                    if (AUTO_SEND_ENABLED && CHANNEL_ID && CALC_TASK.bestPrediction) {
                        const msg = formatPredictionText(nextIssue, CALC_TASK.bestPrediction, true);
                        await bot.telegram.sendMessage(CHANNEL_ID, msg, { parse_mode: 'Markdown' });
                        bot.telegram.sendMessage(ADMIN_ID, `✅ 第 ${nextIssue} 期 (Phase 1) 已按时推送。\n⏱️ 耗时: ${DEEP_CALC_DURATION/3600000}小时\n🚀 自动启动 Phase 2 深度校验...`);
                    }

                    // 3. 启动 Phase 2
                    CALC_TASK.phase = 2;
                    CALC_TASK.startTime = Date.now();
                    CALC_TASK.iterations = 0;
                    CALC_TASK.targetDuration = DEEP_CALC_DURATION; // Phase 2 也要跑这么久
                    // Phase 2 要求更高的迭代次数
                    CALC_TASK.targetIterations = 100000000; 
                    
                    CALC_TASK.isProcessing = false; // 解锁，继续下一阶段
                    return;
                } 
                
                // --- Phase 2 结束逻辑 ---
                else if (CALC_TASK.phase === 2) {
                    console.log(`[Phase 2 完成] 用时:${(now-CALC_TASK.startTime)/1000}秒`);
                    
                    // 1. 存库
                    await db.execute('UPDATE lottery_results SET deep_prediction=? WHERE issue=?', [jsonPred, CALC_TASK.currentIssue]);
                    
                    // 2. 停止任务
                    CALC_TASK.isRunning = false;
                    
                    // 3. 通知管理员
                    bot.telegram.sendMessage(ADMIN_ID, `✅ 第 ${nextIssue} 期 **深度计算** 全部完成！\n总耗时: ${(DEEP_CALC_DURATION*2)/3600000}小时\n请点击下方按钮查看最终结果。`, {
                        parse_mode: 'Markdown',
                        ...Markup.inlineKeyboard([Markup.button.callback('👁️ 立即查看结果', 'show_deep_final')])
                    });
                    
                    CALC_TASK.isProcessing = false; // 解锁
                    return;
                }
            } catch (e) {
                console.error("任务结算错误:", e);
                CALC_TASK.isProcessing = false; // 异常时必须解锁，否则卡死
            }
            return;
        }

        // --- 执行计算 (继续跑，直到双重条件满足) ---
        try {
            if (!CALC_TASK.historyCache) {
                const [rows] = await db.query('SELECT numbers, special_code, shengxiao FROM lottery_results ORDER BY issue DESC LIMIT 60');
                CALC_TASK.historyCache = rows;
            }
            
            // 每次 Tick 跑 2000 次模拟，提高运算密度
            for(let i=0; i<2000; i++) {
                const tempPred = generateSinglePrediction(CALC_TASK.historyCache);
                const score = scorePrediction(tempPred, CALC_TASK.historyCache);
                
                // 如果找到更好的分数，更新结果
                if (score > CALC_TASK.bestScore) {
                    CALC_TASK.bestScore = score;
                    CALC_TASK.bestPrediction = tempPred;
                }
                CALC_TASK.iterations++;
            }
        } catch (e) { console.error("计算循环错误:", e); }

    }, 50); // 50ms 心跳

    // ============================
    // 2. 交互功能 (完整保留)
    // ============================

    // 下期预测
    const sendPredictionMsg = async (ctx, isEdit = false) => {
        try {
            const [rows] = await db.query('SELECT * FROM lottery_results ORDER BY issue DESC LIMIT 1');
            if (!rows.length) return ctx.reply('暂无数据');
            const row = rows[0];
            const nextIssue = parseInt(row.issue) + 1;
            
            let pred = safeParse(row.deep_prediction) || safeParse(row.next_prediction);
            if (!pred && CALC_TASK.bestPrediction) pred = CALC_TASK.bestPrediction;
            if (!pred) return ctx.reply('等待冷启动计算...');

            const isCalculating = CALC_TASK.isRunning && CALC_TASK.currentIssue == row.issue;
            const text = formatPredictionText(nextIssue, pred, !isCalculating);
            
            const extra = {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([Markup.button.callback('🔄 刷新数据', 'refresh_pred')])
            };
            if (isEdit) { await ctx.editMessageText(text, extra).catch(()=>{}); await ctx.answerCbQuery('刷新成功'); } 
            else { await ctx.reply(text, extra); }
        } catch (e) { console.error(e); }
    };
    bot.hears('🔮 下期预测', (ctx) => sendPredictionMsg(ctx, false));
    bot.action('refresh_pred', (ctx) => sendPredictionMsg(ctx, true));

    // 深度演算状态
    const handleDeepCalc = async (ctx, isRefresh = false) => {
        try {
            const [rows] = await db.query('SELECT * FROM lottery_results ORDER BY issue DESC LIMIT 1');
            if (!rows.length) return ctx.reply('无数据');
            const row = rows[0];
            const nextIssue = parseInt(row.issue) + 1;

            // 正在运行
            if (CALC_TASK.isRunning && CALC_TASK.currentIssue == row.issue) {
                const now = Date.now();
                const timePct = Math.min(100, Math.floor(((now - CALC_TASK.startTime) / CALC_TASK.targetDuration) * 100));
                const iterPct = Math.min(100, Math.floor((CALC_TASK.iterations / CALC_TASK.targetIterations) * 100));
                const timeLeft = Math.ceil((CALC_TASK.targetDuration - (now - CALC_TASK.startTime)) / 60000);
                
                const text = `
🌌 **模型演算中...**
━━━━━━━━━━━━━━
🎯 目标：${nextIssue} 期
⚡ 阶段：Phase ${CALC_TASK.phase}
⏱️ 时间进度：${timePct}% (剩 ${timeLeft > 0 ? timeLeft : 0} 分)
🔄 迭代进度：${iterPct}% (${CALC_TASK.iterations} / ${CALC_TASK.targetIterations})
🏆 最佳得分：${CALC_TASK.bestScore.toFixed(2)}
━━━━━━━━━━━━━━
⚠️ 必须两项进度均达 100% 才会推送`;
                
                const extra = { 
                    parse_mode: 'Markdown', 
                    ...Markup.inlineKeyboard([[Markup.button.callback('👁️ 偷看', 'peek_deep'), Markup.button.callback('🔄 刷新', 'refresh_deep')]]) 
                };
                return isRefresh ? ctx.editMessageText(text, extra).catch(()=>{}) : ctx.reply(text, extra);
            }

            // 已经完成
            if (row.deep_prediction && !isRefresh) {
                return ctx.reply(formatPredictionText(nextIssue, safeParse(row.deep_prediction), '🚀 深度版 (已完成)'), {parse_mode:'Markdown'});
            }

            // 手动启动
            let startPred = safeParse(row.next_prediction);
            CALC_TASK = {
                isRunning: true, phase: 2, startTime: Date.now(),
                targetDuration: DEEP_CALC_DURATION, 
                targetIterations: 100000000, // 手动启动也是1亿次
                currentIssue: row.issue, bestScore: -9999, bestPrediction: startPred,
                iterations: 0, historyCache: null, isProcessing: false
            };
            const h = DEEP_CALC_DURATION / 3600000;
            const startMsg = `🚀 **深度计算已手动启动**\n🎯 目标：${nextIssue} 期\n⏱️ 时长：${h} 小时\n🔄 目标迭代：1亿次`;
            return isRefresh ? ctx.editMessageText(startMsg, {parse_mode:'Markdown'}) : ctx.replyWithMarkdown(startMsg);

        } catch (e) { console.error(e); ctx.reply('Error'); }
    };
    bot.hears('🔭 深度演算', (ctx) => handleDeepCalc(ctx, false));
    bot.action('refresh_deep', (ctx) => handleDeepCalc(ctx, true));
    bot.action('show_deep_final', (ctx) => handleDeepCalc(ctx, false));
    
    bot.action('peek_deep', async (ctx) => {
        if (!CALC_TASK.isRunning || !CALC_TASK.bestPrediction) return ctx.answerCbQuery('暂无数据');
        await ctx.reply(formatPredictionText(parseInt(CALC_TASK.currentIssue)+1, CALC_TASK.bestPrediction, '👁️ 偷看 (计算中)'), {parse_mode:'Markdown'});
    });

    // 计算进度
    bot.hears('⏳ 计算进度', (ctx) => {
        if (!CALC_TASK.isRunning) return ctx.reply('💤 无活跃任务');
        const now = Date.now();
        const timePct = Math.min(100, Math.floor(((now - CALC_TASK.startTime)/CALC_TASK.targetDuration)*100));
        ctx.reply(`📊 Phase ${CALC_TASK.phase}\n时间: ${timePct}%\n迭代: ${CALC_TASK.iterations}`);
    });

    // 设置时长
    bot.hears('⚙️ 设置时长', (ctx) => {
        const h = DEEP_CALC_DURATION / 3600000;
        ctx.reply(`当前时长: ${h} 小时\n请选择:`, getDurationMenu());
    });
    bot.action(/set_dur_([\d\.]+)/, (ctx) => {
        const h = parseFloat(ctx.match[1]);
        DEEP_CALC_DURATION = h * 3600000;
        ctx.editMessageText(`✅ 计算时长已更新为: ${h} 小时\n(下次录入生效)`);
    });

    // 手动推送
    bot.hears(/手动发频道/, async (ctx) => {
        if (!CHANNEL_ID) return ctx.reply('无频道ID');
        const [rows] = await db.query('SELECT * FROM lottery_results ORDER BY issue DESC LIMIT 1');
        const row = rows[0];
        let pred = safeParse(row.deep_prediction) || safeParse(row.next_prediction);
        if (!pred) return ctx.reply('无数据');
        await bot.telegram.sendMessage(CHANNEL_ID, formatPredictionText(parseInt(row.issue)+1, pred, `📡 手动推送`), {parse_mode:'Markdown'});
        ctx.reply('✅ 已发送');
    });

    // 历史走势
    bot.hears('📊 历史走势', async (ctx) => {
        const [rows] = await db.query('SELECT issue, special_code, shengxiao FROM lottery_results ORDER BY issue DESC LIMIT 15');
        let msg = '📉 **近期走势**\n━━━━━━━━━━━━━━\n';
        rows.forEach(r => msg += `\`${r.issue}期\` : **${String(r.special_code).padStart(2,'0')}** (${r.shengxiao})\n`);
        ctx.reply(msg, { parse_mode: 'Markdown' });
    });

    bot.hears('🗑 删除记录', (ctx) => { if (ctx.from) { userStates[ctx.from.id] = 'WAIT_DEL'; ctx.reply('请输入要删除的期号:'); } });
    bot.hears(/自动推送/, (ctx) => { AUTO_SEND_ENABLED = !AUTO_SEND_ENABLED; ctx.reply(`自动推送: ${AUTO_SEND_ENABLED ? '✅ 开' : '❌ 关'}`, getMainMenu()); });

    // 启动监听
    bot.use(async (ctx, next) => {
        if (ctx.channelPost && String(ctx.chat.id) === String(CHANNEL_ID)) return next();
        if (ctx.from && ctx.from.id === ADMIN_ID) return next();
    });
    
    bot.start((ctx) => { 
        if(ctx.from) userStates[ctx.from.id]=null; 
        ctx.reply('🤖 五行杀号系统 (Strict Mode) 已就绪', getMainMenu()); 
    });

    // 开奖录入
    bot.on(['text', 'channel_post'], async (ctx) => {
        const text = ctx.message?.text || ctx.channelPost?.text;
        if (!text) return;

        if (ctx.from && userStates[ctx.from.id] === 'WAIT_DEL' && ctx.chat.type === 'private') {
            await db.execute('DELETE FROM lottery_results WHERE issue = ?', [text]);
            userStates[ctx.from.id] = null;
            return ctx.reply(`✅ 第 ${text} 期已删除`);
        }

        const res = parseLotteryResult(text);
        if (res) {
            const { issue, flatNumbers, specialCode, shengxiao } = res;
            // 初始预测
            const initPred = generateSinglePrediction([]); 
            const jNum = JSON.stringify(flatNumbers);
            const jPred = JSON.stringify(initPred);
            
            await db.execute(`
                INSERT INTO lottery_results (issue, numbers, special_code, shengxiao, next_prediction, deep_prediction, open_date)
                VALUES (?, ?, ?, ?, ?, NULL, NOW())
                ON DUPLICATE KEY UPDATE numbers=?, special_code=?, shengxiao=?, next_prediction=?, deep_prediction=NULL, open_date=NOW()
            `, [issue, jNum, specialCode, shengxiao, jPred, jNum, specialCode, shengxiao, jPred]);

            // 启动 Phase 1 任务
            CALC_TASK = {
                isRunning: true,
                phase: 1,
                startTime: Date.now(),
                targetDuration: DEEP_CALC_DURATION, // 严格遵守时长
                targetIterations: 50000000,         // Phase 1 目标: 5000万次
                currentIssue: issue,
                bestScore: -9999,
                bestPrediction: initPred,
                iterations: 0,
                historyCache: null,
                isProcessing: false
            };

            const h = DEEP_CALC_DURATION / 3600000;
            const msg = `✅ **第 ${issue} 期录入成功**\n\n🚀 启动严格计算模式\n⏱️ 目标时长: ${h} 小时\n🔄 目标迭代: 5000万次\n\n(只有当两个条件都满足时，才会推送结果)`;
            
            if (ctx.chat?.type === 'private') ctx.replyWithMarkdown(msg);
            else console.log(`频道录入: ${issue}`);
        }
    });

    bot.launch();
    process.once('SIGINT', () => bot.stop('SIGINT'));
    process.once('SIGTERM', () => bot.stop('SIGTERM'));

    return bot;
}

module.exports = startBot;
