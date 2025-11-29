// =================================================================
// 六合宝典核心算法库 (Ultimate Full Integration Ver.)
// 集成：全历史回溯 | 五行生克 | 生肖三合六冲 | 数理统计 | 遗漏分析
// =================================================================

// -----------------------------------------------------------------
// [第一部分] 基础数据常量配置
// -----------------------------------------------------------------

// 1.1 标准生肖顺序
const ZODIAC_SEQ = ["蛇", "龙", "兔", "虎", "牛", "鼠", "猪", "狗", "鸡", "猴", "羊", "马"];

// 1.2 繁体转简体映射
const TRAD_MAP = {
    '龍': '龙', '馬': '马', '雞': '鸡', '豬': '猪', 
    '蛇': '蛇', '兔': '兔', '虎': '虎', '牛': '牛', 
    '鼠': '鼠', '狗': '狗', '猴': '猴', '羊': '羊'
};

// 1.3 波色表 (红/蓝/绿)
const BOSE = {
    red: [1, 2, 7, 8, 12, 13, 18, 19, 23, 24, 29, 30, 34, 35, 40, 45, 46],
    blue: [3, 4, 9, 10, 14, 15, 20, 25, 26, 31, 36, 37, 41, 42, 47, 48],
    green: [5, 6, 11, 16, 17, 21, 22, 27, 28, 32, 33, 38, 39, 43, 44, 49]
};

// 1.4 五行属性 (金木水火土)
const WU_XING = {
    '金': [3,4,17,18,25,26,33,34,47,48],
    '木': [7,8,15,16,29,30,37,38,45,46],
    '水': [1,2,11,12,19,20,35,36,43,44,49], 
    '火': [5,6,13,14,21,22,27,28,41,42],
    '土': [9,10,23,24,31,32,39,40]
};

// 1.5 五行相生关系 (Generate Cycle)
const WX_GENERATE = { 
    '金': '水', // 金生水
    '水': '木', // 水生木
    '木': '火', // 木生火
    '火': '土', // 火生土
    '土': '金'  // 土生金
};

// 1.6 生肖三合局 (吉配)
const SAN_HE = {
    '鼠': ['龙', '猴'], '龙': ['鼠', '猴'], '猴': ['鼠', '龙'],
    '牛': ['蛇', '鸡'], '蛇': ['牛', '鸡'], '鸡': ['牛', '蛇'],
    '虎': ['马', '狗'], '马': ['虎', '狗'], '狗': ['虎', '马'],
    '兔': ['羊', '猪'], '羊': ['兔', '猪'], '猪': ['兔', '羊']
};

// 1.7 生肖六冲 (对冲)
const LIU_CHONG = {
    '鼠': '马', '马': '鼠', '牛': '羊', '羊': '牛',
    '虎': '猴', '猴': '虎', '兔': '鸡', '鸡': '兔',
    '龙': '狗', '狗': '龙', '蛇': '猪', '猪': '蛇'
};

// -----------------------------------------------------------------
// [第二部分] 基础工具函数
// -----------------------------------------------------------------

// 标准化生肖字符
function normalizeZodiac(char) { 
    return TRAD_MAP[char] || char; 
}

// 根据号码获取生肖
function getShengXiao(num) { 
    const idx = (num - 1) % 12; 
    return ZODIAC_SEQ[idx]; 
}

// 根据号码获取波色
function getBose(num) { 
    if (BOSE.red.includes(num)) return 'red'; 
    if (BOSE.blue.includes(num)) return 'blue'; 
    return 'green'; 
}

// 获取头数 (十位)
function getHead(num) { 
    return Math.floor(num / 10); 
} 

// 获取尾数 (个位)
function getTail(num) { 
    return num % 10; 
}

// 获取五行
function getWuXing(num) { 
    for (const [wx, nums] of Object.entries(WU_XING)) { 
        if (nums.includes(num)) return wx; 
    } 
    return '金'; 
}

// 获取合数 (如 34 => 3+4=7)
function getHeShu(num) { 
    return Math.floor(num / 10) + (num % 10); 
}

// 核心数学工具：加权随机选择算法
function weightedRandomSelect(items, count) {
    const result = [];
    const _items = JSON.parse(JSON.stringify(items));
    
    for (let i = 0; i < count; i++) {
        if (_items.length === 0) break;
        // 计算总权重
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

// -----------------------------------------------------------------
// [第三部分] 文本解析引擎 (Parsing Engine)
// -----------------------------------------------------------------

function parseLotteryResult(text) {
    try {
        // 1. 提取期号
        const issueMatch = text.match(/第:?(\d+)期/);
        if (!issueMatch) return null;
        const issue = issueMatch[1];
        
        // 2. 寻找包含7个号码的行
        const lines = text.split('\n');
        let numbersLine = '';
        
        for (const line of lines) {
            const trimmed = line.trim();
            // 正则匹配：至少7组数字
            if (/^(\d{2}\s+){6}\d{2}$/.test(trimmed) || (trimmed.match(/\d{2}/g) || []).length === 7) {
                numbersLine = trimmed; break;
            }
        }
        if (!numbersLine) return null;

        const allNums = numbersLine.match(/\d{2}/g).map(Number);
        if (allNums.length !== 7) return null;

        const flatNumbers = allNums.slice(0, 6);
        const specialCode = allNums[6];
        
        // 3. 提取特码生肖
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

// -----------------------------------------------------------------
// [第四部分] 深度历史规律分析 (Historical Pattern Mining)
// -----------------------------------------------------------------

/**
 * 遍历整个数据库历史，寻找与“上一期”特征相似的历史期数
 * 并统计这些相似期数的“下一期”都开了什么号码
 */
function mineHistoricalPatterns(allHistoryData) {
    const scores = {};
    // 初始化 1-49 号码得分
    for(let i=1; i<=49; i++) scores[i] = 0;

    // 数据太少无法回溯
    if (!allHistoryData || allHistoryData.length < 5) return scores;

    // 获取最新一期（作为特征参照物）
    const targetIssue = allHistoryData[0];
    const targetSx = normalizeZodiac(targetIssue.shengxiao || getShengXiao(targetIssue.special_code));
    const targetWx = getWuXing(targetIssue.special_code);
    const targetBose = getBose(targetIssue.special_code);
    const targetHead = getHead(targetIssue.special_code);

    // 开始遍历历史 (从索引1开始，因为0是当前期)
    // 限制回溯最近 500 期，保证性能与时效性
    const limit = Math.min(allHistoryData.length - 1, 500);
    
    for (let i = 1; i < limit; i++) {
        const historicalRow = allHistoryData[i];
        
        // --- 1. 计算相似度 (Similarity) ---
        let similarity = 0;
        const histSx = normalizeZodiac(historicalRow.shengxiao || getShengXiao(historicalRow.special_code));
        
        // 生肖相同，权重最高
        if (histSx === targetSx) similarity += 5;
        // 五行相同
        if (getWuXing(historicalRow.special_code) === targetWx) similarity += 3;
        // 波色相同
        if (getBose(historicalRow.special_code) === targetBose) similarity += 2;
        // 头数相同
        if (getHead(historicalRow.special_code) === targetHead) similarity += 2;

        // --- 2. 规律投射 ---
        // 如果相似度 >= 5 (说明至少生肖一样，或者其他特征高度重合)
        if (similarity >= 5) {
            // 找到这期历史记录的【下一期】 (i-1)
            const nextDraw = allHistoryData[i - 1]; 
            const nextCode = nextDraw.special_code;
            
            // 下一期的号码值得推荐
            scores[nextCode] += (similarity * 1.5); 
        }
    }

    return scores;
}

// -----------------------------------------------------------------
// [第五部分] 综合预测生成器 (Main Generator)
// -----------------------------------------------------------------

function generateSinglePrediction(historyRows) {
    let data = historyRows;
    // 冷启动数据填充
    if (!data || data.length < 5) {
        data = Array(30).fill(0).map(() => ({ special_code: Math.floor(Math.random() * 49) + 1 }));
    }

    // --- 1. 数据准备 ---
    const recent20 = data.slice(0, 20);
    const lastIssue = data[0];
    const lastCode = lastIssue.special_code;
    
    // 提取上期特征
    const lastWx = getWuXing(lastCode);
    const targetWx = WX_GENERATE[lastWx]; // 五行相生目标
    const lastSx = normalizeZodiac(lastIssue.shengxiao || getShengXiao(lastCode));
    const sanHeFriends = SAN_HE[lastSx] || []; // 三合
    const chongSx = LIU_CHONG[lastSx]; // 六冲
    const lastHeShu = getHeShu(lastCode); // 合数

    // --- 2. 统计近期热度 ---
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

    // --- 3. 计算遗漏值 (Omission) ---
    const omission = {};
    for(let i=1; i<=49; i++) {
        let missed = 0;
        for (let row of data) { 
            if (row.special_code === i) break; 
            missed++; 
        }
        omission[i] = missed;
    }

    // --- 4. 调用历史回溯引擎 ---
    const historicalScores = mineHistoricalPatterns(data);

    // ============================================
    // 核心评分矩阵 (The Scoring Matrix)
    // 遍历 1-49，综合所有维度打分
    // ============================================
    const scoredNumbers = [];
    
    for(let i=1; i<=49; i++) {
        let score = 0;
        const wx = getWuXing(i);
        const sx = getShengXiao(i);
        const hs = getHeShu(i);

        // [维度 A] 热度分 (Hotness)
        // 出现次数越多，基础分越高 (追热)
        score += (stats.numberFreq[i] * 3); 

        // [维度 B] 历史规律分 (History Pattern)
        // 如果历史回溯显示该号经常在类似情况下开出
        score += (historicalScores[i] || 0) * 0.5; 

        // [维度 C] 遗漏分 (Omission Strategy)
        // 黄金回补点：遗漏 10-20 期，最容易开出
        if (omission[i] >= 10 && omission[i] <= 20) score += 12;
        // 极冷号：遗漏 > 35 期，一般不追，但给少量分防爆冷
        if (omission[i] > 35) score += 3;

        // [维度 D] 五行相生 (Five Elements)
        // 顺应天道：金生水，水生木...
        if (wx === targetWx) score += 15;

        // [维度 E] 生肖逻辑 (Zodiac Logic)
        // 三合：吉兆，加分
        if (sanHeFriends.includes(sx)) score += 12;
        // 六冲：凶兆，通常防守，少量加分
        if (sx === chongSx) score += 5;
        // 连肖：如果上期开这个肖，这期大概率连庄
        if (sx === lastSx) score += 8;

        // [维度 F] 形态逻辑 (Patterns)
        // 邻码：如上期开26，本期防25, 27
        if (i === lastCode + 1 || i === lastCode - 1) score += 8;
        // 隔十码：如上期开26，本期防16, 36
        if (i === lastCode + 10 || i === lastCode - 10) score += 8;

        // [维度 G] 合数平衡 (He Shu Balance)
        // 如果近期“合数单”开得太少，平衡法则认为该出“合数单”了
        if (hs % 2 !== 0 && stats.heShuOdd < 7) score += 6;
        if (hs % 2 === 0 && stats.heShuEven < 7) score += 6;

        // [维度 H] 随机扰动 (Chaos Theory)
        // 模拟真实世界的不可预测性
        score += Math.random() * 15;

        scoredNumbers.push({ num: i, score, sx });
    }
    
    // --- 结果提取与构建 ---

    // 1. 生成精选 12 码 (Top 12)
    scoredNumbers.sort((a, b) => b.score - a.score);
    const rec12Nums = scoredNumbers.slice(0, 12).map(o => o.num).sort((a,b)=>a-b);

    // 2. 生成六肖推荐 (基于号码分反推)
    const zScores = {};
    ZODIAC_SEQ.forEach(z => zScores[z] = Math.random() * 5); // 底分
    
    // 逻辑：将高分号码的分数，映射给对应的生肖
    scoredNumbers.slice(0, 18).forEach(o => {
        zScores[o.sx] += (o.score * 1.2); 
    });
    // 逻辑：三合生肖额外加权
    sanHeFriends.forEach(z => zScores[z] += 15);
    
    const zodiacWeights = Object.keys(zScores).map(z => ({ item: z, weight: zScores[z] }));
    const liuXiao = weightedRandomSelect(zodiacWeights, 6);

    // 3. 生成头尾推荐
    const headWeights = Object.keys(stats.head).map(h => ({ item: parseInt(h), weight: stats.head[h]*10 + Math.random()*20 }));
    const selectedHeads = weightedRandomSelect(headWeights, 2);

    const tailWeights = Object.keys(stats.tail).map(t => ({ item: parseInt(t), weight: stats.tail[t]*10 + Math.random()*20 }));
    const selectedTails = weightedRandomSelect(tailWeights, 2);

    // 4. 生成波色推荐 (断龙逻辑)
    const lastBose = getBose(lastCode);
    const boseOpts = ['red', 'blue', 'green'];
    let zhuBo, fangBo;
    
    // 检查最近是否连开同色
    let boseStreak = 0;
    for(let r of data) { 
        if(getBose(r.special_code) === lastBose) boseStreak++; else break; 
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

    // 5. 生成大小单双 (平衡逻辑)
    const bigCount = recent20.filter(r => r.special_code >= 25).length;
    // 如果大号严重超标 (>13)，推荐小；反之推荐大
    const daXiao = (bigCount > 13) ? "小" : (bigCount < 7 ? "大" : (Math.random()>0.5?"大":"小"));
    
    const oddCount = recent20.filter(r => r.special_code % 2 !== 0).length;
    // 如果单号严重超标 (>13)，推荐双；反之推荐单
    const danShuang = (oddCount > 13) ? "双" : (oddCount < 7 ? "单" : (Math.random()>0.5?"单":"双"));

    // 返回完整预测包
    return {
        liu_xiao: liuXiao,
        zhu_san: liuXiao.slice(0, 3), // 主攻前3肖
        rec_12_nums: rec12Nums,       // 核心12码
        zhu_bo: zhuBo,
        fang_bo: fangBo,
        hot_head: selectedHeads[0],
        fang_head: selectedHeads[1],
        rec_tails: selectedTails,
        da_xiao: daXiao,
        dan_shuang: danShuang
    };
}

// -----------------------------------------------------------------
// [第六部分] 评分校验系统 (Verification System)
// 用于 Bot 后台计算迭代，自我验证准确率
// -----------------------------------------------------------------

function scorePrediction(pred, historyRows) {
    let score = 0;
    const nextResult = historyRows[0];
    if (!nextResult) return 0;

    const sp = nextResult.special_code;
    const sx = normalizeZodiac(nextResult.shengxiao || getShengXiao(sp)); 

    // 1. 生肖命中 (权重 30)
    if (pred.liu_xiao.includes(sx)) score += 30;
    if (pred.zhu_san.includes(sx)) score += 20;

    // 2. 12码命中 (权重 30) - 核心指标
    if (pred.rec_12_nums && pred.rec_12_nums.includes(sp)) score += 30;

    // 3. 基础属性命中 (权重 30)
    if (getHead(sp) === pred.hot_head) score += 10;
    if (pred.rec_tails.includes(getTail(sp))) score += 10;
    if (getBose(sp) === pred.zhu_bo) score += 10;

    // 加入随机波动，模拟算力差异
    return score + Math.random() * 5;
}

module.exports = { parseLotteryResult, generateSinglePrediction, scorePrediction };
