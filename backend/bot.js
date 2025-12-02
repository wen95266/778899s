const { Telegraf, Markup } = require('telegraf');
const db = require('./db');
const { parseLotteryResult, generateSinglePrediction, scorePrediction } = require('./utils');

let AUTO_SEND_ENABLED = true;
let DEEP_CALC_DURATION = 1 * 60 * 60 * 1000; // 默认1小时

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
    isProcessing: false 
};

const userStates = {};

function safeParse(data) {
    if (!data) return null;
    if (typeof data === 'string') { try { return JSON.parse(data); } catch (e) { return null; } }
    return data;
}

function getMainMenu() {
    return Markup.keyboard([
        ['🔮 下期预测', '⏳ 计算进度'],
        ['🔭 深度演算', '📊 历史走势'],
        ['⚙️ 设置时长', `自动推送: ${AUTO_SEND_ENABLED?'开':'关'}`], 
        ['📡 手动发频道', '🗑 删除记录']
    ]).resize();
}

function getDurationMenu() {
    return Markup.inlineKeyboard([
        [Markup.button.callback('30 分钟', 'set_dur_0.5'), Markup.button.callback('1 小时', 'set_dur_1')],
        [Markup.button.callback('3 小时', 'set_dur_3'), Markup.button.callback('5 小时', 'set_dur_5')]
    ]);
}

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

function startBot() {
    const bot = new Telegraf(process.env.BOT_TOKEN);
    const ADMIN_ID = parseInt(process.env.ADMIN_ID);
    const CHANNEL_ID = process.env.CHANNEL_ID;

    // --- 后台任务 ---
    setInterval(async () => {
        // 如果任务未运行，或正在处理(锁住)，跳过
        if (!CALC_TASK.isRunning || CALC_TASK.isProcessing) return;
        
        const now = Date.now();
        const isTimeUp = (now - CALC_TASK.startTime) >= CALC_TASK.targetDuration;
        
        // 任务完成判断
        if (isTimeUp) {
            CALC_TASK.isProcessing = true; // 上锁
            try {
                const nextIssue = parseInt(CALC_TASK.currentIssue) + 1;
                const jsonPred = JSON.stringify(CALC_TASK.bestPrediction);

                if (CALC_TASK.phase === 1) {
                    console.log(`Phase 1 Done: ${CALC_TASK.currentIssue}`);
                    
                    // 1. 存库
                    await db.execute('UPDATE lottery_results SET next_prediction=? WHERE issue=?', [jsonPred, CALC_TASK.currentIssue]);
                    
                    // 2. 发频道
                    if (AUTO_SEND_ENABLED && CHANNEL_ID) {
                        const msg = formatPredictionText(nextIssue, CALC_TASK.bestPrediction, `🏁 第 ${nextIssue} 期 预测发布`);
                        await bot.telegram.sendMessage(CHANNEL_ID, msg, { parse_mode: 'Markdown' });
                        bot.telegram.sendMessage(ADMIN_ID, `✅ 第 ${nextIssue} 期推送完毕。进入校验模式。`);
                    }
                    
                    // 3. 切换 Phase 2
                    CALC_TASK.phase = 2;
                    CALC_TASK.startTime = Date.now();
                    CALC_TASK.iterations = 0;
                    CALC_TASK.isProcessing = false; // 解锁
                    return;
                } else {
                    console.log(`Phase 2 Done: ${CALC_TASK.currentIssue}`);
                    
                    // 1. 存库
                    await db.execute('UPDATE lottery_results SET deep_prediction=? WHERE issue=?', [jsonPred, CALC_TASK.currentIssue]);
                    
                    // 2. 停止
                    CALC_TASK.isRunning = false;
                    bot.telegram.sendMessage(ADMIN_ID, `✅ 第 ${nextIssue} 期深度校验完成。`);
                    CALC_TASK.isProcessing = false; // 解锁
                    return;
                }
            } catch (e) { 
                console.error(e); 
                CALC_TASK.isProcessing = false; // 出错也要解锁
            }
            return;
        }

        // 计算循环
        try {
            if (!CALC_TASK.historyCache) {
                const [rows] = await db.query('SELECT * FROM lottery_results ORDER BY issue DESC LIMIT 50');
                CALC_TASK.historyCache = rows;
            }
            // 每次生成一次预测
            const tempPred = generateSinglePrediction(CALC_TASK.historyCache);
            CALC_TASK.bestPrediction = tempPred;
            CALC_TASK.iterations += 50;
        } catch (e) { console.error(e); }
    }, 1000); // 1秒一次检测

    // --- 交互 ---
    bot.hears('🔮 下期预测', async (ctx) => {
        const [rows] = await db.query('SELECT * FROM lottery_results ORDER BY issue DESC LIMIT 1');
        if (!rows.length) return ctx.reply('无数据');
        const row = rows[0];
        let pred = safeParse(row.deep_prediction) || safeParse(row.next_prediction) || CALC_TASK.bestPrediction;
        if (!pred) return ctx.reply('计算中...');
        ctx.reply(formatPredictionText(parseInt(row.issue)+1, pred), { parse_mode: 'Markdown' });
    });

    bot.hears('⏳ 计算进度', (ctx) => {
        if (!CALC_TASK.isRunning) return ctx.reply('💤 无活跃任务');
        const now = Date.now();
        const pct = Math.min(100, Math.floor(((now - CALC_TASK.startTime)/CALC_TASK.targetDuration)*100));
        ctx.reply(`📊 Phase ${CALC_TASK.phase}\n进度: ${pct}%\n迭代: ${CALC_TASK.iterations}次\n剩余: ${Math.ceil((CALC_TASK.targetDuration-(now-CALC_TASK.startTime))/60000)} 分`);
    });

    bot.hears('⚙️ 设置时长', (ctx) => ctx.reply('选择时长:', getDurationMenu()));
    bot.action(/set_dur_([\d\.]+)/, (ctx) => {
        const h = parseFloat(ctx.match[1]);
        DEEP_CALC_DURATION = h * 3600000;
        ctx.editMessageText(`✅ 时长已设为 ${h} 小时`);
    });

    bot.hears(/手动发频道/, async (ctx) => {
        if (!CHANNEL_ID) return ctx.reply('无频道ID');
        const [rows] = await db.query('SELECT * FROM lottery_results ORDER BY issue DESC LIMIT 1');
        const row = rows[0];
        let pred = safeParse(row.deep_prediction) || safeParse(row.next_prediction);
        if (!pred) return ctx.reply('无预测数据');
        await bot.telegram.sendMessage(CHANNEL_ID, formatPredictionText(parseInt(row.issue)+1, pred, `📡 手动推送`), {parse_mode:'Markdown'});
        ctx.reply('已发送');
    });

    bot.hears(/自动推送/, (ctx) => { AUTO_SEND_ENABLED = !AUTO_SEND_ENABLED; ctx.reply(`自动推送: ${AUTO_SEND_ENABLED?'开':'关'}`, getMainMenu()); });
    bot.hears('🗑 删除记录', (ctx) => { if(ctx.from) userStates[ctx.from.id]='WAIT_DEL'; ctx.reply('输入期号:'); });

    bot.use(async (ctx, next) => {
        if(ctx.channelPost && String(ctx.chat.id)===String(CHANNEL_ID)) return next();
        if(ctx.from && ctx.from.id===ADMIN_ID) return next();
    });
    bot.start((ctx) => { if(ctx.from) userStates[ctx.from.id]=null; ctx.reply('V10.0 Ready', getMainMenu()); });

    bot.on(['text', 'channel_post'], async (ctx) => {
        const text = ctx.message?.text || ctx.channelPost?.text;
        if (!text) return;
        if (ctx.from && userStates[ctx.from.id]==='WAIT_DEL' && ctx.chat.type==='private') {
            await db.execute('DELETE FROM lottery_results WHERE issue=?', [text]);
            userStates[ctx.from.id]=null; return ctx.reply('已删除');
        }
        const res = parseLotteryResult(text);
        if (res) {
            const {issue, flatNumbers, specialCode, shengxiao} = res;
            const initPred = generateSinglePrediction([]); 
            const jNum = JSON.stringify(flatNumbers);
            const jPred = JSON.stringify(initPred);
            
            await db.execute(`INSERT INTO lottery_results (issue, numbers, special_code, shengxiao, next_prediction, deep_prediction, open_date) VALUES (?,?,?,?,?,NULL,NOW()) ON DUPLICATE KEY UPDATE numbers=?, special_code=?, shengxiao=?, next_prediction=?, deep_prediction=NULL`, 
                [issue, jNum, specialCode, shengxiao, jPred, jNum, specialCode, shengxiao, jPred]);
            
            CALC_TASK = {
                isRunning: true, phase: 1, startTime: Date.now(), targetDuration: DEEP_CALC_DURATION,
                targetIterations: 99999, currentIssue: issue, bestScore: 0, bestPrediction: initPred,
                iterations: 0, historyCache: null, isProcessing: false
            };
            if(ctx.chat?.type==='private') ctx.reply(`✅ 第 ${issue} 期录入。V10.0 智能决策启动 (${DEEP_CALC_DURATION/3600000}h)`);
        }
    });

    bot.launch();
    process.once('SIGINT', ()=>bot.stop()); process.once('SIGTERM', ()=>bot.stop());
    return bot;
}

module.exports = startBot;
