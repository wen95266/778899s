const { Telegraf, Markup } = require('telegraf');
const db = require('./db');
const { parseLotteryResult, generateSinglePrediction, scorePrediction } = require('./utils');

// --- 全局配置 ---
let AUTO_SEND_ENABLED = true;

// --- 任务管理器 ---
// 核心状态机：Phase 1 (2小时/推频道) -> Phase 2 (3小时/私享)
let CALC_TASK = {
    isRunning: false,
    phase: 1,
    startTime: 0,
    targetDuration: 0,
    currentIssue: '',
    bestScore: -1,
    bestPrediction: null,
    iterations: 0
};

// 用户操作状态 (用于删除记录等多步操作)
const userStates = {};

// --- 辅助函数：主菜单 ---
function getMainMenu() {
    const autoSendIcon = AUTO_SEND_ENABLED ? '✅' : '❌';
    return Markup.keyboard([
        ['🔮 下期预测', '⏳ 计算进度'],
        ['🔭 深度演算', '📊 历史走势'],
        ['📡 手动发频道', `${autoSendIcon} 自动推送`],
        ['🗑 删除记录']
    ]).resize();
}

// --- 辅助函数：格式化预测文案 ---
function formatPredictionText(issue, pred, titlePrefix = '') {
    const waveMap = { red: '🔴 红波', blue: '🔵 蓝波', green: '🟢 绿波' };
    const safeJoin = (arr) => arr ? arr.join(' ') : '?';
    
    // 兼容旧数据
    const mainHead = pred.hot_head !== undefined ? pred.hot_head : '?';
    const defHead = pred.fang_head !== undefined ? pred.fang_head : '?';
    const tails = pred.rec_tails ? pred.rec_tails.join('、') : '?';
    
    return `
${titlePrefix} **第 ${issue} 期**
━━━━━━━━━━━━━━
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
`.trim();
}

// --- 核心启动函数 ---
function startBot() {
    const bot = new Telegraf(process.env.BOT_TOKEN);
    const ADMIN_ID = parseInt(process.env.ADMIN_ID);
    const CHANNEL_ID = process.env.CHANNEL_ID;

    // ===========================
    // 1. 后台计算循环 (每3秒一次)
    // ===========================
    setInterval(async () => {
        if (!CALC_TASK.isRunning) return;

        const now = Date.now();
        
        // --- A. 检查任务是否完成 ---
        if (now - CALC_TASK.startTime >= CALC_TASK.targetDuration) {
            CALC_TASK.isRunning = false;
            console.log(`[任务完成] 第 ${CALC_TASK.currentIssue} 期 (Phase ${CALC_TASK.phase})`);
            
            try {
                const jsonPred = JSON.stringify(CALC_TASK.bestPrediction);
                const nextIssue = parseInt(CALC_TASK.currentIssue) + 1;
                
                // Phase 1 结束：存 next_prediction，推频道
                if (CALC_TASK.phase === 1) {
                    await db.execute('UPDATE lottery_results SET next_prediction=? WHERE issue=?', [jsonPred, CALC_TASK.currentIssue]);
                    
                    if (AUTO_SEND_ENABLED && CHANNEL_ID) {
                        const msg = formatPredictionText(nextIssue, CALC_TASK.bestPrediction, '🏁 最终决策');
                        await bot.telegram.sendMessage(CHANNEL_ID, msg, { parse_mode: 'Markdown' });
                        bot.telegram.sendMessage(ADMIN_ID, `✅ 第 ${nextIssue} 期 (基础版) 计算完毕，已自动推送到频道。`);
                    }
                } 
                // Phase 2 结束：存 deep_prediction，不推频道，通知管理员
                else if (CALC_TASK.phase === 2) {
                    await db.execute('UPDATE lottery_results SET deep_prediction=? WHERE issue=?', [jsonPred, CALC_TASK.currentIssue]);
                    
                    // 发送完成通知，带“立即查看”按钮
                    bot.telegram.sendMessage(ADMIN_ID, `✅ 第 ${nextIssue} 期 **深度增量计算** 已完成！`, {
                        parse_mode: 'Markdown',
                        ...Markup.inlineKeyboard([
                            Markup.button.callback('👁️ 立即查看深度结果', 'show_deep_final')
                        ])
                    });
                }
            } catch (e) { console.error('保存/推送失败:', e); }
            return;
        }

        // --- B. 执行模拟计算 ---
        try {
            const [historyRows] = await db.query('SELECT numbers, special_code, shengxiao FROM lottery_results ORDER BY issue DESC LIMIT 50');
            for(let i=0; i<5; i++) {
                const tempPred = generateSinglePrediction(historyRows);
                const score = scorePrediction(tempPred, historyRows);
                
                if (score > CALC_TASK.bestScore) {
                    CALC_TASK.bestScore = score;
                    CALC_TASK.bestPrediction = tempPred;
                    
                    const jsonPred = JSON.stringify(tempPred);
                    // Phase 1: 实时更新库 (给前端看)
                    if (CALC_TASK.phase === 1) {
                        await db.execute('UPDATE lottery_results SET next_prediction=? WHERE issue=?', [jsonPred, CALC_TASK.currentIssue]);
                    }
                    // Phase 2: 实时更新库 (给管理员查进度看)
                    else if (CALC_TASK.phase === 2) {
                        await db.execute('UPDATE lottery_results SET deep_prediction=? WHERE issue=?', [jsonPred, CALC_TASK.currentIssue]);
                    }
                }
                CALC_TASK.iterations++;
            }
        } catch (e) { console.error("后台计算出错:", e); }
    }, 3000);

    // ===========================
    // 2. 权限与路由
    // ===========================
    bot.use(async (ctx, next) => {
        if (ctx.channelPost) {
            if (CHANNEL_ID && String(ctx.chat.id) === String(CHANNEL_ID)) return next();
            return;
        }
        if (ctx.from && ctx.from.id === ADMIN_ID) return next();
    });

    bot.start((ctx) => {
        userStates[ctx.from.id] = null;
        ctx.reply('🤖 智能预测系统 V4.2 (Full Feature) 已就绪', getMainMenu());
    });

    // ===========================
    // 3. 核心交互功能
    // ===========================

    // --- 功能 A: 🔭 深度演算 (含偷看功能) ---
    const handleDeepCalc = async (ctx, isRefresh = false) => {
        try {
            const [rows] = await db.query('SELECT * FROM lottery_results ORDER BY issue DESC LIMIT 1');
            if (!rows.length) return ctx.reply('暂无数据');
            
            const row = rows[0];
            const nextIssue = parseInt(row.issue) + 1;

            // [逻辑分支 1] 深度计算正在进行中 -> 显示进度 + 偷看按钮
            // 优先判断任务状态，确保计算时能看到进度
            if (CALC_TASK.isRunning && CALC_TASK.phase === 2 && CALC_TASK.currentIssue == row.issue) {
                const now = Date.now();
                const percent = Math.min(100, Math.floor(((now - CALC_TASK.startTime) / CALC_TASK.targetDuration) * 100));
                const timeLeft = Math.ceil((CALC_TASK.targetDuration - (now - CALC_TASK.startTime)) / 1000 / 60);

                const text = `
🌌 **深度模型演算中...**
━━━━━━━━━━━━━━
🎯 目标：${nextIssue} 期
🔄 迭代：${CALC_TASK.iterations} 次
⏳ 剩余：约 ${timeLeft} 分钟
📊 进度：${percent}%
━━━━━━━━━━━━━━
_您可以点击下方按钮预览当前最优解_
`.trim();
                const extra = { 
                    parse_mode: 'Markdown', 
                    ...Markup.inlineKeyboard([
                        [Markup.button.callback('👁️ 偷看当前结果', 'peek_deep')],
                        [Markup.button.callback('🔄 刷新进度', 'refresh_deep')]
                    ]) 
                };
                return isRefresh ? ctx.editMessageText(text, extra).catch(()=>{}) : ctx.reply(text, extra);
            }

            // [逻辑分支 2] 深度计算已完成 (数据库有值且不在跑) -> 显示结果
            if (row.deep_prediction) {
                let deepPred = typeof row.deep_prediction === 'string' ? JSON.parse(row.deep_prediction) : row.deep_prediction;
                const text = formatPredictionText(nextIssue, deepPred, '🚀 深度加强版 (增量结果)');
                const extra = { parse_mode: 'Markdown', ...Markup.inlineKeyboard([Markup.button.callback('🔄 重新加载', 'refresh_deep')]) };
                return isRefresh ? ctx.editMessageText(text, extra).catch(()=>{}) : ctx.reply(text, extra);
            }

            // [逻辑分支 3] 基础版未完成 -> 阻止启动
            if (CALC_TASK.isRunning && CALC_TASK.phase === 1) {
                 const msg = '⚠️ **基础计算尚未完成**\n请等待 2 小时基础任务完成后，再启动深度计算。';
                 return isRefresh ? ctx.answerCbQuery(msg, {show_alert:true}) : ctx.replyWithMarkdown(msg);
            }

            // [逻辑分支 4] 启动深度计算
            // 继承基础版结果作为起点
            let startPred = null;
            if (row.next_prediction) {
                startPred = typeof row.next_prediction === 'string' ? JSON.parse(row.next_prediction) : row.next_prediction;
            }

            CALC_TASK = {
                isRunning: true,
                phase: 2, // 进入 Phase 2
                startTime: Date.now(),
                targetDuration: 3 * 60 * 60 * 1000, // 3小时
                currentIssue: row.issue,
                bestScore: -1,
                bestPrediction: startPred, 
                iterations: 0
            };

            const startMsg = `🚀 **深度计算已启动**\n\n🎯 目标：第 ${nextIssue} 期\n⏱️ 耗时：3 小时\n\n计算将在后台进行，您可以随时点击本按钮查看进度和预览。`;
            return isRefresh ? ctx.editMessageText(startMsg, {parse_mode:'Markdown'}) : ctx.replyWithMarkdown(startMsg);

        } catch (e) { console.error(e); ctx.reply('系统错误'); }
    };

    bot.hears('🔭 深度演算', (ctx) => handleDeepCalc(ctx, false));
    bot.action('refresh_deep', (ctx) => handleDeepCalc(ctx, true));
    
    // 监听 "立即查看结果" 按钮
    bot.action('show_deep_final', (ctx) => handleDeepCalc(ctx, false));

    // 监听 "偷看当前结果" 按钮 (新增功能)
    bot.action('peek_deep', async (ctx) => {
        if (!CALC_TASK.isRunning || !CALC_TASK.bestPrediction) {
            return ctx.answerCbQuery('⚠️ 暂无数据或计算已停止', {show_alert: true});
        }
        const nextIssue = parseInt(CALC_TASK.currentIssue) + 1;
        const msg = formatPredictionText(nextIssue, CALC_TASK.bestPrediction, '👁️ 实时偷看 (计算中)');
        // 发送一条临时消息，不影响主面板
        await ctx.reply(msg, { parse_mode: 'Markdown' });
        ctx.answerCbQuery('已生成预览快照');
    });

    // --- 功能 B: 🔮 下期预测 (基础版) ---
    bot.hears('🔮 下期预测', async (ctx) => {
        try {
            const [rows] = await db.query('SELECT * FROM lottery_results ORDER BY issue DESC LIMIT 1');
            if (!rows.length) return ctx.reply('暂无数据');
            
            const row = rows[0];
            const nextIssue = parseInt(row.issue) + 1;
            let pred = typeof row.next_prediction === 'string' ? JSON.parse(row.next_prediction) : row.next_prediction;
            
            if (!pred) return ctx.reply('⚠️ 数据生成中...');

            // 判断 Phase 1 是否正在运行
            const isCalc = CALC_TASK.isRunning && CALC_TASK.phase === 1 && CALC_TASK.currentIssue == row.issue;
            
            const msg = formatPredictionText(nextIssue, pred, isCalc ? '🧠 基础演算中...' : '🏁 基础版预测');
            ctx.reply(msg, { parse_mode: 'Markdown' });
        } catch (e) { console.error(e); }
    });

    // --- 功能 C: ⏳ 计算进度 (通用) ---
    bot.hears('⏳ 计算进度', (ctx) => {
        if (!CALC_TASK.isRunning) return ctx.reply('💤 当前无活跃计算任务');
        const phaseName = CALC_TASK.phase === 1 ? 'Phase 1 (基础版)' : 'Phase 2 (深度版)';
        const now = Date.now();
        const timeLeft = Math.ceil((CALC_TASK.targetDuration - (now - CALC_TASK.startTime)) / 1000 / 60);
        ctx.reply(`🖥 **任务状态**\n阶段：${phaseName}\n剩余：${timeLeft} 分钟`);
    });

    // --- 功能 D: 自动推送开关 ---
    bot.hears(/自动推送/, (ctx) => {
        AUTO_SEND_ENABLED = !AUTO_SEND_ENABLED;
        ctx.reply(`配置已更新：自动推送功能 ${AUTO_SEND_ENABLED ? '✅ 已开启' : '❌ 已关闭'}`, getMainMenu());
    });

    // --- 功能 E: 📡 手动发频道 ---
    bot.hears('📡 手动发频道', async (ctx) => {
        if (!CHANNEL_ID) return ctx.reply('❌ 未配置频道 ID');
        try {
            const [rows] = await db.query('SELECT * FROM lottery_results ORDER BY issue DESC LIMIT 1');
            const row = rows[0];
            const nextIssue = parseInt(row.issue) + 1;
            let pred = typeof row.next_prediction === 'string' ? JSON.parse(row.next_prediction) : row.next_prediction;
            
            const msg = formatPredictionText(nextIssue, pred, '📡 手动推送');
            await ctx.telegram.sendMessage(CHANNEL_ID, msg, { parse_mode: 'Markdown' });
            ctx.reply('✅ 已手动推送到频道');
        } catch (e) { ctx.reply('❌ 推送失败: ' + e.message); }
    });

    // --- 功能 F: 🗑 删除记录 (状态机) ---
    bot.hears('🗑 删除记录', (ctx) => {
        userStates[ctx.from.id] = 'WAITING_DELETE_ISSUE';
        ctx.reply('⚠️ **进入删除模式**\n请输入要删除的期号 (如 2025334)\n发送 "取消" 退出', Markup.removeKeyboard());
    });

    // --- 功能 G: 📊 历史走势 ---
    bot.hears('📊 历史走势', async (ctx) => {
        const [rows] = await db.query('SELECT issue, special_code, shengxiao FROM lottery_results ORDER BY issue DESC LIMIT 10');
        let msg = '📉 **近期特码走势**\n\n';
        rows.forEach(r => msg += `\`${r.issue}期\` : **${r.special_code}** (${r.shengxiao})\n`);
        ctx.reply(msg, { parse_mode: 'Markdown' });
    });

    // ===========================
    // 4. 文本监听 (录入 / 删除)
    // ===========================
    bot.on(['text', 'channel_post'], async (ctx) => {
        const text = ctx.message?.text || ctx.channelPost?.text;
        if (!text) return;

        // [处理删除]
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

        // [处理开奖录入] -> 触发 Phase 1
        const result = parseLotteryResult(text);
        if (result) {
            const { issue, flatNumbers, specialCode, shengxiao } = result;
            
            let initialPred = {};
            try {
                const [h] = await db.query('SELECT numbers, special_code, shengxiao FROM lottery_results ORDER BY issue DESC LIMIT 50');
                initialPred = generateSinglePrediction(h);
            } catch(e) { initialPred = generateSinglePrediction([]); }

            const jsonNums = JSON.stringify(flatNumbers);
            const jsonPred = JSON.stringify(initialPred);
            
            try {
                // 存入数据库 (注意: 录入新一期时，会清空 deep_prediction 为 NULL)
                await db.execute(`
                    INSERT INTO lottery_results (issue, numbers, special_code, shengxiao, next_prediction, deep_prediction, open_date)
                    VALUES (?, ?, ?, ?, ?, NULL, NOW())
                    ON DUPLICATE KEY UPDATE numbers=?, special_code=?, shengxiao=?, next_prediction=?, deep_prediction=NULL, open_date=NOW()
                `, [issue, jsonNums, specialCode, shengxiao, jsonPred, jsonNums, specialCode, shengxiao, jsonPred]);

                // 启动 Phase 1
                CALC_TASK = {
                    isRunning: true,
                    phase: 1, // 基础模式
                    startTime: Date.now(),
                    targetDuration: 2 * 60 * 60 * 1000, 
                    currentIssue: issue,
                    bestScore: -1,
                    bestPrediction: initialPred,
                    iterations: 0
                };

                const replyMsg = `✅ **第 ${issue} 期录入成功**\n特码：${specialCode} (${shengxiao})\n\n🧠 **基础模型已启动** (预计2小时)\n完成后将自动推送到频道。`;
                if (ctx.chat.type === 'private') ctx.replyWithMarkdown(replyMsg);
            } catch (err) { console.error(err); }
        }
    });

    bot.launch().catch(err => console.error(err));
    process.once('SIGINT', () => bot.stop('SIGINT'));
    process.once('SIGTERM', () => bot.stop('SIGTERM'));

    return bot;
}

module.exports = startBot;
