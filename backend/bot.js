// 核心修复：强制 Node.js 进程使用北京时间，确保农历日柱计算正确
process.env.TZ = 'Asia/Shanghai';

const { Telegraf, Markup } = require('telegraf');
const db = require('./db');
const { parseLotteryResult, generateSinglePrediction, scorePrediction } = require('./utils');

// --- 全局配置 ---
let AUTO_SEND_ENABLED = true;
let DEEP_CALC_DURATION = 1 * 60 * 60 * 1000; // 默认 1 小时

// 核心状态机 (包含锁机制)
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
    isProcessing: false // [Bug修复] 防止重复发送的并发锁
};

const userStates = {};

// --- 辅助函数 ---

// 安全解析 JSON
function safeParse(data) {
    if (!data) return null;
    if (typeof data === 'string') {
        try { return JSON.parse(data); } catch (e) { return null; }
    }
    return data;
}

// 主菜单键盘
function getMainMenu() {
    const autoSendIcon = AUTO_SEND_ENABLED ? '✅' : '❌';
    const autoSendText = `${autoSendIcon} 自动推送: ${AUTO_SEND_ENABLED ? '开' : '关'}`;
    
    return Markup.keyboard([
        ['🔮 下期预测', '⏳ 计算进度'],
        ['🔭 深度演算', '📊 历史走势'],
        ['⚙️ 设置时长', autoSendText], 
        ['📡 手动发频道', '🗑 删除记录']
    ]).resize();
}

// 时长选择键盘
function getDurationMenu() {
    return Markup.inlineKeyboard([
        [Markup.button.callback('30 分钟', 'set_dur_0.5'), Markup.button.callback('1 小时', 'set_dur_1')],
        [Markup.button.callback('3 小时', 'set_dur_3'), Markup.button.callback('5 小时', 'set_dur_5')],
        [Markup.button.callback('10 小时 (极限)', 'set_dur_10')]
    ]);
}

// 格式化预测文案 (适配 V10.3 数据结构)
function formatPredictionText(issue, pred, isFinalOrTitle = false) {
    const waveMap = { red: '🔴 红波', blue: '🔵 蓝波', green: '🟢 绿波' };
    
    let title = '';
    if (typeof isFinalOrTitle === 'string') {
        title = isFinalOrTitle;
    } else {
        title = isFinalOrTitle ? `🏁 第 ${issue} 期 最终决策` : `🧠 第 ${issue} 期 AI 演算中...`;
    }
    
    const safeJoin = (arr) => arr ? arr.join(' ') : '?';
    
    // 一码阵格式化
    let zodiacGrid = '';
    if (pred.zodiac_one_code && Array.isArray(pred.zodiac_one_code)) {
        // 适配 V10.3: 一行显示多个，紧凑布局
        zodiacGrid = pred.zodiac_one_code.map(i => `${i.zodiac}[${String(i.num).padStart(2,'0')}]`).join('  ');
    } else {
        zodiacGrid = '⏳ 数据计算中...';
    }

    // 绝杀信息
    const killInfo = (pred.kill_zodiacs && pred.kill_zodiacs.length > 0) 
        ? `\n🚫 **绝杀三肖**: ${pred.kill_zodiacs.join(' ')}` 
        : '';

    // 尾数处理 (V10.3 返回的是数组)
    const tailsStr = (pred.rec_tails && Array.isArray(pred.rec_tails)) ? pred.rec_tails.join('.') : '?';

    return `
${title}
━━━━━━━━━━━━━━
🔥 **五肖中特** (必中核心)
**${safeJoin(pred.liu_xiao)}**

🎯 **主攻三肖**
${safeJoin(pred.zhu_san)}

🦁 **一码阵 (参考)**
${zodiacGrid}

🔢 **围捕数据**
尾数：${tailsStr} 尾
波色：${waveMap[pred.zhu_bo]} (防${waveMap[pred.fang_bo]})
形态：${pred.da_xiao} / ${pred.dan_shuang}${killInfo}
━━━━━━━━━━━━━━
${typeof isFinalOrTitle === 'boolean' && isFinalOrTitle ? '✅ 数据库已更新 | 等待开奖验证' : `🔄 模型迭代: ${CALC_TASK.iterations}`}
`.trim();
}

// --- Bot 主逻辑 ---
function startBot() {
    const bot = new Telegraf(process.env.BOT_TOKEN);
    const ADMIN_ID = parseInt(process.env.ADMIN_ID);
    const CHANNEL_ID = process.env.CHANNEL_ID;

    // ============================
    // 1. 后台计算任务 (Heartbeat)
    // ============================
    setInterval(async () => {
        // 如果任务未运行，或者正在处理结算（锁住），则直接跳过
        if (!CALC_TASK.isRunning || CALC_TASK.isProcessing) return;

        const now = Date.now();
        const isTimeUp = (now - CALC_TASK.startTime) >= CALC_TASK.targetDuration;
        // V10算法主要依赖确定性，迭代次数不需要特别多，时间到了就行
        const isIterUp = CALC_TASK.iterations >= CALC_TASK.targetIterations;

        // --- 阶段完成判断 ---
        if (isTimeUp || (CALC_TASK.targetIterations > 0 && isIterUp)) {
            
            // [Bug修复] 立即上锁！防止并发执行导致重复发送
            CALC_TASK.isProcessing = true;

            try {
                const nextIssue = parseInt(CALC_TASK.currentIssue) + 1;
                const jsonPred = JSON.stringify(CALC_TASK.bestPrediction);

                // >>> Phase 1 完成：存库 -> 发频道 -> 自动切 Phase 2 <<<
                if (CALC_TASK.phase === 1) {
                    console.log(`[Phase 1 完成] 第 ${CALC_TASK.currentIssue} 期`);
                    
                    // 1. 存入数据库
                    await db.execute('UPDATE lottery_results SET next_prediction=? WHERE issue=?', [jsonPred, CALC_TASK.currentIssue]);
                    
                    // 2. 自动推送到频道
                    if (AUTO_SEND_ENABLED && CHANNEL_ID && CALC_TASK.bestPrediction) {
                        const msg = formatPredictionText(nextIssue, CALC_TASK.bestPrediction, true);
                        await bot.telegram.sendMessage(CHANNEL_ID, msg, { parse_mode: 'Markdown' });
                        bot.telegram.sendMessage(ADMIN_ID, `✅ 第 ${nextIssue} 期 (Phase 1) 已推送。\n🚀 正在自动启动 Phase 2 (深度校验)...`);
                    }

                    // 3. 自动无缝启动 Phase 2
                    CALC_TASK.phase = 2;
                    CALC_TASK.startTime = Date.now(); 
                    CALC_TASK.iterations = 0;         
                    CALC_TASK.targetDuration = DEEP_CALC_DURATION; // Phase 2 继续跑设定的时长
                    
                    CALC_TASK.isProcessing = false; // 解锁
                    return; 
                } 
                
                // >>> Phase 2 完成：存库 -> 通知管理员 -> 结束任务 <<<
                else if (CALC_TASK.phase === 2) {
                    console.log(`[Phase 2 完成] 第 ${CALC_TASK.currentIssue} 期`);
                    CALC_TASK.isRunning = false; // 停止

                    // 1. 存入数据库
                    await db.execute('UPDATE lottery_results SET deep_prediction=? WHERE issue=?', [jsonPred, CALC_TASK.currentIssue]);
                    
                    // 2. 仅通知管理员
                    bot.telegram.sendMessage(ADMIN_ID, `✅ 第 ${nextIssue} 期 **深度计算** 全部完成！\n总耗时: ${(DEEP_CALC_DURATION * 2)/3600000} 小时\n请点击下方按钮查看结果。`, {
                        parse_mode: 'Markdown',
                        ...Markup.inlineKeyboard([
                            Markup.button.callback('👁️ 立即查看结果', 'show_deep_final')
                        ])
                    });
                    
                    CALC_TASK.isProcessing = false; // 解锁
                    return;
                }
            } catch (e) { 
                console.error('任务完成处理失败:', e); 
                CALC_TASK.isProcessing = false; // 出错也要解锁
            }
            return;
        }

        // 执行计算 (蒙特卡洛模拟)
        try {
            if (!CALC_TASK.historyCache) {
                // V10.3 需要60期数据做尾数统计
                const [rows] = await db.query('SELECT numbers, special_code, shengxiao FROM lottery_results ORDER BY issue DESC LIMIT 60');
                CALC_TASK.historyCache = rows;
            }
            
            // 每次 Tick 跑 100 次模拟，取最高分
            for(let i=0; i<100; i++) {
                const tempPred = generateSinglePrediction(CALC_TASK.historyCache);
                const score = scorePrediction(tempPred, CALC_TASK.historyCache);
                
                if (score > CALC_TASK.bestScore) {
                    CALC_TASK.bestScore = score;
                    CALC_TASK.bestPrediction = tempPred;
                }
                CALC_TASK.iterations++;
            }
        } catch (e) { console.error("计算出错:", e); }
    }, 50); // 50ms 频率

    // ============================
    // 2. 交互功能模块 (完整回归)
    // ============================

    // --- 功能 A: 下期预测 (带刷新) ---
    const sendPredictionMsg = async (ctx, isEdit = false) => {
        try {
            const [rows] = await db.query('SELECT * FROM lottery_results ORDER BY issue DESC LIMIT 1');
            if (!rows.length) return ctx.reply('暂无数据');
            
            const row = rows[0];
            const nextIssue = parseInt(row.issue) + 1;
            
            // 优先取深度预测，其次基础预测，最后取内存
            let pred = safeParse(row.deep_prediction) || safeParse(row.next_prediction);
            if (!pred && CALC_TASK.bestPrediction) pred = CALC_TASK.bestPrediction;
            
            if (!pred) return ctx.reply('暂无预测数据 (或正在冷启动计算)');

            // 判断是否正在计算基础版
            const isCalculating = CALC_TASK.isRunning && CALC_TASK.phase === 1 && CALC_TASK.currentIssue == row.issue;
            
            const text = formatPredictionText(nextIssue, pred, !isCalculating);
            
            const extra = {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                    Markup.button.callback('🔄 刷新数据', 'refresh_pred')
                ])
            };

            if (isEdit) {
                await ctx.editMessageText(text, extra).catch(() => {});
                await ctx.answerCbQuery('已刷新');
            } else {
                await ctx.reply(text, extra);
            }
        } catch (e) { console.error(e); }
    };
    bot.hears('🔮 下期预测', (ctx) => sendPredictionMsg(ctx, false));
    bot.action('refresh_pred', (ctx) => sendPredictionMsg(ctx, true));


    // --- 功能 B: 深度演算 (状态监控 + 偷看) ---
    const handleDeepCalc = async (ctx, isRefresh = false) => {
        try {
            const [rows] = await db.query('SELECT * FROM lottery_results ORDER BY issue DESC LIMIT 1');
            if (!rows.length) return ctx.reply('暂无数据');
            const row = rows[0];
            const nextIssue = parseInt(row.issue) + 1;

            // 情况 1: 正在计算中
            if (CALC_TASK.isRunning && CALC_TASK.currentIssue == row.issue) {
                const now = Date.now();
                const timePct = Math.min(100, Math.floor(((now - CALC_TASK.startTime) / CALC_TASK.targetDuration) * 100));
                const timeLeft = Math.ceil((CALC_TASK.targetDuration - (now - CALC_TASK.startTime)) / 1000 / 60);
                const phaseName = CALC_TASK.phase === 1 ? 'Phase 1 (基础)' : 'Phase 2 (深度)';

                const text = `
🌌 **模型演算中...**
━━━━━━━━━━━━━━
🎯 目标：${nextIssue} 期
⚡ 阶段：${phaseName}
🔄 迭代：${CALC_TASK.iterations}
⏱️ 进度：${timePct}% (剩 ${timeLeft} 分)
🏆 最佳分：${CALC_TASK.bestScore.toFixed(2)}
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

            // 情况 2: 已经算完了 (有 deep_prediction)
            if (row.deep_prediction && !isRefresh) {
                let deepPred = safeParse(row.deep_prediction);
                const text = formatPredictionText(nextIssue, deepPred, '🚀 深度加强版 (已完成)');
                return ctx.reply(text, {parse_mode:'Markdown'});
            }

            // 情况 3: 手动启动深度计算 (Phase 2)
            let startPred = safeParse(row.next_prediction);
            
            CALC_TASK = {
                isRunning: true,
                phase: 2,
                startTime: Date.now(),
                targetDuration: DEEP_CALC_DURATION, 
                targetIterations: 20000000, 
                currentIssue: row.issue,
                bestScore: -9999,
                bestPrediction: startPred,
                iterations: 0,
                historyCache: null,
                isProcessing: false
            };

            const startMsg = `🚀 **深度计算已手动启动**\n\n🎯 目标：${nextIssue} 期\n⏱️ 时长：${DEEP_CALC_DURATION/3600000} 小时`;
            return isRefresh ? ctx.editMessageText(startMsg, {parse_mode:'Markdown'}) : ctx.replyWithMarkdown(startMsg);

        } catch (e) { console.error(e); ctx.reply('系统错误'); }
    };
    bot.hears('🔭 深度演算', (ctx) => handleDeepCalc(ctx, false));
    bot.action('refresh_deep', (ctx) => handleDeepCalc(ctx, true));
    bot.action('show_deep_final', (ctx) => handleDeepCalc(ctx, false));
    
    // 偷看功能
    bot.action('peek_deep', async (ctx) => {
        if (!CALC_TASK.isRunning || !CALC_TASK.bestPrediction) return ctx.answerCbQuery('暂无数据或任务未运行');
        const nextIssue = parseInt(CALC_TASK.currentIssue) + 1;
        const msg = formatPredictionText(nextIssue, CALC_TASK.bestPrediction, '👁️ 偷看 (实时计算中)');
        await ctx.reply(msg, { parse_mode: 'Markdown' });
    });


    // --- 功能 C: 计算进度 ---
    const sendProgressMsg = async (ctx, isEdit = false) => {
        if (!CALC_TASK.isRunning) {
            const msg = '💤 当前无活跃任务。';
            return isEdit ? ctx.answerCbQuery(msg, {show_alert:true}) : ctx.reply(msg);
        }
        
        const now = Date.now();
        const timePct = Math.min(100, Math.floor(((now - CALC_TASK.startTime) / CALC_TASK.targetDuration) * 100));
        const bar = "🟩".repeat(Math.floor(timePct/10)) + "⬜".repeat(10 - Math.floor(timePct/10));
        const timeLeft = Math.ceil((CALC_TASK.targetDuration - (now - CALC_TASK.startTime)) / 60000);
        const phaseName = CALC_TASK.phase === 1 ? '基础计算' : '深度演算';

        const text = `
🖥 **AI 算力监控**
━━━━━━━━━━━━━━
🎯 目标：${parseInt(CALC_TASK.currentIssue) + 1} 期
⚡ 阶段：${phaseName}
🔄 迭代：${CALC_TASK.iterations}
📊 进度：${bar} ${timePct}%
⏱️ 剩余：${timeLeft} 分钟
━━━━━━━━━━━━━━
`;
        const extra = { 
            parse_mode: 'Markdown', 
            ...Markup.inlineKeyboard([
                Markup.button.callback('🔄 刷新', 'refresh_prog')
            ]) 
        };
        
        if (isEdit) { 
            await ctx.editMessageText(text, extra).catch(()=>{}); 
            await ctx.answerCbQuery('状态已更新'); 
        } else {
            await ctx.reply(text, extra);
        }
    };
    bot.hears('⏳ 计算进度', (ctx) => sendProgressMsg(ctx, false));
    bot.action('refresh_prog', (ctx) => sendProgressMsg(ctx, true));


    // --- 功能 D: 设置时长 ---
    bot.hears('⚙️ 设置时长', (ctx) => {
        const h = DEEP_CALC_DURATION / 3600000;
        ctx.reply(`当前深度计算时长: ${h} 小时\n(此时长将用于 Phase 1 和 Phase 2)\n请选择新的时长:`, getDurationMenu());
    });
    bot.action(/set_dur_([\d\.]+)/, (ctx) => {
        const hours = parseFloat(ctx.match[1]);
        DEEP_CALC_DURATION = hours * 60 * 60 * 1000;
        ctx.answerCbQuery(`已设置为 ${hours} 小时`);
        ctx.editMessageText(`✅ 计算时长已更新为: ${hours} 小时 (下次生效)`);
    });


    // --- 功能 E: 手动推送 ---
    bot.hears(/手动发频道/, async (ctx) => {
        if (!CHANNEL_ID) return ctx.reply('无频道ID');
        try {
            const [rows] = await db.query('SELECT * FROM lottery_results ORDER BY issue DESC LIMIT 1');
            const row = rows[0];
            const nextIssue = parseInt(row.issue) + 1;
            
            let pred = safeParse(row.deep_prediction) || safeParse(row.next_prediction);
            let title = row.deep_prediction ? '🚀 深度加强版' : '🏁 基础版';
            
            if (!pred) return ctx.reply('暂无数据');

            const msgText = formatPredictionText(nextIssue, pred, title);
            await bot.telegram.sendMessage(CHANNEL_ID, msgText, { parse_mode: 'Markdown' });
            ctx.reply(`✅ 已手动推送：${title}`);
        } catch (e) { ctx.reply('发送失败: ' + e.message); }
    });


    // --- 功能 F: 历史走势 (完全回归) ---
    bot.hears('📊 历史走势', async (ctx) => {
        // 取最近15期
        const [rows] = await db.query('SELECT issue, special_code, shengxiao FROM lottery_results ORDER BY issue DESC LIMIT 15');
        let msg = '📉 **近期特码走势**\n━━━━━━━━━━━━━━\n';
        rows.forEach(r => msg += `\`${r.issue}期\` : **${String(r.special_code).padStart(2,'0')}** (${r.shengxiao})\n`);
        ctx.reply(msg, { parse_mode: 'Markdown' });
    });

    bot.hears('🗑 删除记录', (ctx) => {
        if (ctx.from) {
            userStates[ctx.from.id] = 'WAIT_DEL';
            ctx.reply('请输入要删除的期号 (如 2024001):');
        }
    });
    
    bot.hears(/自动推送/, (ctx) => {
        AUTO_SEND_ENABLED = !AUTO_SEND_ENABLED;
        ctx.reply(`自动推送: ${AUTO_SEND_ENABLED ? '✅ 开' : '❌ 关'}`, getMainMenu());
    });


    // --- 中间件与启动 ---
    bot.use(async (ctx, next) => {
        if (ctx.channelPost) {
            if (CHANNEL_ID && String(ctx.chat.id) === String(CHANNEL_ID)) return next();
            return;
        }
        if (ctx.from && ctx.from.id === ADMIN_ID) return next();
    });

    bot.start((ctx) => {
        if (ctx.from) userStates[ctx.from.id] = null;
        ctx.reply('🤖 五行杀号算法系统 (Fusion V10.3) 已就绪', getMainMenu());
    });

    // --- 消息监听 (开奖录入) ---
    bot.on(['text', 'channel_post'], async (ctx) => {
        const text = ctx.message?.text || ctx.channelPost?.text;
        if (!text) return;

        // 处理删除
        if (ctx.from && userStates[ctx.from.id] === 'WAIT_DEL' && ctx.chat.type === 'private') {
            await db.execute('DELETE FROM lottery_results WHERE issue = ?', [text]);
            userStates[ctx.from.id] = null;
            return ctx.reply(`✅ 第 ${text} 期已删除`, getMainMenu());
        }

        // 处理开奖录入
        const result = parseLotteryResult(text);
        if (result) {
            const { issue, flatNumbers, specialCode, shengxiao } = result;
            // 立即生成初始预测，防止空窗期
            let initialPred = generateSinglePrediction([]); 
            const jsonNums = JSON.stringify(flatNumbers);
            const jsonPred = JSON.stringify(initialPred);
            
            try {
                // 存库
                await db.execute(`
                    INSERT INTO lottery_results (issue, numbers, special_code, shengxiao, next_prediction, deep_prediction, open_date)
                    VALUES (?, ?, ?, ?, ?, NULL, NOW())
                    ON DUPLICATE KEY UPDATE numbers=?, special_code=?, shengxiao=?, next_prediction=?, deep_prediction=NULL, open_date=NOW()
                `, [issue, jsonNums, specialCode, shengxiao, jsonPred, jsonNums, specialCode, shengxiao, jsonPred]);

                // 启动 Phase 1 任务
                CALC_TASK = {
                    isRunning: true,
                    phase: 1,
                    startTime: Date.now(),
                    targetDuration: DEEP_CALC_DURATION,
                    targetIterations: 1000000,         
                    currentIssue: issue,
                    bestScore: -9999,
                    bestPrediction: initialPred,
                    iterations: 0,
                    historyCache: null,
                    isProcessing: false
                };

                const h = DEEP_CALC_DURATION / 3600000;
                const msg = `✅ **第 ${issue} 期录入成功**\n\n🚀 自动启动计算任务\nPhase 1: ${h}小时 (完成后发频道)\nPhase 2: ${h}小时 (完成后通知)\n算法: 五行生克 + 智能杀号 + 历史回溯`;
                
                if (ctx.chat?.type === 'private') ctx.replyWithMarkdown(msg);
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
