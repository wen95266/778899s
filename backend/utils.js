// --- 基础配置 ---

// 标准生肖顺序 (简体)
const ZODIAC_SEQ = ["蛇", "龙", "兔", "虎", "牛", "鼠", "猪", "狗", "鸡", "猴", "羊", "马"];

const TRAD_MAP = {
    '龍': '龙', '馬': '马', '雞': '鸡', '豬': '猪', 
    '蛇': '蛇', '兔': '兔', '虎': '虎', '牛': '牛', 
    '鼠': '鼠', '狗': '狗', '猴': '猴', '羊': '羊'
};

const BOSE = {
    red: [1, 2, 7, 8, 12, 13, 18, 19, 23, 24, 29, 30, 34, 35, 40, 45, 46],
    blue: [3, 4, 9, 10, 14, 15, 20, 25, 26, 31, 36, 37, 41, 42, 47, 48],
    green: [5, 6, 11, 16, 17, 21, 22, 27, 28, 32, 33, 38, 39, 43, 44, 49]
};

// 五行数据 (金木水火土)
const WU_XING = {
    '金': [3,4,17,18,25,26,33,34,47,48],
    '木': [7,8,15,16,29,30,37,38,45,46],
    '水': [1,2,11,12,19,20,35,36,43,44,49], // 49归水
    '火': [5,6,13,14,21,22,27,28,41,42],
    '土': [9,10,23,24,31,32,39,40]
};

// 五行相生 (Generate): 金生水, 水生木, 木生火, 火生土, 土生金
const WX_GENERATE = { '金': '水', '水': '木', '木': '火', '火': '土', '土': '金' };

// 三合局
const SAN_HE = {
    '鼠': ['龙', '猴'], '龙': ['鼠', '猴'], '猴': ['鼠', '龙'],
    '牛': ['蛇', '鸡'], '蛇': ['牛', '鸡'], '鸡': ['牛', '蛇'],
    '虎': ['马', '狗'], '马': ['虎', '狗'], '狗': ['虎', '马'],
    '兔': ['羊', '猪'], '羊': ['兔', '猪'], '猪': ['兔', '羊']
};

// --- 工具函数 ---

function normalizeZodiac(char) { return TRAD_MAP[char] || char; }
function getShengXiao(num) { const idx = (num - 1) % 12; return ZODIAC_SEQ[idx]; }
function getBose(num) { if (BOSE.red.includes(num)) return 'red'; if (BOSE.blue.includes(num)) return 'blue'; return 'green'; }
function getHead(num) { return Math.floor(num / 10); } 
function getTail(num) { return num % 10; }
// 获取号码五行
function getWuXing(num) {
    for (const [wx, nums] of Object.entries(WU_XING)) {
        if (nums.includes(num)) return wx;
    }
    return '金';
}

// 加权随机
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

// --- 解析器 ---
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

// --- 核心：AI 综合预测模型 ---
function generateSinglePrediction(historyRows) {
    let data = historyRows;
    if (!data || data.length < 5) {
        data = Array(30).fill(0).map(() => ({ special_code: Math.floor(Math.random() * 49) + 1 }));
    }

    const recent20 = data.slice(0, 20);
    
    // 上期数据分析
    const lastIssue = data[0];
    const lastCode = lastIssue.special_code;
    const lastWx = getWuXing(lastCode);
    const targetWx = WX_GENERATE[lastWx]; // 五行相生目标 (例如金生水，目标是水)
    const lastSx = normalizeZodiac(lastIssue.shengxiao || getShengXiao(lastCode));
    const sanHeFriends = SAN_HE[lastSx] || []; 

    // 统计基础数据
    const stats = { head: {}, tail: {}, zodiac: {}, numberFreq: {} };
    for(let i=0; i<=4; i++) stats.head[i] = 0;
    for(let i=0; i<=9; i++) stats.tail[i] = 0;
    for(let i=1; i<=49; i++) stats.numberFreq[i] = 0;
    ZODIAC_SEQ.forEach(z => stats.zodiac[z] = 0);

    recent20.forEach(row => {
        const n = row.special_code;
        const sx = normalizeZodiac(row.shengxiao || getShengXiao(n));
        stats.head[getHead(n)]++;
        stats.tail[getTail(n)]++;
        stats.numberFreq[n]++;
        if (stats.zodiac[sx] !== undefined) stats.zodiac[sx]++;
    });

    // 计算遗漏 (Omission)
    const omission = {};
    for(let i=1; i<=49; i++) {
        let missed = 0;
        for (let row of data) { if (row.special_code === i) break; missed++; }
        omission[i] = missed;
    }

    // --- 1. 号码综合评分 (AI Scoring) ---
    const scoredNumbers = [];
    for(let i=1; i<=49; i++) {
        let score = 0;
        const wx = getWuXing(i);
        const sx = getShengXiao(i);

        // A. 热度分 (0-20分)
        score += (stats.numberFreq[i] * 4); 

        // B. 遗漏补分 (0-15分) - 寻找“苏醒”的冷号
        // 如果遗漏在 10-20 期之间，概率较大
        if (omission[i] > 10 && omission[i] < 25) score += 10;
        if (omission[i] > 30) score += 5; // 极冷号防守

        // C. 五行相生加权 (15分)
        if (wx === targetWx) score += 15;

        // D. 生肖三合加权 (10分)
        if (sanHeFriends.includes(sx)) score += 10;

        // E. 邻码/跳码逻辑 (10分)
        // 邻码：上期号码 +/- 1
        if (i === lastCode + 1 || i === lastCode - 1) score += 8;
        // 隔10码：上期号码 +/- 10
        if (i === lastCode + 10 || i === lastCode - 10) score += 8;

        // F. 随机扰动 (0-15分) - 模拟不确定性
        score += Math.random() * 15;

        scoredNumbers.push({ num: i, score });
    }
    
    // 排序取前12 (作为精选12码)
    scoredNumbers.sort((a, b) => b.score - a.score);
    const rec12Nums = scoredNumbers.slice(0, 12).map(o => o.num).sort((a,b)=>a-b);

    // --- 2. 生肖/头尾/波色 衍生预测 ---
    
    // 生肖：取12码中对应的生肖，加权计算
    const zScores = {};
    ZODIAC_SEQ.forEach(z => zScores[z] = Math.random() * 10); // 基础分
    scoredNumbers.slice(0, 18).forEach(o => { // 取前18名的号码反推生肖
        const z = getShengXiao(o.num);
        zScores[z] += o.score;
    });
    const zodiacWeights = Object.keys(zScores).map(z => ({ item: z, weight: zScores[z] }));
    const liuXiao = weightedRandomSelect(zodiacWeights, 6);

    // 头尾：基于统计 + 随机
    const headWeights = Object.keys(stats.head).map(h => ({ item: parseInt(h), weight: stats.head[h]*10 + Math.random()*20 }));
    const selectedHeads = weightedRandomSelect(headWeights, 2);

    const tailWeights = Object.keys(stats.tail).map(t => ({ item: parseInt(t), weight: stats.tail[t]*10 + Math.random()*20 }));
    const selectedTails = weightedRandomSelect(tailWeights, 2);

    // 波色：追热打法
    const lastBose = getBose(lastCode);
    const boseOpts = ['red', 'blue', 'green'];
    let zhuBo = Math.random() > 0.4 ? lastBose : boseOpts[Math.floor(Math.random()*3)];
    let fangBo = boseOpts.find(b => b !== zhuBo && b !== lastBose) || (zhuBo==='red'?'blue':'red');

    // 大小单双：平衡法则
    const bigCount = recent20.filter(r => r.special_code >= 25).length;
    // 如果大号太热(>13)，大概率回调开小
    const daXiao = bigCount > 13 ? "小" : (bigCount < 7 ? "大" : (Math.random()>0.5?"大":"小"));
    const oddCount = recent20.filter(r => r.special_code % 2 !== 0).length;
    const danShuang = oddCount > 13 ? "双" : (oddCount < 7 ? "单" : (Math.random()>0.5?"单":"双"));

    return {
        liu_xiao: liuXiao,
        zhu_san: liuXiao.slice(0, 3),
        rec_12_nums: rec12Nums,
        zhu_bo: zhuBo,
        fang_bo: fangBo,
        hot_head: selectedHeads[0],
        fang_head: selectedHeads[1],
        rec_tails: selectedTails,
        da_xiao: daXiao,
        dan_shuang: danShuang
    };
}

// --- 评分 (校验准确性) ---
function scorePrediction(pred, historyRows) {
    let score = 0;
    const nextResult = historyRows[0];
    if (!nextResult) return 0;

    const sp = nextResult.special_code;
    const sx = normalizeZodiac(nextResult.shengxiao || getShengXiao(sp)); 

    // 命中生肖
    if (pred.liu_xiao.includes(sx)) score += 30;
    if (pred.zhu_san.includes(sx)) score += 20;

    // 命中12码
    if (pred.rec_12_nums && pred.rec_12_nums.includes(sp)) score += 30;

    // 命中头尾
    if (getHead(sp) === pred.hot_head) score += 10;
    if (pred.rec_tails.includes(getTail(sp))) score += 10;

    // 命中五行/波色 (隐形加分)
    if (getBose(sp) === pred.zhu_bo) score += 10;

    return score + Math.random() * 5; // 随机波动
}

module.exports = { parseLotteryResult, generateSinglePrediction, scorePrediction };
