<?php
require_once 'ZodiacManager.php';
require_once 'Db.php';

class LotteryLogic {
    
    // ==================================================================
    // 基础工具区
    // ==================================================================
    private static function getFullAttr($num) {
        $info = ZodiacManager::getInfo($num);
        return [
            'zodiac' => $info['zodiac'],
            'color'  => $info['color'],
            'element'=> $info['element'],
            'tail'   => $num % 10,
            'head'   => floor($num / 10),
            'odd'    => ($num % 2 != 0),
            'big'    => ($num >= 25),
            'val'    => intval($num)
        ];
    }

    private static function initScoreBoard() {
        $zodiacMap = ZodiacManager::getMapping();
        return array_fill_keys(array_keys($zodiacMap), 0);
    }

    private static function normalize(&$scores) {
        $max = max($scores);
        if ($max == 0) return;
        foreach ($scores as $k => $v) {
            $scores[$k] = ($v / $max) * 100;
        }
    }

    // ==================================================================
    // 十大算法模型 (V6.0 泰坦矩阵)
    // ==================================================================

    private static function model_Trend($history) {
        $scores = self::initScoreBoard();
        $weights = [10 => 3.0, 20 => 1.5, 50 => 0.5];
        foreach ($weights as $limit => $w) {
            $slice = array_slice($history, 0, min(count($history), $limit));
            foreach ($slice as $row) {
                $z = ZodiacManager::getInfo($row['spec'])['zodiac'];
                $scores[$z] += $w;
            }
        }
        self::normalize($scores);
        return $scores;
    }

    private static function model_Omission($history) {
        $scores = self::initScoreBoard();
        foreach (array_keys($scores) as $z) {
            $omission = 0;
            foreach ($history as $row) {
                if (ZodiacManager::getInfo($row['spec'])['zodiac'] === $z) break;
                $omission++;
            }
            $scores[$z] += floor($omission / 10) * 20; 
        }
        self::normalize($scores);
        return $scores;
    }

    private static function model_ZodiacLink($history) {
        $scores = self::initScoreBoard();
        if (empty($history)) return $scores;
        $lastZ = ZodiacManager::getInfo($history[0]['spec'])['zodiac'];
        $related = ZodiacManager::getRelatedZodiacs($lastZ);
        foreach ($related as $r) $scores[$r] += 80;
        self::normalize($scores);
        return $scores;
    }

    private static function model_Tail($history) {
        $scores = self::initScoreBoard();
        $tailCounts = array_fill(0, 10, 0);
        for ($i = 0; $i < min(count($history), 10); $i++) {
            $tailCounts[intval($history[$i]['spec']) % 10]++;
        }
        arsort($tailCounts);
        $hotTails = array_slice(array_keys($tailCounts), 0, 3);
        $zodiacMap = ZodiacManager::getMapping();
        foreach ($scores as $z => $v) {
            foreach ($zodiacMap[$z] as $n) {
                if (in_array($n % 10, $hotTails)) $scores[$z] += 15;
            }
        }
        self::normalize($scores);
        return $scores;
    }

    private static function model_Head($history) {
        $scores = self::initScoreBoard();
        $headCounts = array_fill(0, 5, 0);
        for ($i = 0; $i < min(count($history), 20); $i++) {
            $headCounts[floor(intval($history[$i]['spec']) / 10)]++;
        }
        arsort($headCounts);
        $hotHead = array_key_first($headCounts);
        $zodiacMap = ZodiacManager::getMapping();
        foreach ($scores as $z => $v) {
            foreach ($zodiacMap[$z] as $n) {
                if (floor($n / 10) == $hotHead) $scores[$z] += 20;
            }
        }
        self::normalize($scores);
        return $scores;
    }

    private static function model_Color($history) {
        $scores = self::initScoreBoard();
        $colorStats = ['red'=>0, 'blue'=>0, 'green'=>0];
        for ($i = 0; $i < min(count($history), 30); $i++) {
            $c = ZodiacManager::getInfo($history[$i]['spec'])['color'];
            $colorStats[$c]++;
        }
        asort($colorStats);
        $weakColor = array_key_first($colorStats);
        $zodiacMap = ZodiacManager::getMapping();
        foreach ($scores as $z => $v) {
            foreach ($zodiacMap[$z] as $n) {
                if (ZodiacManager::getInfo($n)['color'] == $weakColor) $scores[$z] += 15;
            }
        }
        self::normalize($scores);
        return $scores;
    }

    private static function model_WuXing($history) {
        $scores = self::initScoreBoard();
        if (empty($history)) return $scores;
        $lastElem = ZodiacManager::getInfo($history[0]['spec'])['element'];
        $generate = ['金'=>'水', '水'=>'木', '木'=>'火', '火'=>'土', '土'=>'金'];
        $targetElem = $generate[$lastElem] ?? '';
        $zodiacMap = ZodiacManager::getMapping();
        foreach ($scores as $z => $v) {
            foreach ($zodiacMap[$z] as $n) {
                if (ZodiacManager::getInfo($n)['element'] == $targetElem) {
                    $scores[$z] += 50; break;
                }
            }
        }
        self::normalize($scores);
        return $scores;
    }

    private static function model_HistoryMatch($history) {
        $scores = self::initScoreBoard();
        if (count($history) < 20) return $scores;
        $current = self::getFullAttr($history[0]['spec']);
        for ($i = 2; $i < count($history); $i++) {
            $past = self::getFullAttr($history[$i]['spec']);
            $sim = 0;
            if ($current['zodiac'] == $past['zodiac']) $sim += 30;
            if ($current['color'] == $past['color']) $sim += 20;
            if ($current['tail'] == $past['tail']) $sim += 20;
            if ($current['element'] == $past['element']) $sim += 10;
            if ($sim >= 50) {
                $nextZ = ZodiacManager::getInfo($history[$i-1]['spec'])['zodiac'];
                $scores[$nextZ] += $sim;
            }
        }
        self::normalize($scores);
        return $scores;
    }

    private static function model_FlatCode($history) {
        $scores = self::initScoreBoard();
        if (empty($history)) return $scores;
        $row = $history[0];
        for ($i=1; $i<=6; $i++) {
            $z = ZodiacManager::getInfo($row["n$i"])['zodiac'];
            $scores[$z] += 15;
        }
        self::normalize($scores);
        return $scores;
    }

    private static function model_Offset($history) {
        $scores = self::initScoreBoard();
        if (empty($history)) return $scores;
        $lastNum = intval($history[0]['spec']);
        $offsets = [1, -1, 10, -10, 12, -12];
        foreach ($offsets as $off) {
            $target = $lastNum + $off;
            if ($target > 49) $target -= 49;
            if ($target < 1) $target += 49;
            $z = ZodiacManager::getInfo($target)['zodiac'];
            $scores[$z] += 20;
        }
        self::normalize($scores);
        return $scores;
    }

    private static function getKiller($scores, $history) {
        $lastZ = ZodiacManager::getInfo($history[0]['spec'])['zodiac'];
        if (isset($scores[$lastZ])) $scores[$lastZ] -= 50; 
        asort($scores);
        return array_key_first($scores);
    }

    // ==================================================================
    // 主预测方法
    // ==================================================================
    public static function predict($history) {
        $zodiacMap = ZodiacManager::getMapping();
        $finalScores = self::initScoreBoard();

        $modelWeights = [
            'Trend'=>1.2, 'Omission'=>1.0, 'ZodiacLink'=>1.5, 'Tail'=>0.8, 
            'Head'=>0.6, 'Color'=>0.8, 'WuXing'=>1.0, 'HistoryMatch'=>2.0, 
            'FlatCode'=>1.0, 'Offset'=>0.5
        ];

        $models = [
            'Trend' => self::model_Trend($history),
            'Omission' => self::model_Omission($history),
            'ZodiacLink' => self::model_ZodiacLink($history),
            'Tail' => self::model_Tail($history),
            'Head' => self::model_Head($history),
            'Color' => self::model_Color($history),
            'WuXing' => self::model_WuXing($history),
            'HistoryMatch' => self::model_HistoryMatch($history),
            'FlatCode' => self::model_FlatCode($history),
            'Offset' => self::model_Offset($history)
        ];

        foreach ($models as $name => $mScores) {
            foreach ($mScores as $z => $s) {
                $finalScores[$z] += $s * $modelWeights[$name];
            }
        }

        $killed = self::getKiller($finalScores, $history);
        unset($finalScores[$killed]);

        arsort($finalScores);
        $ranked = array_keys($finalScores);
        $sixXiao = array_slice($ranked, 0, 6);
        $threeXiao = array_slice($ranked, 0, 3);

        $waveStats = ['red'=>0, 'blue'=>0, 'green'=>0];
        foreach ($threeXiao as $z) {
            foreach ($zodiacMap[$z] as $n) {
                $info = ZodiacManager::getInfo($n);
                $w = ($info['element'] == '金' || $info['element'] == '水') ? 1.5 : 1;
                $waveStats[$info['color']] += $w;
            }
        }
        arsort($waveStats);
        $waves = array_keys($waveStats);

        return [
            'six_xiao' => $sixXiao,
            'three_xiao' => $threeXiao,
            'color_wave' => ['primary'=>$waves[0], 'secondary'=>$waves[1]],
            'strategy_used' => "V6泰坦矩阵 | 杀:{$killed}"
        ];
    }

    // ==================================================================
    // 【新增】复盘核对功能
    // ==================================================================
    public static function verifyPrediction($issue, $specNum) {
        $pdo = Db::connect();
        
        // 1. 查找该期的预测存档
        $stmt = $pdo->prepare("SELECT * FROM prediction_history WHERE issue = ?");
        $stmt->execute([$issue]);
        $record = $stmt->fetch();
        
        if (!$record) return; // 没存过，无法复盘

        // 2. 获取开奖结果
        $info = ZodiacManager::getInfo($specNum);
        $realZodiac = $info['zodiac'];
        $realColor = $info['color'];

        // 3. 对比
        $sixArr = explode(',', $record['six_xiao']);
        $threeArr = explode(',', $record['three_xiao']);
        
        $isHitSix = in_array($realZodiac, $sixArr) ? 1 : 0;
        $isHitThree = in_array($realZodiac, $threeArr) ? 1 : 0;
        $isHitWave = ($realColor == $record['wave_primary'] || $realColor == $record['wave_secondary']) ? 1 : 0;

        // 4. 更新结果到数据库
        $upd = $pdo->prepare("UPDATE prediction_history SET result_zodiac=?, is_hit_six=?, is_hit_three=?, is_hit_wave=? WHERE issue=?");
        $upd->execute([$realZodiac, $isHitSix, $isHitThree, $isHitWave, $issue]);

        // 5. 如果没中，记录失败原因日志
        if ($isHitSix == 0) {
            $reason = "开奖[{$realZodiac}]不在预测[{$record['six_xiao']}]内。模型需调整权重。";
            $log = $pdo->prepare("INSERT INTO learning_logs (issue, error_reason) VALUES (?, ?)");
            $log->execute([$issue, $reason]);
        }
    }
}
?>
