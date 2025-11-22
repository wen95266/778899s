<?php
// backend/telegram/parser.php

function parse_channel_post($text) {
    $text = trim($text);
    $lines = explode("\n", $text);
    
    // 初始化数据结构
    $data = [
        'lottery_type' => '',
        'issue_number' => '',
        'winning_numbers' => [],
        'zodiac_signs' => [],
        'colors' => [],
        'drawing_date' => date('Y-m-d')
    ];

    // 1. 识别彩票类型和期号
    // 匹配示例: "新澳门六合彩第:045期开奖结果:" 或 "香港六合彩 第123期"
    if (preg_match('/(新澳门|老澳门|香港).*?(\d+)[期]?/u', $text, $matches)) {
        if (strpos($matches[1], '新澳门') !== false) $data['lottery_type'] = '新澳门六合彩';
        elseif (strpos($matches[1], '老澳门') !== false) $data['lottery_type'] = '老澳门六合彩';
        elseif (strpos($matches[1], '香港') !== false) $data['lottery_type'] = '香港六合彩';
        
        $data['issue_number'] = $matches[2];
    } else {
        return null; // 无法识别标题
    }

    // 2. 提取所有数字 (通常开奖号码是6+1个)
    // 假设格式包含: 01 02 03 04 05 06 + 07
    preg_match_all('/\b\d{2}\b/', $text, $num_matches);
    if (isset($num_matches[0]) && count($num_matches[0]) >= 7) {
        // 取前7个数字作为开奖号码
        $data['winning_numbers'] = array_slice($num_matches[0], 0, 7);
    } else {
        return null; // 找不到足够的号码
    }

    // 3. 提取波色 (根据 Emoji)
    preg_match_all('/[🔴🟢🔵]/u', $text, $color_matches);
    $color_map = ['🔴'=>'红波', '🟢'=>'绿波', '🔵'=>'蓝波'];
    if (isset($color_matches[0])) {
        foreach($color_matches[0] as $emoji) {
            if (isset($color_map[$emoji])) {
                $data['colors'][] = $color_map[$emoji];
            }
        }
    }

    // 4. 提取生肖 (简单的中文匹配)
    preg_match_all('/[鼠牛虎兔龙蛇马羊猴鸡狗猪]/u', $text, $zodiac_matches);
    if (isset($zodiac_matches[0])) {
        // 过滤掉标题里的干扰字，通常生肖在号码附近
        // 这里做一个简单假设：取最后7个匹配到的生肖
        $count = count($zodiac_matches[0]);
        if ($count >= 7) {
            $data['zodiac_signs'] = array_slice($zodiac_matches[0], -7);
        }
    }

    // 数据补全校验
    if (count($data['colors']) != 7) $data['colors'] = array_fill(0, 7, '未知');
    if (count($data['zodiac_signs']) != 7) $data['zodiac_signs'] = array_fill(0, 7, '未知');

    return $data;
}
?>