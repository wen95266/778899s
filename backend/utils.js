// --- 基础配置 (基于提供的图片资料) ---

// 2025年(蛇年)生肖顺序：1号是蛇
const ZODIAC_SEQ = ["蛇", "龙", "兔", "虎", "牛", "鼠", "猪", "狗", "鸡", "猴", "羊", "马"];

// 波色表
const BOSE = {
    red: [1, 2, 7, 8, 12, 13, 18, 19, 23, 24, 29, 30, 34, 35, 40, 45, 46],
    blue: [3, 4, 9, 10, 14, 15, 20, 25, 26, 31, 36, 37, 41, 42, 47, 48],
    green: [5, 6, 11, 16, 17, 21, 22, 27, 28, 32, 33, 38, 39, 43, 44, 49]
};

// 五行 (数字映射) - 严格按照图片下方文字录入
const WU_XING_NUMS = {
    '金': [3,4,11,12,25,26,33,34,41,42],
    '木': [7,8,15,16,23,24,37,38,45,46],
    '水': [13,14,21,22,29,30,43,44],
    '火': [1,2,9,10,17,18,31,32,39,40,47,48],
    '土': [5,6,19,20,27,28,35,36,49]
};

// 生肖属性分类 (严格按照图片右侧表格录入)
const ZODIAC_ATTRS = {
    'season': {
        '春': ['兔', '虎', '龙'],
        '夏': ['马', '蛇', '羊'],
        '秋': ['鸡', '猴', '狗'],
        '冬': ['鼠', '猪', '牛']
    },
    'sky_earth': { // 天肖/地肖
        '天': ['龙', '兔', '牛', '马', '猴', '猪'],
        '地': ['鼠', '虎', '蛇', '羊', '鸡', '狗']
    },
    'yin_yang': { // 阴肖/阳肖
        '阴': ['鼠', '龙', '蛇', '马', '狗', '猪'],
        '阳': ['牛', '虎', '兔', '羊', '猴', '鸡']
    },
    'ji_xiong': { // 吉肖/凶肖
        '吉': ['兔', '龙', '蛇', '马', '羊', '鸡'],
        '凶': ['鼠', '牛', '虎', '猴', '狗', '猪']
    },
    'home_wild': { // 家禽/野兽
        '家': ['牛', '马', '羊', '鸡', '狗', '猪'],
        '野': ['鼠', '虎', '兔', '龙', '蛇', '猴']
    }
};

// --- 核心工具函数 ---

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

// 根据生肖获取其所有属性 (返回对象)
function getAttrByZodiac(zx) {
    const res = {};
    for (const [attrKey, map] of Object.entries(ZODIAC_ATTRS)) {
        for (const [val, zList] of Object.entries(map)) {
            if (zList.includes(zx)) {
                res[attrKey] = val; // 例如 res.season = '春'
                break;
            }
        }
    }
    return res;
}

function getHead(num) { return Math.floor(num / 10); } 
function getTail(num) { return num % 10; }

// 加权随机选择 (通用)
function weightedRandomSelect(items, count) {
    const result = [];
    const _items = [...items];
    for (let i = 0; i < count; i++) {
        if (_items.length === 0) break;
        const totalWeight = _items.reduce((sum, item) => sum + item.weight, 0);
        let r = Math.random() * totalWeight;
        for (let j = 0; j < _items.length; j++) {
            r -= _items[j].weight;
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
            // 匹配7个数字
            if (/^(\d{2}\s+){6}\d{2}$/.test(trimmed) || (trimmed.match(/\d{2}/g) || []).length === 7) {
                numbersLine = trimmed; break;
            }
        }
        if (!numbersLine) return null;

        const allNums = numbersLine.match(/\d{2}/g).map(Number);
        if (allNums.length !== 7) return null;

        const flatNumbers = allNums.slice(0, 6);
        const specialCode = allNums[6];
        
        // 尝试从文本获取生肖，如果没有则计算
        let shengxiao = getShengXiao(specialCode);
        for (const line of lines) {
            if (/[鼠牛虎兔龍龙蛇馬马羊猴雞鸡狗豬猪]/.test(line)) {
                const animals = line.trim().split(/\s+/);
                if (animals.length >= 7) shengxiao = animals[6];
            }
        }

        return { issue, flatNumbers, specialCode, shengxiao };
    } catch (e) {
        console.error("解析出错:", e);
        return null;
    }
}

// --- 趋势分析与预测生成 (包含五行/天肖等) ---
function generateSinglePrediction(historyRows) {
    // 1. 数据补全
    let data = historyRows;
    if (!data || data.length < 5) {
        data = Array(20).fill(0).map(() => ({ special_code: Math.floor(Math.random() * 49) + 1 }));
    }

    // 2. 统计各维度热度 (最近20期)
    const recent20 = data.slice(0, 20);
    const stats = {
        head: {0:0, 1:0, 2:0, 3:0, 4:0},
        tail: {},
        zodiac: {},
        wuxing: {'金':0, '木':0, '水':0, '火':0, '土':0},
        season: {'春':0, '夏':0, '秋':0, '冬':0},
        sky_earth: {'天':0, '地':0}
    };
    
    // 初始化字典
    for(let i=0; i<=9; i++) stats.tail[i] = 0;
    ZODIAC_SEQ.forEach(z => stats.zodiac[z] = 0);

    recent20.forEach(row => {
        const n = row.special_code;
        const sx = row.shengxiao || getShengXiao(n);
        const wx = getWuXing(n);
        const attrs = getAttrByZodiac(sx);

        stats.head[getHead(n)]++;
        stats.tail[getTail(n)]++;
        stats.zodiac[sx]++;
        if(stats.wuxing[wx] !== undefined) stats.wuxing[wx]++;
        if(attrs.season) stats.season[attrs.season]++;
        if(attrs.sky_earth) stats.sky_earth[attrs.sky_earth]++;
    });

    // 3. 构建权重并选择
    
    // 头数
    const headWeights = Object.keys(stats.head).map(h => ({
        item: parseInt(h),
        weight: (stats.head[h] * 10) + (Math.random() * 15)
    }));
    const selectedHeads = weightedRandomSelect(headWeights, 2);

    // 尾数
    const tailWeights = Object.keys(stats.tail).map(t => ({
        item: parseInt(t),
        weight: (stats.tail[t] * 10) + (Math.random() * 15)
    }));
    const selectedTails = weightedRandomSelect(tailWeights, 2);

    // 生肖 (六肖)
    const zodiacWeights = Object.keys(stats.zodiac).map(z => ({
        item: z,
        weight: stats.zodiac[z] * 10 + Math.random() * 20
    }));
    const liuXiao = weightedRandomSelect(zodiacWeights, 6);

    // 4. 分析五行/季节趋势 (用于增强形态参考)
    const hotWuXing = Object.keys(stats.wuxing).sort((a,b) => stats.wuxing[b] - stats.wuxing[a])[0];
    const hotSeason = Object.keys(stats.season).sort((a,b) => stats.season[b] - stats.season[a])[0];
    const hotSkyEarth = Object.keys(stats.sky_earth).sort((a,b) => stats.sky_earth[b] - stats.sky_earth[a])[0];

    // 5. 波色与大小单双
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
        
        // 新增分析结果 (供前端或Bot展示)
        analysis: {
            wuxing: hotWuXing,    // 推荐五行
            season: hotSeason,    // 推荐季节
            sky_earth: hotSkyEarth // 推荐天地
        }
    };
}

// --- 评分系统 (加入五行评分) ---
function scorePrediction(pred, historyRows) {
    let score = 0;
    const nextResult = historyRows[0];
    if (!nextResult) return 0;

    const sp = nextResult.special_code;
    const sx = nextResult.shengxiao || getShengXiao(sp);
    const wx = getWuXing(sp);
    const attrs = getAttrByZodiac(sx);

    // 1. 生肖中 (40分)
    if (pred.liu_xiao.includes(sx)) score += 40;
    if (pred.zhu_san.includes(sx)) score += 20;

    // 2. 头尾中 (30分)
    const h = getHead(sp);
    const t = getTail(sp);
    if (h === pred.hot_head) score += 20;
    else if (h === pred.fang_head) score += 10;
    if (pred.rec_tails.includes(t)) score += 10;

    // 3. 五行/属性命中 (加分项)
    if (pred.analysis) {
        if (pred.analysis.wuxing === wx) score += 15; // 五行准了
        if (pred.analysis.season === attrs.season) score += 5;
        if (pred.analysis.sky_earth === attrs.sky_earth) score += 5;
    }

    // 4. 波色
    if (getBose(sp) === pred.zhu_bo) score += 10;

    return score + Math.random() * 5;
}

module.exports = { parseLotteryResult, generateSinglePrediction, scorePrediction };