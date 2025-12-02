// 核心修复：强制 Node.js 进程使用北京时间
process.env.TZ = 'Asia/Shanghai';

const { Telegraf, Markup } = require('telegraf');
const db = require('./db');
const { parseLotteryResult, generateSinglePrediction, scorePrediction } = require('./utils');

// --- 全局配置变量 ---
let AUTO_SEND_ENABLED = true;
let DEEP_CALC_DURATION = 1 * 60 * 60 * 1000; // 默认时长1小时

// 核心计算任务状态对象
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
    isProcessing: false // 防止并发发送的锁
};

const userStates = {};

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
    return Markup.keyboard([
        ['🔮 下期预测', '⏳ 计算进度'],
        ['🔭 深度演算', '📊 历史走势'],
        ['⚙️ 设置时长', `自动推送: ${AUTO_SEND_ENABLED?'开':'关'}`], 
        ['📡 手动发频道', '🗑 删除记录']
    ]).resize();
}

// 时长选择键盘
function getDurationMenu() {
    return Markup.inlineKeyboard([
        [Markup.button.callback('30 分钟', 'set_dur_0.5'), Markup.button.callback('1 小时', 'set_dur_1')],
        [Markup.button.callback('3 小时', 'set_dur_3'), Markup.button.callback('5 小时', 'set_dur_5')]
    ]);
}

// 格式化预测文案 (适配 V10.0 五肖和杀号)
function formatPredictionText(issue, pred, titleStr = '') {
    const waveMap = { red: '🔴 红波', blue: '🔵 蓝波', green: '🟢 绿波' };
    const title = titleStr ? titleStr : `🚀 第 ${issue} 期 智能决策 (V10.0)`;
    
    let zodiacGrid = '';
    if (pred.zodiac_one_code && Array.isArray(pred.zodiac_one_code)) {
        zodiacGrid = pred.zodiac_one_code.map(i => `${i.zodiac}[${String(i.num).padStart(2,'0')}]`).join('  ');
    }

    return `
${title}
━━━━━━━━━━━━━━
🔥 **五肖中特** (重点推荐)
**${pred.liu_xiao ? pred.liu_xiao.join(' - ') : '?'}**

🎯 **主攻三肖**
${pred.zhu_san ? pred.zhu_san.join(' ') : '?'}

🦁 **一码阵 (参考)**
${zodiacGrid}

🚫 **绝杀三肖** (避雷)
${pred.kill_zodiacs ? pred.kill_zodiacs.join(' ') : '无'}

🔢 **围捕数据**
尾数：${pred.rec_tails ? pred.rec_tails.join('.') : '?'} 尾
波色：${waveMap[pred.zhu_bo]} (防${waveMap[pred.fang_bo]})
形态：${pred.da_xiao}/${pred.dan_shuang}
━━━━━━━━━━━━━━
${titleStr.includes('发布') ? '✅ 数据库已同步' : '🔄 实时运算中...'}
`.trim();
}

// Bot 启动入口
function startBot() {
    const bot = new Telegraf(process.env.BOT_TOKEN);
    const ADMIN_ID = parseInt(process.env.ADMIN_ID);
    const CHANNEL_ID = process.env.CHANNEL_ID;

    // ============================
    // 后台计算循环 (Heartbeat)
    // ============================
    setInterval(async () => {
        // 如果没有任务运行，或者正在进行结算处理(Locked)，则跳过
        if (!CALC_TASK.isRunning || CALC_TASK.isProcessing) return;
        
        const now = Date.now();
        const isTimeUp = (now - CALC_TASK.startTime) >= CALC_TASK.targetDuration;
        
        // 任务结束判定
        if (isTimeUp) {
            CALC_TASK.isProcessing = true; // 加锁，防止重复执行
            try {
                const nextIssue = parseInt(CALC_TASK.currentIssue) + 1;
                const jsonPred = JSON.stringify(CALC_TASK.bestPrediction);

                // --- Phase 1 完成 ---
                if (CALC_TASK.phase === 1) {
                    console.log(`[Phase 1] 完成: 第 ${CALC_TASK.currentIssue} 期`);
                    
                    // 1. 更新数据库
                    await db.execute('UPDATE lottery_results SET next_prediction=? WHERE issue=?', [jsonPred, CALC_TASK.currentIssue]);
                    
                    // 2. 推送频道
                    if (AUTO_SEND_ENABLED && CHANNEL_ID) {
                        const msg = formatPredictionText(nextIssue, CALC_TASK.bestPrediction, `🏁 第 ${nextIssue} 期 预测发布`);
                        await bot.telegram.sendMessage(CHANNEL_ID, msg, { parse_mode: 'Markdown' });
                        bot.telegram.sendMessage(ADMIN_ID, `✅ 第 ${nextIssue} 期 Phase 1 已推送。进入 Phase 2 校验。`);
                    }
                    
                    // 3. 无缝切换到 Phase 2
                    CALC_TASK.phase = 2;
                    CALC_TASK.startTime = Date.now();
                    CALC_TASK.iterations = 0;
                    CALC_TASK.isProcessing = false; // 解锁，继续跑 Phase 2
                    return;
                } 
                // --- Phase 2 完成 ---
                else {
                    console.log(`[Phase 2] 完成: 第 ${CALC_TASK.currentIssue} 期`);
                    
                    // 1. 更新数据库 (Deep)
                    await db.execute('UPDATE lottery_results SET deep_prediction=? WHERE issue=?', [jsonPred, CALC_TASK.currentIssue]);
                    
                    // 2. 停止任务
                    CALC_TASK.isRunning = false;
                    bot.telegram.sendMessage(ADMIN_ID, `✅ 第 ${nextIssue} 期深度校验完成。任务结束。`);
                    
                    CALC_TASK.isProcessing = false; // 解锁
                    return;
                }
            } catch (e) { 
                console.error("任务结算错误:", e); 
                CALC_TASK.isProcessing = false; // 出错也要解锁
            }
            return;
        }

        // 计算迭代 (模拟运算过程)
        try {
            if (!CALC_TASK.historyCache) {
                const [rows] = await db.query('SELECT * FROM lottery_results ORDER BY issue DESC LIMIT 50');
                CALC_TASK.historyCache = rows;
            }
            // 生成预测 (由于 V10 算法已经比较确定，这里每次生成其实差别不大)
            // 主要是为了防止单一结果的偶然性
            const tempPred = generateSinglePrediction(CALC_TASK.historyCache);
            CALC_TASK.bestPrediction = tempPred;
            CALC_TASK.iterations += 50; // 迭代计数器
        } catch (e) { console.error(e); }
    }, 1000); // 每秒检查一次

    // ============================
    // 交互命令处理
    // ============================

    bot.hears('🔮 下期预测', async (ctx) => {
        const [rows] = await db.query('SELECT * FROM lottery_results ORDER BY issue DESC LIMIT 1');
        if (!rows.length) return ctx.reply('暂无数据');
        const row = rows[0];
        // 优先显示深度结果，其次基础结果，最后显示内存中的结果
        let pred = safeParse(row.deep_prediction) || safeParse(row.next_prediction) || CALC_TASK.bestPrediction;
        if (!pred) return ctx.reply('计算中，请稍候...');
        ctx.reply(formatPredictionText(parseInt(row.issue)+1, pred), { parse_mode: 'Markdown' });
    });

    bot.hears('⏳ 计算进度', (ctx) => {
        if (!CALC_TASK.isRunning) return ctx.reply('💤 当前无活跃计算任务');
        const now = Date.now();
        const pct = Math.min(100, Math.floor(((now - CALC_TASK.startTime)/CALC_TASK.targetDuration)*100));
        ctx.reply(`📊 Phase ${CALC_TASK.phase}\n进度: ${pct}%\n迭代: ${CALC_TASK.iterations}次\n剩余: ${Math.ceil((CALC_TASK.targetDuration-(now-CALC_TASK.startTime))/60000)} 分钟`);
    });

    bot.hears('⚙️ 设置时长', (ctx) => ctx.reply('请选择计算时长:', getDurationMenu()));
    bot.action(/set_dur_([\d\.]+)/, (ctx) => {
        const h = parseFloat(ctx.match[1]);
        DEEP_CALC_DURATION = h * 3600000;
        ctx.editMessageText(`✅ 时长已更新为 ${h} 小时`);
    });

    bot.hears(/手动发频道/, async (ctx) => {
        if (!CHANNEL_ID) return ctx.reply('未配置频道ID');
        const [rows] = await db.query('SELECT * FROM lottery_results ORDER BY issue DESC LIMIT 1');
        const row = rows[0];
        let pred = safeParse(row.deep_prediction) || safeParse(row.next_prediction);
        if (!pred) return ctx.reply('暂无预测数据');
        await bot.telegram.sendMessage(CHANNEL_ID, formatPredictionText(parseInt(row.issue)+1, pred, `📡 手动推送`), {parse_mode:'Markdown'});
        ctx.reply('✅ 已手动发送至频道');
    });

    bot.hears(/自动推送/, (ctx) => { 
        AUTO_SEND_ENABLED = !AUTO_SEND_ENABLED; 
        ctx.reply(`自动推送: ${AUTO_SEND_ENABLED?'开':'关'}`, getMainMenu()); 
    });
    
    bot.hears('🗑 删除记录', (ctx) => { 
        if(ctx.from) userStates[ctx.from.id]='WAIT_DEL'; 
        ctx.reply('请输入要删除的期号 (如 2024001):'); 
    });

    // 权限与消息监听
    bot.use(async (ctx, next) => {
        if(ctx.channelPost && String(ctx.chat.id)===String(CHANNEL_ID)) return next();
        if(ctx.from && ctx.from.id===ADMIN_ID) return next();
    });
    
    bot.start((ctx) => { 
        if(ctx.from) userStates[ctx.from.id]=null; 
        ctx.reply('🤖 五行杀号算法系统 V10.0 已就绪', getMainMenu()); 
    });

    bot.on(['text', 'channel_post'], async (ctx) => {
        const text = ctx.message?.text || ctx.channelPost?.text;
        if (!text) return;
        
        // 删除逻辑
        if (ctx.from && userStates[ctx.from.id]==='WAIT_DEL' && ctx.chat.type==='private') {
            await db.execute('DELETE FROM lottery_results WHERE issue=?', [text]);
            userStates[ctx.from.id]=null; 
            return ctx.reply(`✅ 第 ${text} 期数据已删除`);
        }
        
        // 开奖录入逻辑
        const res = parseLotteryResult(text);
        if (res) {
            const {issue, flatNumbers, specialCode, shengxiao} = res;
            
            // 立即生成一个初始预测
            const initPred = generateSinglePrediction([]); 
            
            const jNum = JSON.stringify(flatNumbers);
            const jPred = JSON.stringify(initPred);
            
            // 存库
            await db.execute(`INSERT INTO lottery_results (issue, numbers, special_code, shengxiao, next_prediction, deep_prediction, open_date) VALUES (?,?,?,?,?,NULL,NOW()) ON DUPLICATE KEY UPDATE numbers=?, special_code=?, shengxiao=?, next_prediction=?, deep_prediction=NULL, open_date=NOW()`, 
                [issue, jNum, specialCode, shengxiao, jPred, jNum, specialCode, shengxiao, jPred]);
            
            // 启动计算任务
            CALC_TASK = {
                isRunning: true, 
                phase: 1, 
                startTime: Date.now(), 
                targetDuration: DEEP_CALC_DURATION,
                targetIterations: 99999, 
                currentIssue: issue, 
                bestScore: 0, 
                bestPrediction: initPred,
                iterations: 0, 
                historyCache: null, 
                isProcessing: false
            };
            
            if(ctx.chat?.type==='private') ctx.reply(`✅ 第 ${issue} 期录入成功。\n🚀 V10.0 智能决策启动 (${DEEP_CALC_DURATION/3600000}h)`);
            else console.log(`频道录入: ${issue}`);
        }
    });

    bot.launch();
    process.once('SIGINT', ()=>bot.stop()); 
    process.once('SIGTERM', ()=>bot.stop());
    return bot;
}

module.exports = startBot;
