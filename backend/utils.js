// ============================================================================
// 六合宝典核心算法库 (Ultimate Full Version - 终极全量版)
// ============================================================================
// 功能清单：
// 1. 基础解析与数据清洗
// 2. 五行/波色/生肖/合数/头尾 基础属性计算
// 3. 全历史规律回溯引擎 (Historical Pattern Mining)
// 4. 多维综合评分矩阵 (Multidimensional Scoring Matrix)
// 5. 一肖一码内部选拔机制 (Intra-Zodiac Competition)
// 6. 衍生预测 (六肖/三肖/波色/头尾/大小单双)
// ============================================================================

// ----------------------------------------------------------------------------
// [第一部分] 基础常量配置 (Configuration)
// ----------------------------------------------------------------------------

// 1. 标准生肖顺序 (固定)
const ZODIAC_SEQ = ["蛇", "龙", "兔", "虎", "牛", "鼠", "猪", "狗", "鸡", "猴", "羊", "马"];

// 2. 繁体转简体映射
const TRAD_MAP = {
    '龍': '龙', '馬': '马', '雞': '鸡', '豬': '猪', 
    '蛇': '蛇', '兔': '兔', '虎': '虎', '牛': '牛', 
    '鼠': '鼠', '狗': '狗', '猴': '猴', '羊': '羊'
};

// 3. 波色对照表
const BOSE = {
    red: [1, 2, 7, 8, 12, 13, 18, 19, 23, 24, 29, 30, 34, 35, 40, 45, 46],
    blue: [3, 4, 9, 10, 14, 15, 20, 25, 26, 31, 36, 37, 41, 42, 47, 48],
    green: [5, 6, 11, 16, 17, 21, 22, 27, 28, 32, 33, 38, 39, 43, 44, 49]
};

// 4. 五行属性 (金木水火土)
const WU_XING = {
    '金': [3,4,17,18,25,26,33,34,47,48],
    '木': [7,8,15,16,29,30,37,38,45,46],
    '水': [1,2,11,12,19,20,35,36,43,44,49], 
    '火': [5,6,13,14,21,22,27,28,41,42],
    '土': [9,10,23,24,31,32,39,40]
};

// 5. 五行相生关系 (用于预测下期属性)
const WX_GENERATE = { 
    '金': '水', // 金生水
    '水': '木', // 水生木
    '木': '火', // 木生火
    '火': '土', // 火生土
    '土': '金'  // 土生金
};

// 6. 生肖三合 (吉配，互相加分)
const SAN_HE = {
    '鼠': ['龙', '猴'], '龙': ['鼠', '猴'], '猴': ['鼠', '龙'],
    '牛': ['蛇', '鸡'], '蛇': ['牛', '鸡'], '鸡': ['牛', '蛇'],
    '虎': ['马', '狗'], '马': ['虎', '狗'], '狗': ['虎', '马'],
    '兔': ['羊', '猪'], '羊': ['兔', '猪'], '猪': ['兔', '羊']
};

// 7. 生肖六冲 (对冲，用于防守或杀号)
const LIU_CHONG = {
    '鼠': '马', '马': '鼠', '牛': '羊', '羊': '牛',
    '虎': '猴', '猴': '虎', '兔': '鸡', '鸡': '兔',
    '龙': '狗', '狗': '龙', '蛇': '猪', '猪': '蛇'
};

// ----------------------------------------------------------------------------
// [第二部分] 属性计算工具函数 (Helpers)
// ----------------------------------------------------------------------------

function normalizeZodiac(char) { 
    return TRAD_MAP[char] || char; 
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

function getHead(num) { 
    return Math.floor(num / 10); 
} 

function getTail(num) { 
    return num % 10; 
}

function getWuXing(num) { 
    for (const [wx, nums] of Object.entries(WU_XING)) { 
        if (nums.includes(num)) return wx; 
    } 
    return '金'; 
}

function getHeShu(num) { 
    return Math.floor(num / 10) + (num % 10); 
}

// 动态获取某个生肖下的所有号码
function getZodiacNumbers(zodiacName) {
    const nums = [];
    for (let i = 1; i <= 49; i++) {
        if (getShengXiao(i) === zodiacName) nums.push(i);
    }
    return nums;
}

// 核心数学工具：加权随机选择算法
function weightedRandomSelect(items, count) {
    const result = [];
    const _items = JSON.parse(JSON.stringify(items));
    
    for (let i = 0; i < count; i++) {
        if (_items.length === 0) break;
        const totalWeight = _items.reduce((sum, item) => sum + (isNaN(item.weight) ? 0 : item.weight), 0);
        
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

// ----------------------------------------------------------------------------
// [第三部分] 文本解析引擎 (Parser)
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
                if (animals.length >= 7) { 
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

// ----------------------------------------------------------------------------
// [第四部分] 历史回溯引擎 (Historical Engine)
// ----------------------------------------------------------------------------

function mineHistoricalPatterns(allHistoryData) {
    const scores = {};
    // 初始化 1-49 号码得分
    for(let i=1; i<=49; i++) scores[i] = 0;

    if (!allHistoryData || allHistoryData.length < 5) return scores;

    // 获取最新一期作为特征模板
    const targetIssue = allHistoryData[0];
    const targetSx = normalizeZodiac(targetIssue.shengxiao || getShengXiao(targetIssue.special_code));
    const targetWx = getWuXing(targetIssue.special_code);
    const targetBose = getBose(targetIssue.special_code);
    const targetHead = getHead(targetIssue.special_code);

    // 限制回溯最近 500 期
    const limit = Math.min(allHistoryData.length - 1, 500);
    
    for (let i = 1; i < limit; i++) {
        const historicalRow = allHistoryData[i];
        
        // 计算相似度 (Similarity Score)
        let similarity = 0;
        const histSx = normalizeZodiac(historicalRow.shengxiao || getShengXiao(historicalRow.special_code));
        
        // 特征比对
        if (histSx === targetSx) similarity += 5; // 生肖相同
        if (getWuXing(historicalRow.special_code) === targetWx) similarity += 3; // 五行相同
        if (getBose(historicalRow.special_code) === targetBose) similarity += 2; // 波色相同
        if (getHead(historicalRow.special_code) === targetHead) similarity += 2; // 头数相同

        // 如果相似度足够高，说明找到了一个“历史镜像”
        if (similarity >= 5) {
            // 获取镜像的下一期
            const nextDraw = allHistoryData[i - 1]; 
            const nextCode = nextDraw.special_code;
            
            // 给那个号码加分
            scores[nextCode] += (similarity * 1.5); 
        }
    }

    return scores;
}

// ----------------------------------------------------------------------------
// [第五部分] 主预测生成器 (Main Generator)
// ----------------------------------------------------------------------------

function generateSinglePrediction(historyRows) {
    let data = historyRows;
    // 数据冷启动填充
    if (!data || data.length < 5) {
        data = Array(30).fill(0).map(() => ({ special_code: Math.floor(Math.random() * 49) + 1 }));
    }

    // --- 步骤 1: 提取上期特征 ---
    const recent20 = data.slice(0, 20);
    const lastIssue = data[0];
    const lastCode = lastIssue.special_code;
    
    const lastWx = getWuXing(lastCode);
    const targetWx = WX_GENERATE[lastWx]; // 五行相生目标
    const lastSx = normalizeZodiac(lastIssue.shengxiao || getShengXiao(lastCode));
    const sanHeFriends = SAN_HE[lastSx] || []; // 三合朋友
    const chongSx = LIU_CHONG[lastSx]; // 六冲敌人
    const lastHeShu = getHeShu(lastCode); // 合数

    // --- 步骤 2: 统计基础热度 ---
    const stats = { 
        head: {}, tail: {}, zodiac: {}, numberFreq: {},
        heShuOdd: 0, heShuEven: 0 
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

    // --- 步骤 3: 计算遗漏值 (Omission) ---
    const omission = {};
    for(let i=1; i<=49; i++) {
        let missed = 0;
        for (let row of data) { 
            if (row.special_code === i) break; 
            missed++; 
        }
        omission[i] = missed;
    }

    // --- 步骤 4: 运行历史回溯引擎 ---
    const historicalScores = mineHistoricalPatterns(data);
    
    // --- 步骤 5: 预测波色与头尾特征 ---
    // 5.1 头尾
    const headWeights = Object.keys(stats.head).map(h => ({ item: parseInt(h), weight: stats.head[h]*10 + Math.random()*20 }));
    const selectedHeads = weightedRandomSelect(headWeights, 2);
    const tailWeights = Object.keys(stats.tail).map(t => ({ item: parseInt(t), weight: stats.tail[t]*10 + Math.random()*20 }));
    const selectedTails = weightedRandomSelect(tailWeights, 2);

    // 5.2 波色 (断龙逻辑)
    const lastBose = getBose(lastCode);
    const boseOpts = ['red', 'blue', 'green'];
    let zhuBo, fangBo;
    let boseStreak = 0;
    for(let r of data) { 
        if(getBose(r.special_code)===lastBose) boseStreak++; else break; 
    }
    
    if (boseStreak >= 2) {
        // 连开两期以上，大概率断龙（换色）
        const valid = boseOpts.filter(b => b !== lastBose);
        zhuBo = valid[Math.floor(Math.random() * valid.length)];
    } else {
        // 否则顺势追热
        zhuBo = Math.random() > 0.4 ? lastBose : boseOpts[Math.floor(Math.random()*3)];
    }
    fangBo = boseOpts.find(b => b !== zhuBo && b !== lastBose) || lastBose;

    // ============================================
    // 步骤 6: 全局综合评分矩阵 (Scoring Matrix)
    // 遍历 1-49 号码，进行全维度打分
    // ============================================
    const allNumScores = {};
    
    for(let i=1; i<=49; i++) {
        let score = 0;
        const wx = getWuXing(i);
        const sx = getShengXiao(i);
        const hs = getHeShu(i);
        const t = getTail(i);
        const h = getHead(i);
        const b = getBose(i);

        // [维度 A] 热度分 (Frequency)
        score += (stats.numberFreq[i] * 3); 

        // [维度 B] 历史规律分 (Historical)
        score += (historicalScores[i] || 0) * 0.5; 

        // [维度 C] 遗漏分 (Omission)
        // 重点关注遗漏 10-20 期的号码
        if (omission[i] >= 10 && omission[i] <= 20) score += 12;

        // [维度 D] 五行相生 (Five Elements)
        if (wx === targetWx) score += 15;

        // [维度 E] 生肖逻辑 (Zodiac)
        if (sanHeFriends.includes(sx)) score += 12; // 三合
        if (sx === lastSx) score += 8; // 连肖
        if (sx === chongSx) score -= 2; // 六冲(微降分)

        // [维度 F] 形态逻辑 (Pattern)
        if (i === lastCode + 1 || i === lastCode - 1) score += 8; // 邻码
        if (i === lastCode + 10 || i === lastCode - 10) score += 8; // 隔十码

        // [维度 G] 特征吻合度 (Feature Match)
        // 如果号码符合我们前面预测的 波色/头/尾，大幅加分
        if (b === zhuBo) score += 20; // 波色吻合 (重要)
        if (selectedTails.includes(t)) score += 10; // 尾数吻合
        if (selectedHeads.includes(h)) score += 5; // 头数吻合

        // [维度 H] 合数平衡
        if (hs % 2 !== 0 && stats.heShuOdd < 7) score += 6;
        if (hs % 2 === 0 && stats.heShuEven < 7) score += 6;

        // [维度 I] 随机扰动 (Chaos)
        score += Math.random() * 15;

        allNumScores[i] = score;
    }

    // ============================================
    // 步骤 7: 一肖一码选拔引擎 (One Zodiac One Code)
    // ============================================
    const zodiacOneCode = []; 
    
    ZODIAC_SEQ.forEach(zodiac => {
        // 7.1 获取该生肖下所有号码
        const nums = getZodiacNumbers(zodiac);
        
        // 7.2 组内淘汰赛：找出分数最高的
        let bestNum = nums[0];
        let maxScore = -999;
        
        nums.forEach(n => {
            const score = allNumScores[n];
            if (score > maxScore) {
                maxScore = score;
                bestNum = n;
            }
        });
        
        // 7.3 晋级
        zodiacOneCode.push({ zodiac: zodiac, num: bestNum });
    });

    // --- 步骤 8: 生成衍生预测 ---

    // 六肖 (基于各生肖最高分号码的总分排序)
    // 我们认为：如果有某个号码分数极高，那么它所属的生肖就值得推荐
    const sortedZodiacs = zodiacOneCode
        .map(item => ({ z: item.zodiac, score: allNumScores[item.num] }))
        .sort((a,b) => b.score - a.score);
    
    const liuXiao = sortedZodiacs.slice(0, 6).map(i => i.z);

    // 大小单双
    const bigCount = recent20.filter(r => r.special_code >= 25).length;
    const daXiao = (bigCount > 13) ? "小" : (bigCount < 7 ? "大" : (Math.random()>0.5?"大":"小"));
    const oddCount = recent20.filter(r => r.special_code % 2 !== 0).length;
    const danShuang = (oddCount > 13) ? "双" : (oddCount < 7 ? "单" : (Math.random()>0.5?"单":"双"));

    // 返回最终预测对象
    return {
        zodiac_one_code: zodiacOneCode, // 核心：12生肖各一码
        liu_xiao: liuXiao,
        zhu_san: liuXiao.slice(0, 3),   // 主攻前3肖
        zhu_bo: zhuBo,
        fang_bo: fangBo,
        hot_head: selectedHeads[0],
        fang_head: selectedHeads[1],
        rec_tails: selectedTails,
        da_xiao: daXiao,
        dan_shuang: danShuang
    };
}

// ----------------------------------------------------------------------------
// [第六部分] 评分验证函数 (Scoring Verification)
// 用于 Bot 在后台迭代时，判断当前预测的质量
// ----------------------------------------------------------------------------

function scorePrediction(pred, historyRows) {
    let score = 0;
    const nextResult = historyRows[0];
    if (!nextResult) return 0;

    const sp = nextResult.special_code;
    const sx = normalizeZodiac(nextResult.shengxiao || getShengXiao(sp)); 

    // 1. 生肖命中 (基础分)
    if (pred.liu_xiao.includes(sx)) score += 30;
    
    // 2. 一肖一码命中 (核心指标 - 权重极大)
    // 检查预测列表中，该生肖对应的号码是否正是特码
    const targetZodiacPred = pred.zodiac_one_code.find(item => item.zodiac === sx);
    if (targetZodiacPred && targetZodiacPred.num === sp) {
        score += 60; // 这里的加分非常高，鼓励模型寻找精准的一码
    } else if (targetZodiacPred) {
        // 如果生肖对了，但号码不对，检查是否是邻码 (安慰分)
        if (Math.abs(targetZodiacPred.num - sp) === 1) score += 10;
    }

    // 3. 属性命中
    if (getHead(sp) === pred.hot_head) score += 10;
    if (pred.rec_tails.includes(getTail(sp))) score += 10;
    if (getBose(sp) === pred.zhu_bo) score += 10;

    return score + Math.random() * 5;
}

module.exports = { parseLotteryResult, generateSinglePrediction, scorePrediction };
