// ==========================================
// 六合宝典核心算法库 (终极满血整合版)
// 包含：五行/三合/六冲/邻码/合数/波色/遗漏
// ==========================================

// --- 1. 基础数据配置 ---

// 标准生肖顺序
const ZODIAC_SEQ = ["蛇", "龙", "兔", "虎", "牛", "鼠", "猪", "狗", "鸡", "猴", "羊", "马"];

// 繁简转换
const TRAD_MAP = {
    '龍': '龙', '馬': '马', '雞': '鸡', '豬': '猪', 
    '蛇': '蛇', '兔': '兔', '虎': '虎', '牛': '牛', 
    '鼠': '鼠', '狗': '狗', '猴': '猴', '羊': '羊'
};

// 波色表
const BOSE = {
    red: [1, 2, 7, 8, 12, 13, 18, 19, 23, 24, 29, 30, 34, 35, 40, 45, 46],
    blue: [3, 4, 9, 10, 14, 15, 20, 25, 26, 31, 36, 37, 41, 42, 47, 48],
    green: [5, 6, 11, 16, 17, 21, 22, 27, 28, 32, 33, 38, 39, 43, 44, 49]
};

// 五行 (金木水火土)
const WU_XING = {
    '金': [3,4,17,18,25,26,33,34,47,48],
    '木': [7,8,15,16,29,30,37,38,45,46],
    '水': [1,2,11,12,19,20,35,36,43,44,49], 
    '火': [5,6,13,14,21,22,27,28,41,42],
    '土': [9,10,23,24,31,32,39,40]
};
// 五行相生 (金生水...)
const WX_GENERATE = { '金': '水', '水': '木', '木': '火', '火': '土', '土': '金' };

// 生肖三合 (强关联)
const SAN_HE = {
    '鼠': ['龙', '猴'], '龙': ['鼠', '猴'], '猴': ['鼠', '龙'],
    '牛': ['蛇', '鸡'], '蛇': ['牛', '鸡'], '鸡': ['牛', '蛇'],
    '虎': ['马', '狗'], '马': ['虎', '狗'], '狗': ['虎', '马'],
    '兔': ['羊', '猪'], '羊': ['兔', '猪'], '猪': ['兔', '羊']
};

// 生肖六冲 (对冲/防守)
const LIU_CHONG = {
    '鼠': '马', '马': '鼠', '牛': '羊', '羊': '牛',
    '虎': '猴', '猴': '虎', '兔': '鸡', '鸡': '兔',
    '龙': '狗', '狗': '龙', '蛇': '猪', '猪': '蛇'
};

// --- 2. 基础工具函数 ---

function normalizeZodiac(char) { return TRAD_MAP[char] || char; }
function getShengXiao(num) { const idx = (num - 1) % 12; return ZODIAC_SEQ[idx]; }
function getBose(num) { if (BOSE.red.includes(num)) return 'red'; if (BOSE.blue.includes(num)) return 'blue'; return 'green'; }
function getHead(num) { return Math.floor(num / 10); } 
function getTail(num) { return num % 10; }
function getWuXing(num) { for (const [wx, nums] of Object.entries(WU_XING)) { if (nums.includes(num)) return wx; } return '金'; }
// 计算合数 (如 26 => 2+6=8)
function getHeShu(num) { return Math.floor(num / 10) + (num % 10); }

// 加权随机选择
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

// --- 3. 文本解析器 ---
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

// --- 4. 核心预测算法 (全功能整合版) ---
function generateSinglePrediction(historyRows) {
    let data = historyRows;
    // 数据不足时的冷启动填充
    if (!data || data.length < 5) {
        data = Array(30).fill(0).map(() => ({ special_code: Math.floor(Math.random() * 49) + 1 }));
    }

    const recent20 = data.slice(0, 20);
    const lastIssue = data[0];
    const lastCode = lastIssue.special_code;
    
    // --- 上期特征分析 ---
    const lastWx = getWuXing(lastCode);
    const targetWx = WX_GENERATE[lastWx]; // 五行相生目标
    const lastSx = normalizeZodiac(lastIssue.shengxiao || getShengXiao(lastCode));
    const sanHeFriends = SAN_HE[lastSx] || []; // 三合生肖
    const chongSx = LIU_CHONG[lastSx]; // 六冲生肖
    const lastHeShu = getHeShu(lastCode); // 上期合数

    // --- 统计历史数据 ---
    const stats = { 
        head: {}, tail: {}, zodiac: {}, numberFreq: {},
        heShuOdd: 0, heShuEven: 0 // 合数单双统计
    };
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
        
        if (getHeShu(n) % 2 === 0) stats.heShuEven++; else stats.heShuOdd++;
    });

    // 计算遗漏 (Omission)
    const omission = {};
    for(let i=1; i<=49; i++) {
        let missed = 0;
        for (let row of data) { if (row.special_code === i) break; missed++; }
        omission[i] = missed;
    }

    // ============================================
    // 核心评分循环：遍历 1-49 号码，逐个打分
    // ============================================
    const scoredNumbers = [];
    
    for(let i=1; i<=49; i++) {
        let score = 0;
        const wx = getWuXing(i);
        const sx = getShengXiao(i);
        const hs = getHeShu(i);

        // 1. 热度分 (Frequency)
        score += (stats.numberFreq[i] * 4); 

        // 2. 遗漏分 (Omission)
        // 极冷号(遗漏>30)通常不轻易推荐，除非有其他强指标
        // 重点关注“回补号”(遗漏 10-25期)
        if (omission[i] >= 10 && omission[i] <= 25) score += 12;

        // 3. 五行相生 (Five Elements)
        // 例如：上期金，这期水号加分
        if (wx === targetWx) score += 18;

        // 4. 生肖逻辑 (Zodiac)
        // 三合生肖加分 (吉)
        if (sanHeFriends.includes(sx)) score += 15;
        // 六冲生肖 (防守，小幅加分或不加)
        if (sx === chongSx) score += 5;
        // 连肖 (上期开了这肖，这期再开的概率)
        if (sx === lastSx) score += 8;

        // 5. 形态逻辑 (Neighbors / Jump)
        // 邻码 (上期26，本期25/27)
        if (i === lastCode + 1 || i === lastCode - 1) score += 10;
        // 隔十码 (上期26，本期16/36)
        if (i === lastCode + 10 || i === lastCode - 10) score += 10;

        // 6. 合数趋势 (He Shu)
        // 如果近期合数单开得少，平衡法则下期合数单加分
        if (hs % 2 !== 0 && stats.heShuOdd < 8) score += 8;
        if (hs % 2 === 0 && stats.heShuEven < 8) score += 8;

        // 7. 随机扰动 (Randomness)
        // 模拟真实世界的不可预测性
        score += Math.random() * 20;

        scoredNumbers.push({ num: i, score, sx });
    }
    
    // --- 生成结果 ---

    // 1. 精选 12 码 (取分数最高的12个)
    scoredNumbers.sort((a, b) => b.score - a.score);
    const rec12Nums = scoredNumbers.slice(0, 12).map(o => o.num).sort((a,b)=>a-b);

    // 2. 六肖推荐 (基于高分号码反推)
    // 逻辑：如果前15名的高分号码里有很多“龙”号，那么“龙”肖就值得推荐
    const zScores = {};
    ZODIAC_SEQ.forEach(z => zScores[z] = Math.random() * 10); // 底分
    
    // 遍历前15名高分号
    scoredNumbers.slice(0, 15).forEach(o => {
        zScores[o.sx] += (o.score * 1.5); // 号码分转化生肖分
    });
    
    // 额外生肖加权
    sanHeFriends.forEach(z => zScores[z] += 20); // 三合必须重视

    const zodiacWeights = Object.keys(zScores).map(z => ({ item: z, weight: zScores[z] }));
    const liuXiao = weightedRandomSelect(zodiacWeights, 6);

    // 3. 头尾数策略
    const headWeights = Object.keys(stats.head).map(h => ({ item: parseInt(h), weight: stats.head[h]*10 + Math.random()*20 }));
    const selectedHeads = weightedRandomSelect(headWeights, 2);

    const tailWeights = Object.keys(stats.tail).map(t => ({ item: parseInt(t), weight: stats.tail[t]*10 + Math.random()*20 }));
    const selectedTails = weightedRandomSelect(tailWeights, 2);

    // 4. 波色分析
    const lastBose = getBose(lastCode);
    const boseOpts = ['red', 'blue', 'green'];
    let zhuBo, fangBo;
    
    // 简单连庄逻辑：如果连续开2期同色，大概率变色
    let streak = 0;
    for(let r of data) { if(getBose(r.special_code)===lastBose) streak++; else break; }
    
    if (streak >= 2) {
        // 杀上期色
        const valid = boseOpts.filter(b => b !== lastBose);
        zhuBo = valid[Math.floor(Math.random() * valid.length)];
    } else {
        // 顺势而为
        zhuBo = Math.random() > 0.4 ? lastBose : boseOpts[Math.floor(Math.random()*3)];
    }
    fangBo = boseOpts.find(b => b !== zhuBo && b !== lastBose) || lastBose;

    // 5. 大小单双
    const bigCount = recent20.filter(r => r.special_code >= 25).length;
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

// --- 5. 评分函数 (用于Bot后台迭代优化) ---
function scorePrediction(pred, historyRows) {
    let score = 0;
    const nextResult = historyRows[0];
    if (!nextResult) return 0;

    const sp = nextResult.special_code;
    const sx = normalizeZodiac(nextResult.shengxiao || getShengXiao(sp)); 

    // 生肖命中 (40%)
    if (pred.liu_xiao.includes(sx)) score += 30;
    if (pred.zhu_san.includes(sx)) score += 20;

    // 12码命中 (30%)
    if (pred.rec_12_nums && pred.rec_12_nums.includes(sp)) score += 30;

    // 属性命中 (20%)
    if (getHead(sp) === pred.hot_head) score += 10;
    if (pred.rec_tails.includes(getTail(sp))) score += 10;

    // 波色命中 (10%)
    if (getBose(sp) === pred.zhu_bo) score += 10;

    return score + Math.random() * 5;
}

module.exports = { parseLotteryResult, generateSinglePrediction, scorePrediction };
