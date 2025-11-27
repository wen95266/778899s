// --- 基础配置 ---
const ZODIAC_SEQ = ["蛇", "龙", "兔", "虎", "牛", "鼠", "猪", "狗", "鸡", "猴", "羊", "马"];

const BOSE = {
    red: [1, 2, 7, 8, 12, 13, 18, 19, 23, 24, 29, 30, 34, 35, 40, 45, 46],
    blue: [3, 4, 9, 10, 14, 15, 20, 25, 26, 31, 36, 37, 41, 42, 47, 48],
    green: [5, 6, 11, 16, 17, 21, 22, 27, 28, 32, 33, 38, 39, 43, 44, 49]
};

// --- 工具函数 ---

function getShengXiao(num) {
    const idx = (num - 1) % 12;
    return ZODIAC_SEQ[idx];
}

function getBose(num) {
    if (BOSE.red.includes(num)) return 'red';
    if (BOSE.blue.includes(num)) return 'blue';
    return 'green';
}

// 🔥 增强版解析器
function parseLotteryResult(text) {
    console.log("正在解析文本:", JSON.stringify(text)); // 打印日志方便调试

    try {
        // 1. 提取期号
        // 兼容 "第:2025888期", "第2025888期", "第 2025888 期"
        const issueMatch = text.match(/第\s*:?\s*(\d+)\s*期/);
        if (!issueMatch) {
            console.log("❌ 解析失败: 没找到期号");
            return null;
        }
        const issue = issueMatch[1];

        // 2. 提取号码
        const lines = text.split('\n');
        let numbersLine = '';
        
        for (const line of lines) {
            const trimmed = line.trim();
            // 只要这一行包含至少7个两位数 (01-49)，就认为是号码行
            // 忽略日期行 (2025-11-27)
            const nums = trimmed.match(/\b\d{2}\b/g); 
            if (nums && nums.length >= 7 && !trimmed.includes('-') && !trimmed.includes(':')) {
                numbersLine = trimmed;
                break;
            }
        }

        if (!numbersLine) {
            console.log("❌ 解析失败: 没找到包含7个号码的行");
            return null;
        }

        // 提取所有数字
        const allNums = numbersLine.match(/\d{2}/g).map(Number);
        const flatNumbers = allNums.slice(0, 6);
        const specialCode = allNums[6];

        // 3. 计算生肖 (优先使用代码计算，不依赖文本里的汉字，防止OCR错误)
        const shengxiao = getShengXiao(specialCode);

        console.log(`✅ 解析成功: 第${issue}期, 特码${specialCode}(${shengxiao})`);
        return { issue, flatNumbers, specialCode, shengxiao };

    } catch (e) {
        console.error("❌ 解析过程抛出异常:", e);
        return null;
    }
}

// 生成综合预测
function generatePrediction(historyRows = []) {
    const zodiacStats = {};
    const waveStats = { red: 0, blue: 0, green: 0 };
    let bigCount = 0;
    let oddCount = 0;

    ZODIAC_SEQ.forEach(z => zodiacStats[z] = 0);

    const dataToAnalyze = historyRows.length > 0 ? historyRows : Array(10).fill(0).map(()=>({special_code: Math.floor(Math.random()*49)+1}));

    dataToAnalyze.forEach(row => {
        const sp = row.special_code;
        const sx = getShengXiao(sp);
        if (zodiacStats[sx] !== undefined) zodiacStats[sx]++;
        
        const wave = getBose(sp);
        if (waveStats[wave] !== undefined) waveStats[wave]++;

        if (sp >= 25) bigCount++;
        if (sp % 2 !== 0) oddCount++;
    });

    const sortedZodiacs = Object.keys(zodiacStats).sort((a, b) => zodiacStats[b] - zodiacStats[a]);
    const top3 = sortedZodiacs.slice(0, 3);
    const others = sortedZodiacs.slice(3).sort(() => 0.5 - Math.random()).slice(0, 3);
    const recommend6 = [...top3, ...others];

    const sortedWaves = Object.keys(waveStats).sort((a, b) => waveStats[b] - waveStats[a]);
    const mainWave = sortedWaves[0];
    const defendWave = sortedWaves[1];

    const total = dataToAnalyze.length;
    const predBigSmall = (bigCount > total / 2) ? "大" : "小";
    const predOddEven = (oddCount > total / 2) ? "单" : "双";

    return {
        liu_xiao: recommend6,
        zhu_san: top3,
        zhu_bo: mainWave,
        fang_bo: defendWave,
        da_xiao: predBigSmall,
        dan_shuang: predOddEven
    };
}

module.exports = { parseLotteryResult, generatePrediction, getShengXiao, getBose };