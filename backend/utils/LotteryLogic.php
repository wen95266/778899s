<?php
require_once 'ZodiacManager.php';
require_once 'Db.php';

class LotteryLogic {
    
    // ==================================================================
    // 1. 基础工具 & 数据结构
    // ==================================================================
    private static function getFullAttr($num) {
        return ZodiacManager::getInfo($num);
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
    // 2. 原子算法模型 (Atomic Models) - 预测师的技能包
    // ==================================================================
    
    // M1: 趋势 (0-10分权重)
    private static function m_Trend($history) {
        $scores = self::initScoreBoard();
        for ($i=0; $i<min(count($history),30); $i++) {
            $z = ZodiacManager::getInfo($history[$i]['spec'])['zodiac'];
            $scores[$z] += ($i<10 ? 3 : 1);
        }
        self::normalize($scores); return $scores;
    }

    // M2: 遗漏 (0-10分权重)
    private static function m_Omission($history) {
        $scores = self::initScoreBoard();
        foreach (array_keys($scores) as $z) {
            $cnt = 0;
            foreach ($history as $row) {
                if (ZodiacManager::getInfo($row['spec'])['zodiac'] == $z) break;
                $cnt++;
            }
            $scores[$z] += floor($cnt/10)*10;
        }
        self::normalize($scores); return $scores;
    }

    // M3: 生肖链 (0-10分权重)
    private static function m_Link($history) {
        $scores = self::initScoreBoard();
        if ($history) {
            $lz = ZodiacManager::getInfo($history[0]['spec'])['zodiac'];
            foreach (ZodiacManager::getRelatedZodiacs($lz) as $rz) $scores[$rz]+=10;
        }
        self::normalize($scores); return $scores;
    }

    // M4: 尾数 (0-10分权重)
    private static function m_Tail($history) {
        $scores = self::initScoreBoard();
        $tc = array_fill(0,10,0);
        for($i=0; $i<min(count($history),10); $i++) $tc[intval($history[$i]['spec'])%10]++;
        arsort($tc);
        $hot = array_slice(array_keys($tc),0,3);
        $map = ZodiacManager::getMapping();
        foreach($scores as $z=>$v) foreach($map[$z] as $n) if(in_array($n%10,$hot)) $scores[$z]+=10;
        self::normalize($scores); return $scores;
    }

    // M5: 五行 (0-10分权重)
    private static function m_WuXing($history) {
        $scores = self::initScoreBoard();
        if ($history) {
            $le = ZodiacManager::getInfo($history[0]['spec'])['element'];
            $gen = ['金'=>'水','水'=>'木','木'=>'火','火'=>'土','土'=>'金'];
            $te = $gen[$le]??'';
            $map = ZodiacManager::getMapping();
            foreach($scores as $z=>$v) foreach($map[$z] as $n) if(ZodiacManager::getInfo($n)['element']==$te) {$scores[$z]+=10; break;}
        }
        self::normalize($scores); return $scores;
    }

    // M6: 历史回溯 (0-10分权重) - 最耗时但最准
    private static function m_History($history) {
        $scores = self::initScoreBoard();
        if (count($history)<20) return $scores;
        $cur = self::getFullAttr($history[0]['spec']);
        for($i=2; $i<count($history); $i++) {
            $past = self::getFullAttr($history[$i]['spec']);
            $sim = 0;
            if($cur['zodiac']==$past['zodiac']) $sim+=30;
            if($cur['color']==$past['color']) $sim+=20;
            if($sim>=50) {
                $nz = ZodiacManager::getInfo($history[$i-1]['spec'])['zodiac'];
                $scores[$nz] += $sim;
            }
        }
        self::normalize($scores); return $scores;
    }

    // ==================================================================
    // 3. 遗传算法引擎 (Darwin Engine)
    // ==================================================================

    // 生成一个随机基因 (一组权重参数)
    private static function createGene() {
        return [
            'w_trend' => rand(0, 100) / 10,  // 0.0 - 10.0
            'w_omiss' => rand(0, 100) / 10,
            'w_link'  => rand(0, 100) / 10,
            'w_tail'  => rand(0, 100) / 10,
            'w_wuxing'=> rand(0, 100) / 10,
            'w_hist'  => rand(0, 100) / 10,
            'fitness' => 0 // 适应度得分
        ];
    }

    // 运行预测 (基于给定基因)
    private static function runPrediction($history, $gene) {
        $final = self::initScoreBoard();
        $m1 = self::m_Trend($history);
        $m2 = self::m_Omission($history);
        $m3 = self::m_Link($history);
        $m4 = self::m_Tail($history);
        $m5 = self::m_WuXing($history);
        $m6 = self::m_History($history);

        foreach ($final as $z => $s) {
            $final[$z] += $m1[$z] * $gene['w_trend'];
            $final[$z] += $m2[$z] * $gene['w_omiss'];
            $final[$z] += $m3[$z] * $gene['w_link'];
            $final[$z] += $m4[$z] * $gene['w_tail'];
            $final[$z] += $m5[$z] * $gene['w_wuxing'];
            $final[$z] += $m6[$z] * $gene['w_hist'];
        }
        arsort($final);
        return array_keys($final); // 返回排名后的生肖数组
    }

    // 进化过程：回测寻优
    private static function evolve($fullHistory) {
        // 配置
        $POPULATION_SIZE = 30; // 种群数量
        $GENERATIONS = 10;     // 进化代数 (Serv00性能有限，别设太大)
        $TEST_RANGE = 15;      // 回测最近多少期

        // 1. 初始种群
        $population = [];
        for ($i=0; $i<$POPULATION_SIZE; $i++) $population[] = self::createGene();

        // 开始进化循环
        for ($g=0; $g<$GENERATIONS; $g++) {
            
            // A. 计算适应度 (考试)
            foreach ($population as &$gene) {
                $score = 0;
                // 对过去 N 期进行模拟预测
                for ($t=0; $t<$TEST_RANGE; $t++) {
                    // 切片：用过去的历史预测当时的结果
                    $mockHistory = array_slice($fullHistory, $t + 1); 
                    $realResult = ZodiacManager::getInfo($fullHistory[$t]['spec'])['zodiac'];
                    
                    $ranking = self::runPrediction($mockHistory, $gene);
                    $top6 = array_slice($ranking, 0, 6);
                    $top3 = array_slice($ranking, 0, 3);

                    if (in_array($realResult, $top6)) $score += 10; // 中六肖 +10分
                    if (in_array($realResult, $top3)) $score += 30; // 中三肖 +30分
                }
                $gene['fitness'] = $score;
            }
            unset($gene); // 断开引用

            // B. 自然选择 (排序)
            usort($population, function($a, $b) {
                return $b['fitness'] - $a['fitness'];
            });

            // 如果是最后一代，直接返回最强王者
            if ($g == $GENERATIONS - 1) break;

            // C. 繁衍下一代 (保留前 50% 精英，后 50% 由精英杂交变异生成)
            $eliteCount = intval($POPULATION_SIZE / 2);
            $newPop = array_slice($population, 0, $eliteCount);

            while (count($newPop) < $POPULATION_SIZE) {
                // 随机选两个精英父母
                $p1 = $population[rand(0, $eliteCount-1)];
                $p2 = $population[rand(0, $eliteCount-1)];
                
                // 交叉
                $child = [
                    'w_trend' => ($p1['w_trend'] + $p2['w_trend']) / 2,
                    'w_omiss' => ($p1['w_omiss'] + $p2['w_omiss']) / 2,
                    'w_link'  => ($p1['w_link'] + $p2['w_link']) / 2,
                    'w_tail'  => ($p1['w_tail'] + $p2['w_tail']) / 2,
                    'w_wuxing'=> ($p1['w_wuxing'] + $p2['w_wuxing']) / 2,
                    'w_hist'  => ($p1['w_hist'] + $p2['w_hist']) / 2,
                    'fitness' => 0
                ];

                // 变异 (10% 概率)
                if (rand(0,100) < 10) {
                    $key = array_rand($child);
                    if ($key != 'fitness') $child[$key] = rand(0, 100) / 10;
                }
                $newPop[] = $child;
            }
            $population = $newPop;
        }

        return $population[0]; // 返回最强基因
    }

    // ==================================================================
    // 4. 主入口
    // ==================================================================
    public static function predict($history) {
        // 1. 启动进化引擎，寻找最佳权重
        $bestGene = self::evolve($history);
        
        // 2. 用最强基因预测下一期
        $ranking = self::runPrediction($history, $bestGene);
        
        $sixXiao = array_slice($ranking, 0, 6);
        $threeXiao = array_slice($ranking, 0, 3);

        // 3. 波色 & 大小单双 (基于前三肖推荐)
        $zodiacMap = ZodiacManager::getMapping();
        $waveStats = ['red'=>0, 'blue'=>0, 'green'=>0];
        $bsStats = ['大'=>0, '小'=>0];
        $oeStats = ['单'=>0, '双'=>0];

        foreach ($threeXiao as $z) {
            foreach ($zodiacMap[$z] as $n) {
                $info = ZodiacManager::getInfo($n);
                $waveStats[$info['color']]++;
                $bsStats[$info['bs']]++;
                $oeStats[$info['oe']]++;
            }
        }
        arsort($waveStats);
        arsort($bsStats);
        arsort($oeStats);

        // 杀号：排名最后的那个生肖
        $killed = end($ranking);

        // 格式化策略字符串，展示权重，让人知道AI侧重什么
        $wStr = "T:{$bestGene['w_trend']} H:{$bestGene['w_hist']} O:{$bestGene['w_omiss']}";

        return [
            'six_xiao' => $sixXiao,
            'three_xiao' => $threeXiao,
            'color_wave' => ['primary'=>array_key_first($waveStats), 'secondary'=>array_keys($waveStats)[1]],
            'bs' => array_key_first($bsStats),
            'oe' => array_key_first($oeStats),
            'strategy_used' => "V8达尔文进化({$bestGene['fitness']}分) | 杀:{$killed}"
        ];
    }

    public static function verifyPrediction($issue, $specNum) {
        $pdo = Db::connect();
        $stmt = $pdo->prepare("SELECT * FROM prediction_history WHERE issue = ?");
        $stmt->execute([$issue]);
        $record = $stmt->fetch();
        if (!$record) return;

        $info = ZodiacManager::getInfo($specNum);
        $realZodiac = $info['zodiac'];
        $realColor = $info['color'];

        $sixArr = explode(',', $record['six_xiao']);
        $threeArr = explode(',', $record['three_xiao']);
        
        $isHitSix = in_array($realZodiac, $sixArr) ? 1 : 0;
        $isHitThree = in_array($realZodiac, $threeArr) ? 1 : 0;
        $isHitWave = ($realColor == $record['wave_primary'] || $realColor == $record['wave_secondary']) ? 1 : 0;

        $upd = $pdo->prepare("UPDATE prediction_history SET result_zodiac=?, is_hit_six=?, is_hit_three=?, is_hit_wave=? WHERE issue=?");
        $upd->execute([$realZodiac, $isHitSix, $isHitThree, $isHitWave, $issue]);

        if ($isHitSix == 0) {
            $reason = "AI进化方向偏差。实际:{$realZodiac}";
            $log = $pdo->prepare("INSERT INTO learning_logs (issue, error_reason) VALUES (?, ?)");
            $log->execute([$issue, $reason]);
        }
    }
}
?>
