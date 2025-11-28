const { Telegraf, Markup } = require('telegraf');
const db = require('./db');
const { parseLotteryResult, generateSinglePrediction, scorePrediction } = require('./utils');

// --- 全局配置与状态 ---
let AUTO_SEND_ENABLED = true; // 默认开启自动推送

// 核心状态机
// Phase 1: 基础模型 (2小时) -> 自动推频道
// Phase 2: 深度模型 (3小时) -> 管理员私享/手动推
let CALC_TASK = {
    isRunning: false,
    phase: 1,           // 1=基础, 2=深度
    startTime: 0,
    targetDuration: 0,  // 动态设置
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
        ['🔭 深度演算', '📊 历史走势'], // 新增：深度演算入口
        ['📡 手动发频道', autoSendText], 
        ['🗑 删除记录']
    ]).resize();
}

// --- 辅助函数：格式化预测文案 (兼容 71 的排版和 73 的标题逻辑) ---
// isFinalOrTitle: true(最终版), false(计算中), string(自定义标题)
function formatPredictionText(issue, pred, isFinalOrTitle = false) {
    const waveMap = { red: '🔴 红波', blue: '🔵 蓝波', green: '🟢 绿波' };
    
    // 确定标题
    let title = '';
    if (typeof isFinalOrTitle === 'string') {
        title = isFinalOrTitle; // 自定义标题 (如 "🚀 深度加强版")
    } else {
        title = isFinalOrTitle ? `🏁 第 ${issue} 期 最终决策` : `🧠 第 ${issue} 期 AI 演算中...`;
    }
    
    // 处理旧数据兼容性
    const mainHead = pred.hot_head !== undefined ? pred.hot_head : '?';
    const defHead = pred.fang_head !== undefined ? pred.fang_head : '?';
    const tails = pred.rec_tails ? pred.rec_tails.join('、') : (pred.hot_tail || '?');
    
    const safeJoin = (arr) => arr ? arr.join(' ') : '?';

    return `
${title}
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
${typeof isFinalOrTitle === 'boolean' && isFinalOrTitle ? '✅ 数据库已更新 | 等待开奖验证' : `🔄 模型迭代次数: ${CALC_TASK.iterations}`}
`.trim();
}

// --- 核心：启动 Bot ---
function startBot() {
    const bot = new Telegraf(process.env.BOT_TOKEN);
    const ADMIN_ID = parseInt(process.env.ADMIN_ID);
    const CHANNEL_ID = process.env.CHANNEL_ID;

    // --- 后台计算任务循环 (融合版) ---
    setInterval(async () => {
        if (!CALC_TASK.isRunning) return;

        const now = Date.now();
        
        // A. 检查任务是否完成
        if (now - CALC_TASK.startTime >= CALC_TASK.targetDuration) {
            CALC_TASK.isRunning = false;
            console.log(`[计算完成] 第 ${CALC_TASK.currentIssue} 期 (Phase ${CALC_TASK.phase})`);
            
            try {
                const nextIssue = parseInt(CALC_TASK.currentIssue) + 1;
                const jsonPred = JSON.stringify(CALC_TASK.bestPrediction);

                // --- Phase 1 结束 (基础版) ---
                if (CALC_TASK.phase === 1) {
                    // 存入 next_prediction
                    await db.execute('UPDATE lottery_results SET next_prediction=? WHERE issue=?', [jsonPred, CALC_TASK.currentIssue]);
                    
                    // 自动推送到频道 (71原有逻辑)
                    if (AUTO_SEND_ENABLED && CHANNEL_ID && CALC_TASK.bestPrediction) {
                        const msg = formatPredictionText(nextIssue, CALC_TASK.bestPrediction, true);
                        await bot.telegram.sendMessage(CHANNEL_ID, msg, { parse_mode: 'Markdown' });
                        bot.telegram.sendMessage(ADMIN_ID, `✅ 第 ${nextIssue} 期 (基础版) 计算完毕，已自动推送到频道。`);
                    }
                } 
                // --- Phase 2 结束 (深度版 - 新增) ---
                else if (CALC_TASK.phase === 2) {
                    // 存入 deep_prediction
                    await db.execute('UPDATE lottery_results SET deep_prediction=? WHERE issue=?', [jsonPred, CALC_TASK.currentIssue]);
                    
                    // 深度版默认不自动推频道，只通知管理员，由管理员手动发
                    bot.telegram.sendMessage(ADMIN_ID, `✅ 第 ${nextIssue} 期 **深度增量计算** 已完成！`, {
                        parse_mode: 'Markdown',
                        ...Markup.inlineKeyboard([
                            Markup.button.callback('👁️ 立即查看深度结果', 'show_deep_final')
                        ])
                    });
                }
            } catch (e) { console.error('任务完成处理失败:', e); }
            return;
        }

        // B. 执行计算迭代
        try {
            const [historyRows] = await db.query('SELECT numbers, special_code, shengxiao FROM lottery_results ORDER BY issue DESC LIMIT 50');
            
            for(let i=0; i<5; i++) {
                const tempPred = generateSinglePrediction(historyRows);
                const score = scorePrediction(tempPred, historyRows);
                
                if (score > CALC_TASK.bestScore) {
                    CALC_TASK.bestScore = score;
                    CALC_TASK.bestPrediction = tempPred;
                    
                    const jsonPred = JSON.stringify(tempPred);
                    
                    // 实时更新数据库 (根据阶段更新不同字段)
                    if (CALC_TASK.phase === 1) {
                        await db.execute('UPDATE lottery_results SET next_prediction=? WHERE issue=?', [jsonPred, CALC_TASK.currentIssue]);
                    } else if (CALC_TASK.phase === 2) {
                        await db.execute('UPDATE lottery_results SET deep_prediction=? WHERE issue=?', [jsonPred, CALC_TASK.currentIssue]);
                    }
                }
                CALC_TASK.iterations++;
            }
        } catch (e) { console.error("后台计算出错:", e); }
    }, 3000); // 每3秒执行一次

    // --- 中间件：权限校验 ---
    bot.use(async (ctx, next) => {
        if (ctx.channelPost) {
            if (CHANNEL_ID && String(ctx.chat.id) === String(CHANNEL_ID)) return next();
            return;
        }
        if (ctx.from && ctx.from.id === ADMIN_ID) return next();
    });

    bot.start((ctx) => {
        userStates[ctx.from.id] = null;
        ctx.reply('🤖 智能预测系统 V5.0 (Ultimate) 已就绪', getMainMenu());
    });

    // --- 功能 1: 🔮 下期预测 (基础版 - 带刷新) ---
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

            // 判断是否是 Phase 1 正在计算
            const isCalculating = CALC_TASK.isRunning && CALC_TASK.phase === 1 && CALC_TASK.currentIssue == row.issue;
            
            const text = formatPredictionText(nextIssue, pred, !isCalculating);
            const extra = {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                    Markup.button.callback('🔄 刷新预测数据', 'refresh_pred')
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

    // --- 功能 2: 🔭 深度演算 (新增功能) ---
    const handleDeepCalc = async (ctx, isRefresh = false) => {
        try {
            const [rows] = await db.query('SELECT * FROM lottery_results ORDER BY issue DESC LIMIT 1');
            if (!rows.length) return ctx.reply('暂无数据');
            
            const row = rows[0];
            const nextIssue = parseInt(row.issue) + 1;

            // [情况 A] 深度计算正在进行 -> 显示进度 + 偷看
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

            // [情况 B] 深度计算已完成 -> 显示结果
            if (row.deep_prediction) {
                let deepPred = typeof row.deep_prediction === 'string' ? JSON.parse(row.deep_prediction) : row.deep_prediction;
                const text = formatPredictionText(nextIssue, deepPred, '🚀 深度加强版 (增量结果)');
                const extra = { parse_mode: 'Markdown', ...Markup.inlineKeyboard([Markup.button.callback('🔄 重新加载', 'refresh_deep')]) };
                return isRefresh ? ctx.editMessageText(text, extra).catch(()=>{}) : ctx.reply(text, extra);
            }

            // [情况 C] 基础版都还没跑完 -> 阻止启动
            if (CALC_TASK.isRunning && CALC_TASK.phase === 1) {
                 const msg = '⚠️ **基础计算尚未完成**\n请等待 2 小时基础任务完成后，再启动深度计算。';
                 return isRefresh ? ctx.answerCbQuery(msg, {show_alert:true}) : ctx.replyWithMarkdown(msg);
            }

            // [情况 D] 启动深度计算
            // 继承基础版结果作为起点
            let startPred = null;
            if (row.next_prediction) {
                startPred = typeof row.next_prediction === 'string' ? JSON.parse(row.next_prediction) : row.next_prediction;
            }

            CALC_TASK = {
                isRunning: true,
                phase: 2, // 标记为深度阶段
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
    bot.action('show_deep_final', (ctx) => handleDeepCalc(ctx, false));

    // 偷看功能
    bot.action('peek_deep', async (ctx) => {
        if (!CALC_TASK.isRunning || !CALC_TASK.bestPrediction) {
            return ctx.answerCbQuery('⚠️ 暂无数据或计算已停止', {show_alert: true});
        }
        const nextIssue = parseInt(CALC_TASK.currentIssue) + 1;
        const msg = formatPredictionText(nextIssue, CALC_TASK.bestPrediction, '👁️ 实时偷看 (计算中)');
        await ctx.reply(msg, { parse_mode: 'Markdown' });
        ctx.answerCbQuery('已生成预览快照');
    });

    // --- 功能 3: ⏳ 计算进度 (通用版) ---
    const sendProgressMsg = async (ctx, isEdit = false) => {
        if (!CALC_TASK.isRunning) {
            const msg = '💤 当前无活跃计算任务。';
            return isEdit ? ctx.answerCbQuery(msg, { show_alert: true }) : ctx.reply(msg);
        }

        const now = Date.now();
        const percent = Math.min(100, Math.floor(((now - CALC_TASK.startTime) / CALC_TASK.targetDuration) * 100));
        const timeLeft = Math.ceil((CALC_TASK.targetDuration - (now - CALC_TASK.startTime)) / 1000 / 60);
        const phaseName = CALC_TASK.phase === 1 ? 'Phase 1 (基础版)' : 'Phase 2 (深度版)';

        const text = `
🖥 **AI 深度计算中...**
━━━━━━━━━━━━━━
🎯 目标期号：${parseInt(CALC_TASK.currentIssue) + 1} 期
⚡ 当前阶段：${phaseName}
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

    // --- 功能 4: 切换自动推送开关 ---
    bot.hears(/自动推送/, (ctx) => {
        AUTO_SEND_ENABLED = !AUTO_SEND_ENABLED;
        const status = AUTO_SEND_ENABLED ? '✅ 已开启' : '❌ 已关闭';
        ctx.reply(`配置已更新：自动推送功能 ${status}`, getMainMenu());
    });

    // --- 功能 5: 📊 历史走势 ---
    bot.hears('📊 历史走势', async (ctx) => {
        const [rows] = await db.query('SELECT issue, special_code, shengxiao FROM lottery_results ORDER BY issue DESC LIMIT 10');
        let msg = '📉 **近期特码走势**\n\n';
        rows.forEach(r => msg += `\`${r.issue}期\` : **${r.special_code}** (${r.shengxiao})\n`);
        ctx.reply(msg, { parse_mode: 'Markdown' });
    });

    // --- 功能 6: 📡 手动发频道 ---
    bot.hears('📡 手动发频道', async (ctx) => {
        if (!CHANNEL_ID) return ctx.reply('❌ 未配置频道 ID');
        try {
            const [rows] = await db.query('SELECT * FROM lottery_results ORDER BY issue DESC LIMIT 1');
            const row = rows[0];
            const nextIssue = parseInt(row.issue) + 1;
            
            // 优先推送深度版，如果没有则推送基础版
            let pred = null;
            let title = '';
            
            if (row.deep_prediction) {
                pred = typeof row.deep_prediction === 'string' ? JSON.parse(row.deep_prediction) : row.deep_prediction;
                title = '📡 手动推送 (深度版)';
            } else {
                pred = typeof row.next_prediction === 'string' ? JSON.parse(row.next_prediction) : row.next_prediction;
                title = '📡 手动推送 (基础版)';
            }
            
            if (!pred) return ctx.reply('⚠️ 暂无预测数据');

            const msg = formatPredictionText(nextIssue, pred, title);
            await ctx.telegram.sendMessage(CHANNEL_ID, msg, { parse_mode: 'Markdown' });
            ctx.reply(`✅ 已手动推送到频道\n(${title})`);
        } catch (e) { ctx.reply('❌ 推送失败: ' + e.message); }
    });

    // --- 功能 7: 🗑 删除记录 ---
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
            
            let initialPred = {};
            try {
                const [h] = await db.query('SELECT numbers, special_code, shengxiao FROM lottery_results ORDER BY issue DESC LIMIT 50');
                initialPred = generateSinglePrediction(h);
            } catch(e) { initialPred = generateSinglePrediction([]); }

            const jsonNums = JSON.stringify(flatNumbers);
            const jsonPred = JSON.stringify(initialPred);
            
            try {
                // 存入数据库 (注意: 录入新一期时，必须清空 deep_prediction 为 NULL，防止混淆)
                // 假设您的数据库已经添加了 deep_prediction 字段。如果没有，请忽略该字段或手动在数据库添加。
                await db.execute(`
                    INSERT INTO lottery_results (issue, numbers, special_code, shengxiao, next_prediction, deep_prediction, open_date)
                    VALUES (?, ?, ?, ?, ?, NULL, NOW())
                    ON DUPLICATE KEY UPDATE numbers=?, special_code=?, shengxiao=?, next_prediction=?, deep_prediction=NULL, open_date=NOW()
                `, [issue, jsonNums, specialCode, shengxiao, jsonPred, jsonNums, specialCode, shengxiao, jsonPred]);

                // 🚀 启动 Phase 1 (基础计算)
                CALC_TASK = {
                    isRunning: true,
                    phase: 1, // 基础阶段
                    startTime: Date.now(),
                    targetDuration: 2 * 60 * 60 * 1000, // 2小时
                    currentIssue: issue,
                    bestScore: -1,
                    bestPrediction: initialPred,
                    iterations: 0
                };

                const replyMsg = `✅ **第 ${issue} 期录入成功**\n特码：${specialCode} (${shengxiao})\n\n🚀 **Phase 1: 基础模型已启动** (预计2小时)\n计算完成后将自动推送到频道。`;
                
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
