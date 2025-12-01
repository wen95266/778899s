// ============================================================================
// 六合宝典核心算法库 (Ultimate Fusion - 终极全量融合版)
// ============================================================================
// 融合源：File 71 (历史回溯+评分矩阵) + File 75 (五行生克+智能杀号)
// ============================================================================

// ----------------------------------------------------------------------------
// [配置区] 基础常量配置
// ----------------------------------------------------------------------------
const ZODIAC_SEQ = ["蛇", "龙", "兔", "虎", "牛", "鼠", "猪", "狗", "鸡", "猴", "羊", "马"];

const TRAD_MAP = {
    '龍': '龙', '馬': '马', '雞': '鸡', '豬': '猪', '蛇': '蛇', '兔': '兔', 
    '虎': '虎', '牛': '牛', '鼠': '鼠', '狗': '狗', '猴': '猴', '羊': '羊'
};

const BOSE = {
    red: [1, 2, 7, 8, 12, 13, 18, 19, 23, 24, 29, 30, 34, 35, 40, 45, 46],
    blue: [3, 4, 9, 10, 14, 15, 20, 25, 26, 31, 36, 37, 41, 42, 47, 48],
    green: [5, 6, 11, 16, 17, 21, 22, 27, 28, 32, 33, 38, 39, 43, 44, 49]
};

// 五行属性 (来自 Worker 代码)
const ELEMENTS = {
    gold: [1,2,9,10,23,24,31,32,39,40], // 金
    wood: [5,6,13,14,21,22,35,36,43,44], // 木
    water: [11,12,19,20,33,34,41,42,49], // 水
    fire: [3,4,17,18,25,26,37,38,45,46], // 火
    earth: [7,8,15,16,29,30,47,48]       // 土
};

// 五行生克关系 (来自 Worker 代码)
const WX_RELATION = {
    generate: { 'gold': 'water', 'water': 'wood', 'wood': 'fire', 'fire': 'earth', 'earth': 'gold' }, // 生
    overcome: { 'gold': 'wood', 'wood': 'earth', 'earth': 'water', 'water': 'fire', 'fire': 'gold' }  // 克
};

// 生肖关系 (来自 Worker 代码)
const ZODIAC_RELATION = {
    harmony: { "鼠":"牛", "牛":"鼠", "虎":"猪", "猪":"虎", "兔":"狗", "狗":"兔", "龙":"鸡", "鸡":"龙", "蛇":"猴", "猴":"蛇", "马":"羊", "羊":"马" },
    clash: { "鼠":"马", "马":"鼠", "牛":"羊", "羊":"牛", "虎":"猴", "猴":"虎", "兔":"鸡", "鸡":"兔", "龙":"狗", "狗":"龙", "蛇":"猪", "猪":"蛇" },
    sanhe: {
        '鼠': ['龙', '猴'], '龙': ['鼠', '猴'], '猴': ['鼠', '龙'],
        '牛': ['蛇', '鸡'], '蛇': ['牛', '鸡'], '鸡': ['牛', '蛇'],
        '虎': ['马', '狗'], '马': ['虎', '狗'], '狗': ['虎', '马'],
        '兔': ['羊', '猪'], '羊': ['兔', '猪'], '猪': ['兔', '羊']
    }
};

// ----------------------------------------------------------------------------
// [工具函数] 基础计算
// ----------------------------------------------------------------------------
function normalizeZodiac(char) { return TRAD_MAP[char] || char; }
function getShengXiao(num) { return ZODIAC_SEQ[(num - 1) % 12]; }
function getHead(num) { return Math.floor(num / 10); }
function getTail(num) { return num % 10; }
function getHeShu(num) { return Math.floor(num / 10) + (num % 10); }

function getBose(num) {
    if (BOSE.red.includes(num)) return 'red';
    if (BOSE.blue.includes(num)) return 'blue';
    return 'green';
}

function getWuXing(num) {
    for (const [ele, nums] of Object.entries(ELEMENTS)) {
        if (nums.includes(num)) return ele;
    }
    return 'gold'; 
}

function getZodiacNumbers(zodiacName) {
    const nums = [];
    for (let i = 1; i <= 49; i++) {
        if (getShengXiao(i) === zodiacName) nums.push(i);
    }
    return nums;
}

// 加权随机选择 (来自 File 71)
function weightedRandomSelect(items, count) {
    const result = [];
    const _items = JSON.parse(JSON.stringify(items));
    for (let i = 0; i < count; i++) {
        if (_items.length === 0) break;
        const totalWeight = _items.reduce((sum, item) => sum + (isNaN(item.weight) ? 0 : item.weight), 0);
        if (totalWeight <= 0) { result.push(_items[0].item); _items.shift(); continue; }
        let r = Math.random() * totalWeight;
        for (let j = 0; j < _items.length; j++) {
            r -= (isNaN(_items[j].weight) ? 0 : _items[j].weight);
            if (r <= 0) { result.push(_items[j].item); _items.splice(j, 1); break; }
        }
    }
    return result;
}

// ----------------------------------------------------------------------------
// [模块 1] 文本解析 (用于 Bot 接收开奖)
// ----------------------------------------------------------------------------
function parseLotteryResult(text) {
    try {
        const issueMatch = text.match(/第:?(\d+)期/);
        if (!issueMatch) return null;
        const issue = issueMatch[1];
        const lines = text.split('\n');
        let numbersLine = '';
        for (const line of lines) {
            const trimmed = line.trim();
            if (/^(\d{2}\s+){6}\d{2}$/.test(trimmed) || (trimmed.match(/\d{2}/g) || []).length === 7) {
                numbersLine = trimmed; break;
            }
        }
        if (!numbersLine) return null;
        const allNums = numbersLine.match(/\d{2}/g).map(Number);
        if (allNums.length !== 7) return null;
        const flatNumbers = allNums.slice(0, 6);
        const specialCode = allNums[6];
        let shengxiao = getShengXiao(specialCode);
        for (const line of lines) {
            if (/[鼠牛虎兔龍龙蛇馬马羊猴雞鸡狗豬猪]/.test(line)) {
                const animals = line.trim().split(/\s+/);
                if (animals.length >= 7) { shengxiao = normalizeZodiac(animals[6]); }
            }
        }
        return { issue, flatNumbers, specialCode, shengxiao };
    } catch (e) { console.error("解析出错:", e); return null; }
}

// ----------------------------------------------------------------------------
// [模块 2] 五行杀号逻辑 (移植自 Worker 代码 calculateComplexWeights)
// ----------------------------------------------------------------------------
function calculateFiveElementWeights(lastDraw) {
    let scores = {};
    ZODIAC_SEQ.forEach(z => scores[z] = 50); // 初始分

    const lastCode = lastDraw.special_code;
    const lastZodiac = normalizeZodiac(lastDraw.shengxiao || getShengXiao(lastCode));
    const lastElement = getWuXing(lastCode);

    // 1. 五行生克 (核心)
    const targetGen = WX_RELATION.generate[lastElement]; // 旺 (被生)
    const targetOver = WX_RELATION.overcome[lastElement]; // 弱 (被克)

    ZODIAC_SEQ.forEach(z => {
        const nums = getZodiacNumbers(z);
        let elements = nums.map(n => getWuXing(n));
        // 生肖属性加权
        if (elements.includes(targetGen)) scores[z] += 30; // 包含"被生"属性，大吉
        if (elements.includes(targetOver)) scores[z] -= 25; // 包含"被克"属性，凶
    });

    // 2. 关系网
    const harmonyZ = ZODIAC_RELATION.harmony[lastZodiac]; 
    const clashZ = ZODIAC_RELATION.clash[lastZodiac];
    if (harmonyZ) scores[harmonyZ] += 40; 
    if (clashZ) scores[clashZ] -= 35; // 冲，减分

    return scores;
}

// ----------------------------------------------------------------------------
// [模块 3] 历史回溯引擎 (移植自 File 71)
// ----------------------------------------------------------------------------
function mineHistoricalPatterns(allHistoryData) {
    const scores = {};
    for(let i=1; i<=49; i++) scores[i] = 0;
    if (!allHistoryData || allHistoryData.length < 5) return scores;

    const targetIssue = allHistoryData[0];
    const targetSx = normalizeZodiac(targetIssue.shengxiao || getShengXiao(targetIssue.special_code));
    const targetWx = getWuXing(targetIssue.special_code);
    const targetBose = getBose(targetIssue.special_code);
    const targetHead = getHead(targetIssue.special_code);

    const limit = Math.min(allHistoryData.length - 1, 500);
    
    for (let i = 1; i < limit; i++) {
        const historicalRow = allHistoryData[i];
        let similarity = 0;
        const histSx = normalizeZodiac(historicalRow.shengxiao || getShengXiao(historicalRow.special_code));
        
        if (histSx === targetSx) similarity += 5;
        if (getWuXing(historicalRow.special_code) === targetWx) similarity += 3;
        if (getBose(historicalRow.special_code) === targetBose) similarity += 2;
        if (getHead(historicalRow.special_code) === targetHead) similarity += 2;

        if (similarity >= 5) {
            const nextDraw = allHistoryData[i - 1]; 
            scores[nextDraw.special_code] += (similarity * 1.5); 
        }
    }
    return scores;
}

// ----------------------------------------------------------------------------
// [模块 4] 主预测生成器 (Main Generator)
// ----------------------------------------------------------------------------
function generateSinglePrediction(historyRows) {
    let data = historyRows;
    if (!data || data.length < 5) {
        data = Array(30).fill(0).map(() => ({ special_code: Math.floor(Math.random() * 49) + 1 }));
    }
    const lastDraw = data[0];
    const lastCode = lastDraw.special_code;

    // --- 步骤 0: 运行五行逻辑，生成杀肖列表 ---
    const zodiacMacroWeights = calculateFiveElementWeights(lastDraw);
    const sortedZodiacs = Object.keys(zodiacMacroWeights).sort((a,b) => zodiacMacroWeights[a] - zodiacMacroWeights[b]);
    // 智能杀号: 分数最低的 3 个生肖
    const killZodiacs = sortedZodiacs.slice(0, 3);

    // --- 步骤 1: 统计基础热度 ---
    const stats = { head: {}, tail: {}, numberFreq: {}, heShuOdd: 0, heShuEven: 0 };
    for(let i=0; i<=4; i++) stats.head[i] = 0;
    for(let i=0; i<=9; i++) stats.tail[i] = 0;
    for(let i=1; i<=49; i++) stats.numberFreq[i] = 0;
    data.slice(0, 20).forEach(row => {
        const n = row.special_code;
        stats.head[getHead(n)]++;
        stats.tail[getTail(n)]++;
        stats.numberFreq[n]++;
        if (getHeShu(n) % 2 === 0) stats.heShuEven++; else stats.heShuOdd++;
    });

    // --- 步骤 2: 运行历史回溯 ---
    const historicalScores = mineHistoricalPatterns(data);

    // --- 步骤 3: 确定波色与头尾趋势 ---
    const headWeights = Object.keys(stats.head).map(h => ({ item: parseInt(h), weight: stats.head[h]*10 + Math.random()*20 }));
    const selectedHeads = weightedRandomSelect(headWeights, 2);
    const tailWeights = Object.keys(stats.tail).map(t => ({ item: parseInt(t), weight: stats.tail[t]*10 + Math.random()*20 }));
    const selectedTails = weightedRandomSelect(tailWeights, 2);
    
    // 波色断龙逻辑
    const lastBose = getBose(lastCode);
    const boseOpts = ['red', 'blue', 'green'];
    let boseStreak = 0;
    for(let r of data) { if(getBose(r.special_code)===lastBose) boseStreak++; else break; }
    let zhuBo = (boseStreak >= 2) ? boseOpts.filter(b => b !== lastBose)[0] : lastBose;
    if (Math.random() > 0.7) zhuBo = boseOpts[Math.floor(Math.random()*3)]; // 随机变异
    const fangBo = boseOpts.find(b => b !== zhuBo && b !== lastBose) || lastBose;

    // ============================================
    // 步骤 4: 全局综合评分矩阵 (Dimensions A-I)
    // ============================================
    const allNumScores = {};
    const lastWx = getWuXing(lastCode);
    const targetWx = WX_RELATION.generate[lastWx];
    const lastSx = normalizeZodiac(lastDraw.shengxiao || getShengXiao(lastCode));
    const sanHeFriends = ZODIAC_RELATION.sanhe[lastSx] || [];

    for(let i=1; i<=49; i++) {
        let score = 0;
        const sx = getShengXiao(i);
        const wx = getWuXing(i);
        const hs = getHeShu(i);
        const t = getTail(i);
        const h = getHead(i);
        const b = getBose(i);

        // ❌ [维度 0] 杀号逻辑 (直接处决)
        if (killZodiacs.includes(sx)) {
            allNumScores[i] = -9999; // 极低分，确保不被选中
            continue;
        }

        // 🌟 [维度 1] 宏观生肖权重 (来自五行计算)
        score += (zodiacMacroWeights[sx] || 0) * 0.8;

        // [维度 A] 热度分
        score += (stats.numberFreq[i] * 3); 

        // [维度 B] 历史规律分
        score += (historicalScores[i] || 0) * 0.5; 

        // [维度 D] 五行相生
        if (wx === targetWx) score += 15;

        // [维度 E] 生肖逻辑
        if (sanHeFriends.includes(sx)) score += 12; 
        if (sx === lastSx) score += 8; // 连肖

        // [维度 F] 形态逻辑
        if (i === lastCode + 1 || i === lastCode - 1) score += 8; // 邻码
        if (i === lastCode + 10 || i === lastCode - 10) score += 8; // 隔十码

        // [维度 G] 特征吻合度
        if (b === zhuBo) score += 20; 
        if (selectedTails.includes(t)) score += 10;
        if (selectedHeads.includes(h)) score += 5;

        // [维度 H] 合数平衡
        if (hs % 2 !== 0 && stats.heShuOdd < 7) score += 6;
        if (hs % 2 === 0 && stats.heShuEven < 7) score += 6;

        // [维度 I] 随机扰动
        score += Math.random() * 20;

        allNumScores[i] = score;
    }

    // --- 步骤 5: 一肖一码选拔 ---
    const zodiacOneCode = []; 
    const validZodiacs = ZODIAC_SEQ.filter(z => !killZodiacs.includes(z)); // 只在活着的生肖里选

    validZodiacs.forEach(zodiac => {
        const nums = getZodiacNumbers(zodiac);
        // 组内淘汰赛
        let bestNum = nums[0];
        let maxScore = -9999;
        nums.forEach(n => {
            if (allNumScores[n] > maxScore) { maxScore = allNumScores[n]; bestNum = n; }
        });
        zodiacOneCode.push({ zodiac: zodiac, num: bestNum, score: maxScore });
    });

    // --- 步骤 6: 衍生预测 ---
    // 按分数排序
    const sortedZodiacItems = zodiacOneCode.sort((a,b) => b.score - a.score);
    const liuXiao = sortedZodiacItems.slice(0, 6).map(i => i.zodiac);
    
    // 大小单双 (基于最强号码反推)
    const topNum = sortedZodiacItems[0].num;
    const daXiao = topNum >= 25 ? "大" : "小";
    const danShuang = topNum % 2 !== 0 ? "单" : "双";

    return {
        zodiac_one_code: zodiacOneCode,
        liu_xiao: liuXiao,
        zhu_san: liuXiao.slice(0, 3),
        zhu_bo: zhuBo,
        fang_bo: fangBo,
        hot_head: selectedHeads[0],
        fang_head: selectedHeads[1],
        rec_tails: selectedTails,
        da_xiao: daXiao,
        dan_shuang: danShuang,
        kill_zodiacs: killZodiacs // 记录杀肖
    };
}

// ----------------------------------------------------------------------------
// [模块 5] 评分验证 (Score Verification)
// ----------------------------------------------------------------------------
function scorePrediction(pred, historyRows) {
    let score = 0;
    const nextResult = historyRows[0];
    if (!nextResult) return 0;

    const sp = nextResult.special_code;
    const sx = normalizeZodiac(nextResult.shengxiao || getShengXiao(sp)); 

    // 1. 杀号检查 (如果特码在杀肖里，重罚)
    if (pred.kill_zodiacs && pred.kill_zodiacs.includes(sx)) {
        return -500; 
    }

    // 2. 生肖命中
    if (pred.liu_xiao.includes(sx)) score += 30;
    if (pred.zhu_san.includes(sx)) score += 20;
    
    // 3. 一码精确命中
    const targetZodiacPred = pred.zodiac_one_code.find(item => item.zodiac === sx);
    if (targetZodiacPred && targetZodiacPred.num === sp) {
        score += 80; // 极高分
    } else if (targetZodiacPred && Math.abs(targetZodiacPred.num - sp) === 1) {
        score += 15; // 邻码安慰分
    }

    // 4. 属性命中
    if (getHead(sp) === pred.hot_head) score += 10;
    if (pred.rec_tails.includes(getTail(sp))) score += 10;
    if (getBose(sp) === pred.zhu_bo) score += 15;

    return score + Math.random() * 5;
}

module.exports = { parseLotteryResult, generateSinglePrediction, scorePrediction };
