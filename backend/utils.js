const { Lunar } = require('lunar-javascript');

// --- 基础配置 ---
const ZODIAC_SEQ = ["蛇", "龙", "兔", "虎", "牛", "鼠", "猪", "狗", "鸡", "猴", "羊", "马"]; // 2025年顺序
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
    clash: { "鼠":"马", "马":"鼠", "牛":"羊", "羊":"牛", "虎":"猴", "猴":"虎", "兔":"鸡", "鸡":"兔", "龙":"狗", "狗":"龙", "蛇":"猪", "猪":"蛇" }
};

// --- 辅助函数 ---
function getShengXiao(num) { return ZODIAC_SEQ[(num - 1) % 12]; }
function normalizeZodiac(char) { return TRAD_MAP[char] || char; }
function getBose(num) { if (BOSE.red.includes(num)) return 'red'; if (BOSE.blue.includes(num)) return 'blue'; return 'green'; }
function getWuXing(num) { for (const [e, nums] of Object.entries(WUXING_NUMS)) { if (nums.includes(num)) return e; } return 'gold'; }
function getNumbersByZodiac(z) { const nums = []; for(let i=1; i<=49; i++) if(getShengXiao(i)===z) nums.push(i); return nums; }

// 获取开奖日五行 (日柱)
function getDayElement() {
    // 模拟下期开奖日（当前时间+1天）
    const date = new Date();
    date.setDate(date.getDate() + 1); 
    const lunar = Lunar.fromDate(date);
    const dayGan = lunar.getDayGan(); 
    const wuxingMap = { "甲":"wood", "乙":"wood", "丙":"fire", "丁":"fire", "戊":"earth", "己":"earth", "庚":"gold", "辛":"gold", "壬":"water", "癸":"water" };
    return wuxingMap[dayGan] || 'gold';
}

// --- 核心预测函数 ---
function generateSinglePrediction(historyRows) {
    // 数据兜底，防止第一期运行报错
    if (!historyRows || historyRows.length < 10) {
        historyRows = Array(20).fill(0).map((_,i) => ({ special_code: Math.floor(Math.random()*49)+1, issue: 2024000-i }));
    }
    
    const lastDraw = historyRows[0];
    const lastCode = lastDraw.special_code;
    const lastSx = normalizeZodiac(lastDraw.shengxiao || getShengXiao(lastCode));
    const dayElement = getDayElement(); 

    // [1. 智能杀肖]
    let killZodiacs = new Set();
    const killMap = { 'wood':'earth', 'earth':'water', 'water':'fire', 'fire':'gold', 'gold':'wood' };
    
    // 杀上期冲肖
    if (ZODIAC_RELATION.clash[lastSx]) killZodiacs.add(ZODIAC_RELATION.clash[lastSx]);

    // 杀极冷 (遗漏>30期)
    const zodiacCounts = {};
    ZODIAC_SEQ.forEach(z => zodiacCounts[z] = 0);
    historyRows.slice(0, 30).forEach(r => {
        const sx = normalizeZodiac(r.shengxiao || getShengXiao(r.special_code));
        zodiacCounts[sx]++;
    });
    ZODIAC_SEQ.forEach(z => { if (zodiacCounts[z] === 0) killZodiacs.add(z); });

    const finalKillZodiacs = Array.from(killZodiacs).slice(0, 3); // 最多杀3个

    // [2. 生肖评分]
    let scores = {};
    ZODIAC_SEQ.forEach(z => scores[z] = 0);

    ZODIAC_SEQ.forEach(z => {
        if (finalKillZodiacs.includes(z)) { scores[z] = -999; return; }

        const myNums = getNumbersByZodiac(z);
        const myMainElement = getWuXing(myNums[0]); 
        
        // 五行生克
        if (killMap[myMainElement] === dayElement) scores[z] += 20; 
        if (killMap[dayElement] === myMainElement) scores[z] -= 10; 
        if (dayElement === myMainElement) scores[z] += 15; 

        // 连肖与六合
        if (z === lastSx) scores[z] += 10; 
        if (z === ZODIAC_RELATION.harmony[lastSx]) scores[z] += 15; 

        // 历史热度
        if (zodiacCounts[z] >= 3) scores[z] += 20; 
        if (zodiacCounts[z] === 1) scores[z] += 5; 
        
        // 随机扰动 (模拟不可控因素)
        scores[z] += Math.random() * 5;
    });

    // [3. 选拔]
    const sortedZodiacs = Object.keys(scores).sort((a,b) => scores[b] - scores[a]);
    const wuXiao = sortedZodiacs.slice(0, 5); // 五肖
    const zhuSan = sortedZodiacs.slice(0, 3); // 三肖
    
    // 选一码
    const zodiacOneCode = [];
    wuXiao.forEach(z => {
        const nums = getNumbersByZodiac(z);
        let bestNum = nums[Math.floor(nums.length/2)];
        let maxFreq = -1;
        nums.forEach(n => {
            let freq = historyRows.filter(r => r.special_code === n).length;
            if (getBose(n) !== getBose(lastCode)) freq += 2; // 防断龙
            if (freq > maxFreq) { maxFreq = freq; bestNum = n; }
        });
        zodiacOneCode.push({ zodiac: z, num: bestNum });
    });

    // 统计头尾
    const heads = historyRows.slice(0,10).map(r => Math.floor(r.special_code/10));
    const tails = historyRows.slice(0,10).map(r => r.special_code%10);
    const mode = (arr) => {
        if(arr.length === 0) return 0;
        return arr.sort((a,b) => arr.filter(v=>v===a).length - arr.filter(v=>v===b).length).pop();
    };
    const hotHead = mode(heads);
    const hotTail = mode(tails);

    return {
        zodiac_one_code: zodiacOneCode,
        liu_xiao: wuXiao,
        zhu_san: zhuSan,
        kill_zodiacs: finalKillZodiacs,
        zhu_bo: getBose(lastCode) === 'red' ? 'green' : 'red', 
        fang_bo: 'blue',
        hot_head: hotHead,
        fang_head: (hotHead + 1) % 5,
        rec_tails: [hotTail, (hotTail+3)%10, (hotTail+5)%10].sort(),
        da_xiao: lastCode < 25 ? '大' : '小',
        dan_shuang: lastCode % 2 === 0 ? '单' : '双'
    };
}

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

function scorePrediction(pred, historyRows) {
    return Math.random() * 100; 
}

module.exports = { parseLotteryResult, generateSinglePrediction, scorePrediction };
