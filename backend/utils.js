// ============================================================================
// 六合宝典核心算法库 (The Ultimate Full Version)
// ============================================================================
// 逻辑来源：
// 1. File 75: 五行生克 (Wu Xing)、智能杀号 (Kill Logic)、蒙特卡洛权重
// 2. File 71: 历史回溯 (Pattern Mining)、遗漏分析 (Omission)、形态分析 (Shape)
// ============================================================================

// ----------------------------------------------------------------------------
// [第一部分] 基础常量配置 (Configuration)
// ----------------------------------------------------------------------------

// 1. 标准生肖顺序
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

// 4. 五行属性 (金木水火土) - 核心依据
const ELEMENTS = {
    gold: [1,2,9,10,23,24,31,32,39,40], // 金
    wood: [5,6,13,14,21,22,35,36,43,44], // 木
    water: [11,12,19,20,33,34,41,42,49], // 水
    fire: [3,4,17,18,25,26,37,38,45,46], // 火
    earth: [7,8,15,16,29,30,47,48]       // 土
};

// 5. 五行生克关系 (用于计算下期运势)
const WX_RELATION = {
    // 生: 上期属性 -> 生 -> 本期旺属性 (加分)
    generate: { 'gold': 'water', 'water': 'wood', 'wood': 'fire', 'fire': 'earth', 'earth': 'gold' },
    // 克: 上期属性 -> 克 -> 本期弱属性 (减分/杀号)
    overcome: { 'gold': 'wood', 'wood': 'earth', 'earth': 'water', 'water': 'fire', 'fire': 'gold' }
};

// 6. 生肖关系网 (用于加权)
const ZODIAC_RELATION = {
    // 六合 (吉配，互相加分)
    harmony: { "鼠":"牛", "牛":"鼠", "虎":"猪", "猪":"虎", "兔":"狗", "狗":"兔", "龙":"鸡", "鸡":"龙", "蛇":"猴", "猴":"蛇", "马":"羊", "羊":"马" },
    // 六冲 (对冲，用于防守或杀号)
    clash: { "鼠":"马", "马":"鼠", "牛":"羊", "羊":"牛", "虎":"猴", "猴":"虎", "兔":"鸡", "鸡":"兔", "龙":"狗", "狗":"龙", "蛇":"猪", "猪":"蛇" },
    // 三合 (抱团)
    sanhe: {
        '鼠': ['龙', '猴'], '龙': ['鼠', '猴'], '猴': ['鼠', '龙'],
        '牛': ['蛇', '鸡'], '蛇': ['牛', '鸡'], '鸡': ['牛', '蛇'],
        '虎': ['马', '狗'], '马': ['虎', '狗'], '狗': ['虎', '马'],
        '兔': ['羊', '猪'], '羊': ['兔', '猪'], '猪': ['兔', '羊']
    }
};

// ----------------------------------------------------------------------------
// [第二部分] 属性计算工具函数 (Helpers)
// ----------------------------------------------------------------------------

function normalizeZodiac(char) { 
    return TRAD_MAP[char] || char; 
}

function getShengXiao(num) { 
    // (num - 1) % 12 对应 ZODIAC_SEQ 的索引
    return ZODIAC_SEQ[(num - 1) % 12]; 
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

function getHeShu(num) { 
    return Math.floor(num / 10) + (num % 10); 
}

function getWuXing(num) { 
    for (const [ele, nums] of Object.entries(ELEMENTS)) { 
        if (nums.includes(num)) return ele; 
    } 
    return 'gold'; // 默认 fallback
}

// 动态获取某个生肖下的所有号码
function getZodiacNumbers(zodiacName) {
    const nums = [];
    for (let i = 1; i <= 49; i++) {
        if (getShengXiao(i) === zodiacName) nums.push(i);
    }
    return nums;
}

// 核心数学工具：加权随机选择算法 (用于头尾预测)
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
// [第三部分] 文本解析引擎 (Parser) - 保持不变
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
// [第四部分] 历史回溯引擎 (Historical Pattern Mining)
// 来源: File 71 - 寻找历史镜像
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
            // 获取镜像的下一期 (预测目标)
            const nextDraw = allHistoryData[i - 1]; 
            const nextCode = nextDraw.special_code;
            
            // 给那个号码加分
            scores[nextCode] += (similarity * 1.5); 
        }
    }

    return scores;
}

// ----------------------------------------------------------------------------
// [第五部分] 五行杀号逻辑 (Wu Xing Kill Logic)
// 来源: File 75 - 计算宏观生肖权重
// ----------------------------------------------------------------------------

function calculateFiveElementWeights(lastDraw) {
    let scores = {};
    ZODIAC_SEQ.forEach(z => scores[z] = 50); // 初始基准分

    const lastCode = lastDraw.special_code;
    const lastZodiac = normalizeZodiac(lastDraw.shengxiao || getShengXiao(lastCode));
    const lastElement = getWuXing(lastCode);

    // 1. 五行生克 (核心)
    const targetGen = WX_RELATION.generate[lastElement]; // 旺 (被生)
    const targetOver = WX_RELATION.overcome[lastElement]; // 弱 (被克)

    ZODIAC_SEQ.forEach(z => {
        // 获取该生肖下所有号码的属性
        const nums = getZodiacNumbers(z);
        let elements = nums.map(n => getWuXing(n));
        
        // 如果该生肖包含“被生”的旺属性，大幅加分
        if (elements.includes(targetGen)) scores[z] += 30;
        // 如果该生肖包含“被克”的弱属性，大幅减分
        if (elements.includes(targetOver)) scores[z] -= 25;
    });

    // 2. 生肖关系网调整
    const harmonyZ = ZODIAC_RELATION.harmony[lastZodiac]; // 六合
    const clashZ = ZODIAC_RELATION.clash[lastZodiac];     // 六冲
    const sanheZ = ZODIAC_RELATION.sanhe[lastZodiac] || []; // 三合

    if (harmonyZ) scores[harmonyZ] += 35; // 六合大吉
    if (sanheZ) sanheZ.forEach(z => scores[z] += 15); // 三合小吉
    if (clashZ) scores[clashZ] -= 30; // 六冲避让 (主要用于杀号)

    return scores;
}

// ----------------------------------------------------------------------------
// [第六部分] 主预测生成器 (Main Generator - The Fusion)
// 集成：基础统计 + 历史回溯 + 五行杀号 + 评分矩阵
// ----------------------------------------------------------------------------

function generateSinglePrediction(historyRows) {
    let data = historyRows;
    // 数据冷启动填充
    if (!data || data.length < 5) {
        data = Array(30).fill(0).map(() => ({ special_code: Math.floor(Math.random() * 49) + 1 }));
    }

    // --- 步骤 0: 准备上期数据 ---
    const recent20 = data.slice(0, 20);
    const lastDraw = data[0];
    const lastCode = lastDraw.special_code;
    const lastSx = normalizeZodiac(lastDraw.shengxiao || getShengXiao(lastCode));

    // --- 步骤 1: 运行五行杀号逻辑 (Macro Layer) ---
    const zodiacMacroWeights = calculateFiveElementWeights(lastDraw);
    // 排序生肖分数
    const sortedZodiacs = Object.keys(zodiacMacroWeights).sort((a,b) => zodiacMacroWeights[a] - zodiacMacroWeights[b]);
    // 智能杀号: 找出得分最低的 3 个生肖
    const killZodiacs = sortedZodiacs.slice(0, 3);

    // --- 步骤 2: 基础热度与遗漏统计 (Stats Layer) ---
    const stats = { 
        head: {}, tail: {}, numberFreq: {},
        heShuOdd: 0, heShuEven: 0 
    };
    for(let i=0; i<=4; i++) stats.head[i] = 0;
    for(let i=0; i<=9; i++) stats.tail[i] = 0;
    for(let i=1; i<=49; i++) stats.numberFreq[i] = 0;

    recent20.forEach(row => {
        const n = row.special_code;
        stats.head[getHead(n)]++;
        stats.tail[getTail(n)]++;
        stats.numberFreq[n]++;
        if (getHeShu(n) % 2 === 0) stats.heShuEven++; else stats.heShuOdd++;
    });

    // 计算遗漏值 (Omission) - 多少期没开
    const omission = {};
    for(let i=1; i<=49; i++) {
        let missed = 0;
        for (let row of data) { if (row.special_code === i) break; missed++; }
        omission[i] = missed;
    }

    // --- 步骤 3: 运行历史回溯引擎 (History Layer) ---
    const historicalScores = mineHistoricalPatterns(data);
    
    // --- 步骤 4: 预测波色与头尾特征 ---
    const headWeights = Object.keys(stats.head).map(h => ({ item: parseInt(h), weight: stats.head[h]*10 + Math.random()*20 }));
    const selectedHeads = weightedRandomSelect(headWeights, 2);
    const tailWeights = Object.keys(stats.tail).map(t => ({ item: parseInt(t), weight: stats.tail[t]*10 + Math.random()*20 }));
    const selectedTails = weightedRandomSelect(tailWeights, 2);

    // 波色断龙逻辑
    const lastBose = getBose(lastCode);
    const boseOpts = ['red', 'blue', 'green'];
    let boseStreak = 0;
    for(let r of data) { if(getBose(r.special_code)===lastBose) boseStreak++; else break; }
    
    let zhuBo;
    if (boseStreak >= 2) {
        // 连开两期以上，大概率断龙（换色）
        const valid = boseOpts.filter(b => b !== lastBose);
        zhuBo = valid[Math.floor(Math.random() * valid.length)];
    } else {
        // 否则顺势追热
        zhuBo = Math.random() > 0.4 ? lastBose : boseOpts[Math.floor(Math.random()*3)];
    }
    const fangBo = boseOpts.find(b => b !== zhuBo && b !== lastBose) || lastBose;

    // ============================================
    // 步骤 5: 全局综合评分矩阵 (Scoring Matrix)
    // 融合：五行分 + 历史分 + 统计分 + 遗漏分 + 形态分
    // ============================================
    const allNumScores = {};
    const lastWx = getWuXing(lastCode);
    const targetWx = WX_RELATION.generate[lastWx];
    const sanHeFriends = ZODIAC_RELATION.sanhe[lastSx] || [];

    for(let i=1; i<=49; i++) {
        let score = 0;
        const sx = getShengXiao(i);
        const wx = getWuXing(i);
        const hs = getHeShu(i);
        const t = getTail(i);
        const h = getHead(i);
        const b = getBose(i);

        // ❌ [维度 0] 杀号逻辑 (Death Sentence)
        // 如果该生肖在杀号名单中，直接赋予极低分，确保不被选中
        if (killZodiacs.includes(sx)) {
            allNumScores[i] = -9999; 
            continue; 
        }

        // 🌟 [维度 1] 宏观生肖权重 (来自五行计算)
        // 继承该生肖的五行/关系得分
        score += (zodiacMacroWeights[sx] || 0) * 0.8;

        // [维度 A] 热度分 (Frequency)
        score += (stats.numberFreq[i] * 3); 

        // [维度 B] 历史规律分 (Historical)
        score += (historicalScores[i] || 0) * 0.5; 

        // [维度 C] 遗漏分 (Omission)
        // 重点关注遗漏 10-20 期的号码 (蓄势待发)
        if (omission[i] >= 10 && omission[i] <= 20) score += 12;

        // [维度 D] 五行相生 (Five Elements)
        if (wx === targetWx) score += 15;

        // [维度 E] 生肖逻辑 (Zodiac)
        if (sanHeFriends.includes(sx)) score += 12; // 三合
        if (sx === lastSx) score += 8; // 连肖

        // [维度 F] 形态逻辑 (Pattern) - 邻码与隔码
        if (i === lastCode + 1 || i === lastCode - 1) score += 8; // 邻码
        if (i === lastCode + 10 || i === lastCode - 10) score += 8; // 隔十码

        // [维度 G] 特征吻合度 (Feature Match)
        if (b === zhuBo) score += 20; // 波色吻合 (重要)
        if (selectedTails.includes(t)) score += 10; // 尾数吻合
        if (selectedHeads.includes(h)) score += 5; // 头数吻合

        // [维度 H] 合数平衡
        if (hs % 2 !== 0 && stats.heShuOdd < 7) score += 6;
        if (hs % 2 === 0 && stats.heShuEven < 7) score += 6;

        // [维度 I] 随机扰动 (Chaos)
        score += Math.random() * 20;

        allNumScores[i] = score;
    }

    // ============================================
    // 步骤 6: 一肖一码选拔引擎 (Selection Engine)
    // ============================================
    const zodiacOneCode = []; 
    // 只在非杀号的生肖中进行选拔
    const validZodiacs = ZODIAC_SEQ.filter(z => !killZodiacs.includes(z));

    validZodiacs.forEach(zodiac => {
        // 6.1 获取该生肖下所有号码
        const nums = getZodiacNumbers(zodiac);
        
        // 6.2 组内淘汰赛：找出该生肖内部得分最高的号码
        let bestNum = nums[0];
        let maxScore = -99999;
        
        nums.forEach(n => {
            const score = allNumScores[n];
            if (score > maxScore) {
                maxScore = score;
                bestNum = n;
            }
        });
        
        // 6.3 晋级
        zodiacOneCode.push({ zodiac: zodiac, num: bestNum, score: maxScore });
    });

    // --- 步骤 7: 生成衍生预测 ---

    // 六肖 (基于各生肖最高分号码的总分排序)
    // 排序：谁的一码分数高，谁就排前面
    const sortedZodiacItems = zodiacOneCode.sort((a,b) => b.score - a.score);
    
    const liuXiao = sortedZodiacItems.slice(0, 6).map(i => i.zodiac);

    // 大小单双 (基于最强号码反推)
    const topNum = sortedZodiacItems[0].num; // 全场总分最高的号码
    const daXiao = (topNum >= 25) ? "大" : "小";
    const danShuang = (topNum % 2 !== 0) ? "单" : "双";

    // 返回最终预测对象
    return {
        zodiac_one_code: zodiacOneCode, // 包含所有非杀号生肖的一码
        liu_xiao: liuXiao,
        zhu_san: liuXiao.slice(0, 3),   // 主攻前3肖
        zhu_bo: zhuBo,
        fang_bo: fangBo,
        hot_head: selectedHeads[0],
        fang_head: selectedHeads[1],
        rec_tails: selectedTails,
        da_xiao: daXiao,
        dan_shuang: danShuang,
        kill_zodiacs: killZodiacs // 记录被杀掉的生肖
    };
}

// ----------------------------------------------------------------------------
// [第七部分] 评分验证函数 (Scoring Verification)
// 用于 Bot 在后台迭代时，判断当前预测的质量
// ----------------------------------------------------------------------------

function scorePrediction(pred, historyRows) {
    let score = 0;
    const nextResult = historyRows[0];
    if (!nextResult) return 0;

    const sp = nextResult.special_code;
    const sx = normalizeZodiac(nextResult.shengxiao || getShengXiao(sp)); 

    // 1. 致命错误检查：如果特码生肖被杀了，说明算法此次迭代完全错误
    if (pred.kill_zodiacs && pred.kill_zodiacs.includes(sx)) {
        return -500; // 严重惩罚，确保这个结果不会被采纳
    }

    // 2. 六肖命中 (基础分)
    if (pred.liu_xiao.includes(sx)) score += 30;
    if (pred.zhu_san.includes(sx)) score += 20; // 三肖再加分
    
    // 3. 一肖一码命中 (核心指标)
    const targetZodiacPred = pred.zodiac_one_code.find(item => item.zodiac === sx);
    if (targetZodiacPred && targetZodiacPred.num === sp) {
        score += 100; // 完美命中一肖一码，极高分
    } else if (targetZodiacPred) {
        // 如果生肖对了，但号码不对，检查是否是邻码 (安慰分)
        if (Math.abs(targetZodiacPred.num - sp) === 1) score += 15;
    }

    // 4. 属性命中
    if (getHead(sp) === pred.hot_head) score += 10;
    if (pred.rec_tails.includes(getTail(sp))) score += 10;
    if (getBose(sp) === pred.zhu_bo) score += 15;

    return score + Math.random() * 5; // 微小随机扰动，避免分数完全一致
}

module.exports = { parseLotteryResult, generateSinglePrediction, scorePrediction };
