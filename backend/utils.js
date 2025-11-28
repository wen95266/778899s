// --- 基础配置 ---

// 标准生肖顺序 (简体)
const ZODIAC_SEQ = ["蛇", "龙", "兔", "虎", "牛", "鼠", "猪", "狗", "鸡", "猴", "羊", "马"];

// 繁体 -> 简体 映射表 (关键修复)
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

// 五行
const WU_XING_NUMS = {
    '金': [3,4,11,12,25,26,33,34,41,42],
    '木': [7,8,15,16,23,24,37,38,45,46],
    '水': [13,14,21,22,29,30,43,44],
    '火': [1,2,9,10,17,18,31,32,39,40,47,48],
    '土': [5,6,19,20,27,28,35,36,49]
};

// 属性分类
const ZODIAC_ATTRS = {
    'season': { '春': ['兔', '虎', '龙'], '夏': ['马', '蛇', '羊'], '秋': ['鸡', '猴', '狗'], '冬': ['鼠', '猪', '牛'] },
    'sky_earth': { '天': ['龙', '兔', '牛', '马', '猴', '猪'], '地': ['鼠', '虎', '蛇', '羊', '鸡', '狗'] },
};

// --- 核心工具函数 ---

// 统一转换为简体中文
function normalizeZodiac(char) {
    return TRAD_MAP[char] || char; // 如果在映射表里就转换，否则原样返回
}

function getShengXiao(num) { 
    const idx = (num - 1) % 12; 
    return ZODIAC_SEQ[idx]; 
}

function getBose(num) { 
    if (BOSE.red.includes(num)) return 'red'; 
    if (BOSE.blue.includes(num)) return 'blue'; 
    return 'green'; 
}

function getWuXing(num) {
    for (const [wx, nums] of Object.entries(WU_XING_NUMS)) {
        if (nums.includes(num)) return wx;
    }
    return '?';
}

function getAttrByZodiac(zx) {
    // 确保传入的是简体
    const simpleZx = normalizeZodiac(zx);
    const res = {};
    for (const [attrKey, map] of Object.entries(ZODIAC_ATTRS)) {
        for (const [val, zList] of Object.entries(map)) {
            if (zList.includes(simpleZx)) {
                res[attrKey] = val;
                break;
            }
        }
    }
    return res;
}

function getHead(num) { return Math.floor(num / 10); } 
function getTail(num) { return num % 10; }

function weightedRandomSelect(items, count) {
    const result = [];
    const _items = [...items];
    for (let i = 0; i < count; i++) {
        if (_items.length === 0) break;
        // 修复：确保权重不为 NaN，如果是 NaN 则视为 0
        const totalWeight = _items.reduce((sum, item) => sum + (isNaN(item.weight) ? 0 : item.weight), 0);
        
        // 如果总权重有问题，强制随机选择
        if (totalWeight <= 0) {
            result.push(_items[0].item);
            _items.shift();
            continue;
        }

        let r = Math.random() * totalWeight;
        for (let j = 0; j < _items.length; j++) {
            r -= (isNaN(_items[j].weight) ? 0 : _items[j].weight);
            if (r <= 0) {
                result.push(_items[j].item);
                _items.splice(j, 1);
                break;
            }
        }
    }
    return result;
}

// --- 文本解析器 ---
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
            // 匹配繁体或简体生肖
            if (/[鼠牛虎兔龍龙蛇馬马羊猴雞鸡狗豬猪]/.test(line)) {
                const animals = line.trim().split(/\s+/);
                if (animals.length >= 7) {
                    // 解析时直接转为简体存入数据库，一劳永逸
                    shengxiao = normalizeZodiac(animals[6]); 
                }
            }
        }

        return { issue, flatNumbers, specialCode, shengxiao };
    } catch (e) {
        console.error("解析出错:", e);
        return null;
    }
}

// --- 趋势分析 ---
function generateSinglePrediction(historyRows) {
    let data = historyRows;
    if (!data || data.length < 5) {
        data = Array(20).fill(0).map(() => ({ special_code: Math.floor(Math.random() * 49) + 1 }));
    }

    const recent20 = data.slice(0, 20);
    const stats = {
        head: {0:0, 1:0, 2:0, 3:0, 4:0},
        tail: {},
        zodiac: {},
        wuxing: {'金':0, '木':0, '水':0, '火':0, '土':0},
        season: {'春':0, '夏':0, '秋':0, '冬':0},
        sky_earth: {'天':0, '地':0}
    };
    
    for(let i=0; i<=9; i++) stats.tail[i] = 0;
    // 初始化生肖统计
    ZODIAC_SEQ.forEach(z => stats.zodiac[z] = 0);

    recent20.forEach(row => {
        const n = row.special_code;
        // 关键修复：从数据库读出来的可能是繁体，必须转简体
        const rawSx = row.shengxiao || getShengXiao(n);
        const sx = normalizeZodiac(rawSx); 

        const wx = getWuXing(n);
        const attrs = getAttrByZodiac(sx);

        stats.head[getHead(n)]++;
        stats.tail[getTail(n)]++;
        
        // 安全累加：如果 sx 转换后不在列表中，给它初始化
        if (stats.zodiac[sx] === undefined) stats.zodiac[sx] = 0;
        stats.zodiac[sx]++;

        if(stats.wuxing[wx] !== undefined) stats.wuxing[wx]++;
        if(attrs.season) stats.season[attrs.season]++;
        if(attrs.sky_earth) stats.sky_earth[attrs.sky_earth]++;
    });

    const headWeights = Object.keys(stats.head).map(h => ({
        item: parseInt(h),
        weight: (stats.head[h] * 10) + (Math.random() * 15)
    }));
    const selectedHeads = weightedRandomSelect(headWeights, 2);

    const tailWeights = Object.keys(stats.tail).map(t => ({
        item: parseInt(t),
        weight: (stats.tail[t] * 10) + (Math.random() * 15)
    }));
    const selectedTails = weightedRandomSelect(tailWeights, 2);

    // 生肖权重计算
    const zodiacWeights = Object.keys(stats.zodiac).map(z => ({
        item: z,
        // 安全处理：防止 NaN 导致 crash
        weight: (stats.zodiac[z] || 0) * 10 + Math.random() * 20
    }));
    const liuXiao = weightedRandomSelect(zodiacWeights, 6);

    const hotWuXing = Object.keys(stats.wuxing).sort((a,b) => stats.wuxing[b] - stats.wuxing[a])[0];
    const hotSeason = Object.keys(stats.season).sort((a,b) => stats.season[b] - stats.season[a])[0];
    const hotSkyEarth = Object.keys(stats.sky_earth).sort((a,b) => stats.sky_earth[b] - stats.sky_earth[a])[0];

    const lastBose = data.length > 0 ? getBose(data[0].special_code) : 'red';
    const boseOpts = ['red', 'blue', 'green'].filter(b => b !== lastBose);
    const zhuBo = Math.random() > 0.4 ? lastBose : boseOpts[0];
    const fangBo = zhuBo === lastBose ? boseOpts[0] : lastBose;

    const bigCount = recent20.filter(r => r.special_code >= 25).length;
    const oddCount = recent20.filter(r => r.special_code % 2 !== 0).length;
    const daXiao = (bigCount > 12) ? "小" : (bigCount < 8 ? "大" : (Math.random()>0.5 ? "大" : "小"));
    const danShuang = (oddCount > 12) ? "双" : (oddCount < 8 ? "单" : (Math.random()>0.5 ? "单" : "双"));

    return {
        liu_xiao: liuXiao,
        zhu_san: liuXiao.slice(0, 3),
        zhu_bo: zhuBo,
        fang_bo: fangBo,
        hot_head: selectedHeads[0],
        fang_head: selectedHeads[1],
        rec_tails: selectedTails,
        da_xiao: daXiao,
        dan_shuang: danShuang,
        analysis: {
            wuxing: hotWuXing,
            season: hotSeason,
            sky_earth: hotSkyEarth
        }
    };
}

function scorePrediction(pred, historyRows) {
    let score = 0;
    const nextResult = historyRows[0];
    if (!nextResult) return 0;

    const sp = nextResult.special_code;
    const sx = normalizeZodiac(nextResult.shengxiao || getShengXiao(sp)); // 评分时也要转简体
    const wx = getWuXing(sp);
    const attrs = getAttrByZodiac(sx);

    if (pred.liu_xiao.includes(sx)) score += 40;
    if (pred.zhu_san.includes(sx)) score += 20;

    const h = getHead(sp);
    const t = getTail(sp);
    if (h === pred.hot_head) score += 20;
    else if (h === pred.fang_head) score += 10;
    if (pred.rec_tails.includes(t)) score += 10;

    if (pred.analysis) {
        if (pred.analysis.wuxing === wx) score += 15;
        if (pred.analysis.season === attrs.season) score += 5;
        if (pred.analysis.sky_earth === attrs.sky_earth) score += 5;
    }

    if (getBose(sp) === pred.zhu_bo) score += 10;

    return score + Math.random() * 5;
}

module.exports = { parseLotteryResult, generateSinglePrediction, scorePrediction };
