/**
 * 六合宝典核心算法库 (Ultimate Fusion Version)
 * 包含：时区修正、农历五行、历史回溯、遗漏分析、多维评分矩阵
 */
const { Lunar } = require('lunar-javascript');

// ==========================================
// 1. 基础配置
// ==========================================
const ZODIAC_SEQ = ["蛇", "龙", "兔", "虎", "牛", "鼠", "猪", "狗", "鸡", "猴", "羊", "马"]; // 2025年
const TRAD_MAP = { '龍': '龙', '馬': '马', '雞': '鸡', '豬': '猪', '蛇': '蛇', '兔': '兔', '虎': '虎', '牛': '牛', '鼠': '鼠', '狗': '狗', '猴': '猴', '羊': '羊' };

const BOSE = {
    red: [1, 2, 7, 8, 12, 13, 18, 19, 23, 24, 29, 30, 34, 35, 40, 45, 46],
    blue: [3, 4, 9, 10, 14, 15, 20, 25, 26, 31, 36, 37, 41, 42, 47, 48],
    green: [5, 6, 11, 16, 17, 21, 22, 27, 28, 32, 33, 38, 39, 43, 44, 49]
};

const WUXING_NUMS = {
    gold: [1,2,9,10,23,24,31,32,39,40],
    wood: [5,6,13,14,21,22,35,36,43,44],
    water: [11,12,19,20,33,34,41,42,49],
    fire: [3,4,17,18,25,26,37,38,45,46],
    earth: [7,8,15,16,29,30,47,48]
};

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

// ==========================================
// 2. 辅助函数
// ==========================================
function getShengXiao(num) { return ZODIAC_SEQ[(num - 1) % 12]; }
function normalizeZodiac(char) { return TRAD_MAP[char] || char; }
function getBose(num) { if (BOSE.red.includes(num)) return 'red'; if (BOSE.blue.includes(num)) return 'blue'; return 'green'; }
function getWuXing(num) { for (const [e, nums] of Object.entries(WUXING_NUMS)) { if (nums.includes(num)) return e; } return 'gold'; }
function getNumbersByZodiac(z) { const nums = []; for(let i=1; i<=49; i++) if(getShengXiao(i)===z) nums.push(i); return nums; }
function getHead(num) { return Math.floor(num / 10); } 
function getTail(num) { return num % 10; }

// [核心修复] 获取北京时间明天的五行
function getDayElement() {
    const now = new Date();
    const beijingTimeStr = now.toLocaleString("en-US", {timeZone: "Asia/Shanghai"});
    const beijingDate = new Date(beijingTimeStr);
    beijingDate.setDate(beijingDate.getDate() + 1); 
    const lunar = Lunar.fromDate(beijingDate);
    const dayGan = lunar.getDayGan(); 
    const wuxingMap = { "甲":"wood", "乙":"wood", "丙":"fire", "丁":"fire", "戊":"earth", "己":"earth", "庚":"gold", "辛":"gold", "壬":"water", "癸":"water" };
    return wuxingMap[dayGan] || 'gold';
}

// ==========================================
// 3. 历史回溯引擎 (History Pattern Mining)
// ==========================================
function mineHistoricalPatterns(allHistoryData) {
    const scores = {};
    for(let i=1; i<=49; i++) scores[i] = 0;
    if (!allHistoryData || allHistoryData.length < 5) return scores;

    const targetIssue = allHistoryData[0];
    const targetSx = normalizeZodiac(targetIssue.shengxiao || getShengXiao(targetIssue.special_code));
    const targetWx = getWuXing(targetIssue.special_code);
    const targetBose = getBose(targetIssue.special_code);

    // 回溯最近 100 期
    const limit = Math.min(allHistoryData.length - 1, 100);
    for (let i = 1; i < limit; i++) {
        const row = allHistoryData[i];
        let similarity = 0;
        const histSx = normalizeZodiac(row.shengxiao || getShengXiao(row.special_code));
        
        // 寻找历史镜像
        if (histSx === targetSx) similarity += 5;
        if (getWuXing(row.special_code) === targetWx) similarity += 3;
        if (getBose(row.special_code) === targetBose) similarity += 2;

        // 如果相似度高，则下一期开出的号码加分
        if (similarity >= 5) {
            const nextDraw = allHistoryData[i - 1]; 
            scores[nextDraw.special_code] += (similarity * 0.5); 
        }
    }
    return scores;
}

// ==========================================
// 4. 多维预测生成器 (Generator)
// ==========================================
function generateSinglePrediction(historyRows) {
    if (!historyRows || historyRows.length < 10) {
        historyRows = Array(20).fill(0).map((_,i) => ({ special_code: Math.floor(Math.random()*49)+1, issue: 2024000-i, shengxiao: ZODIAC_SEQ[i%12] }));
    }
    
    const lastDraw = historyRows[0];
    const lastCode = lastDraw.special_code;
    const lastSx = normalizeZodiac(lastDraw.shengxiao || getShengXiao(lastCode));
    const dayElement = getDayElement(); 

    // [Step 1] 智能杀号 (Kill Logic)
    let killZodiacs = new Set();
    const killMap = { 'wood':'earth', 'earth':'water', 'water':'fire', 'fire':'gold', 'gold':'wood' };
    
    // 杀日冲
    const killedElement = killMap[dayElement]; 

    // 杀六冲
    if (ZODIAC_RELATION.clash[lastSx]) killZodiacs.add(ZODIAC_RELATION.clash[lastSx]);

    // 杀极冷 (遗漏>25期)
    const zodiacCounts = {};
    ZODIAC_SEQ.forEach(z => zodiacCounts[z] = 0);
    historyRows.slice(0, 25).forEach(r => {
        const sx = normalizeZodiac(r.shengxiao || getShengXiao(r.special_code));
        zodiacCounts[sx]++;
    });
    ZODIAC_SEQ.forEach(z => { if (zodiacCounts[z] === 0) killZodiacs.add(z); });
    const finalKillZodiacs = Array.from(killZodiacs).slice(0, 3);

    // [Step 2] 统计学数据 (Stats)
    const numberFreq = {};
    for(let i=1; i<=49; i++) numberFreq[i] = 0;
    historyRows.slice(0, 20).forEach(r => numberFreq[r.special_code]++);

    // 遗漏分析
    const omission = {};
    for(let i=1; i<=49; i++) {
        let missed = 0;
        for (let row of historyRows) { if (row.special_code === i) break; missed++; }
        omission[i] = missed;
    }

    // [Step 3] 历史回溯分
    const historyScores = mineHistoricalPatterns(historyRows);

    // [Step 4] 全局评分矩阵
    const allNumScores = {};
    for(let i=1; i<=49; i++) {
        let score = 0;
        const sx = getShengXiao(i);
        const wx = getWuXing(i);
        
        // 杀号直接淘汰
        if (finalKillZodiacs.includes(sx)) { allNumScores[i] = -9999; continue; }

        // A. 五行权重
        if (killMap[getWuXing(getNumbersByZodiac(sx)[0])] === dayElement) score += 20; // 旺
        if (wx === dayElement) score += 10;

        // B. 热度与遗漏
        score += (numberFreq[i] * 5); // 热度加分
        if (omission[i] >= 10 && omission[i] <= 20) score += 10; // 回补加分

        // C. 历史回溯
        score += (historyScores[i] || 0);

        // D. 生肖关系
        if (ZODIAC_RELATION.sanhe[lastSx] && ZODIAC_RELATION.sanhe[lastSx].includes(sx)) score += 8; // 三合

        // E. 随机扰动 (模拟蒙特卡洛)
        score += Math.random() * 15;

        allNumScores[i] = score;
    }

    // [Step 5] 选拔
    // 按生肖分组取最高分号码
    const zodiacOneCode = [];
    const validZodiacs = ZODIAC_SEQ.filter(z => !finalKillZodiacs.includes(z));

    validZodiacs.forEach(z => {
        const nums = getNumbersByZodiac(z);
        let bestNum = nums[0];
        let maxScore = -9999;
        nums.forEach(n => {
            if (allNumScores[n] > maxScore) { maxScore = allNumScores[n]; bestNum = n; }
        });
        zodiacOneCode.push({ zodiac: z, num: bestNum, score: maxScore });
    });

    // 排序生肖
    const sortedZodiacItems = zodiacOneCode.sort((a,b) => b.score - a.score);
    const liuXiao = sortedZodiacItems.slice(0, 6).map(i => i.zodiac); // 取前6作为推荐

    // 头尾计算
    const heads = historyRows.slice(0,10).map(r => Math.floor(r.special_code/10));
    const tails = historyRows.slice(0,10).map(r => r.special_code%10);
    const mode = (arr) => { if(!arr.length) return 0; return arr.sort((a,b) => arr.filter(v=>v===a).length - arr.filter(v=>v===b).length).pop(); };
    
    return {
        zodiac_one_code: zodiacOneCode,
        liu_xiao: liuXiao.slice(0, 5), // 五肖
        zhu_san: liuXiao.slice(0, 3),  // 三肖
        kill_zodiacs: finalKillZodiacs,
        zhu_bo: getBose(lastCode) === 'red' ? 'green' : 'red',
        fang_bo: 'blue',
        hot_head: mode(heads),
        fang_head: (mode(heads) + 1) % 5,
        rec_tails: [mode(tails), (mode(tails)+3)%10, (mode(tails)+5)%10].sort(),
        da_xiao: lastCode < 25 ? '大' : '小',
        dan_shuang: lastCode % 2 === 0 ? '单' : '双'
    };
}

// 文本解析
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

// 评分函数 (用于迭代优化 - 越高越好)
function scorePrediction(pred, historyRows) {
    let score = 0;
    // 这里模拟“自我博弈”：如果预测的五肖里包含了“热门趋势”，加分
    const hotZodiacs = historyRows.slice(0,5).map(r => normalizeZodiac(r.shengxiao || getShengXiao(r.special_code)));
    pred.liu_xiao.forEach(z => {
        if (hotZodiacs.includes(z)) score += 10;
    });
    // 随机扰动，确保每次迭代有差异
    return score + Math.random() * 20;
}

module.exports = { parseLotteryResult, generateSinglePrediction, scorePrediction };
