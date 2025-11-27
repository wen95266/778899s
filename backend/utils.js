// 解析开奖结果文本
function parseLotteryResult(text) {
    try {
        // 1. 提取期号 (匹配 "第:2025331期" 或 "第2025331期")
        const issueMatch = text.match(/第:?(\d+)期/);
        if (!issueMatch) return null;
        const issue = issueMatch[1];

        const lines = text.split('\n');
        let numbersLine = '';
        
        // 2. 提取号码行
        for (const line of lines) {
            const trimmed = line.trim();
            // 匹配7个数字的行
            if (/^(\d{2}\s+){6}\d{2}$/.test(trimmed) || (trimmed.match(/\d{2}/g) || []).length === 7) {
                numbersLine = trimmed;
                break;
            }
        }

        if (!numbersLine) return null;

        const allNums = numbersLine.match(/\d{2}/g).map(Number);
        if (allNums.length !== 7) return null;

        const flatNumbers = allNums.slice(0, 6);
        const specialCode = allNums[6];

        // 3. 提取生肖 (找包含生肖的那一行，取最后一个)
        let shengxiao = '';
        for (const line of lines) {
            if (/[鼠牛虎兔龍龙蛇馬马羊猴雞鸡狗豬猪]/.test(line)) {
                const animals = line.trim().split(/\s+/);
                // 确保这一行也是7个字，对应上面7个号码
                if (animals.length >= 7) {
                    shengxiao = animals[animals.length - 1]; 
                }
            }
        }

        return { issue, flatNumbers, specialCode, shengxiao };

    } catch (e) {
        console.error("解析出错:", e);
        return null;
    }
}

// 生成随机预测
function generatePrediction() {
    const nums = new Set();
    while(nums.size < 6) {
        nums.add(Math.floor(Math.random() * 49) + 1);
    }
    return Array.from(nums).sort((a, b) => a - b);
}

module.exports = { parseLotteryResult, generatePrediction };