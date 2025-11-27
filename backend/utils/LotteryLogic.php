<?php
require_once 'ZodiacManager.php';
require_once 'Db.php';

class LotteryLogic {
    
    private static function getFullAttr($num) { return ZodiacManager::getInfo($num); }
    private static function initScoreBoard() { $z = ZodiacManager::getMapping(); return array_fill_keys(array_keys($z), 0); }
    private static function normalize(&$s) { $m=max($s); if($m>0) foreach($s as $k=>$v) $s[$k]=($v/$m)*100; }

    // --- Models (M1-M10) ---
    private static function m_Trend($h) {
        $s = self::initScoreBoard(); $l = min(count($h),30);
        for($i=0;$i<$l;$i++) { $z=ZodiacManager::getInfo($h[$i]['spec'])['zodiac']; $s[$z]+=($i<10?3:1); }
        self::normalize($s); return $s;
    }
    private static function m_Omission($h) {
        $s = self::initScoreBoard(); 
        foreach(array_keys($s) as $z) {
            $c=0; foreach($h as $r) { if(ZodiacManager::getInfo($r['spec'])['zodiac']==$z) break; $c++; }
            $s[$z]+=floor($c/10)*10;
        }
        self::normalize($s); return $s;
    }
    private static function m_Link($h) {
        $s = self::initScoreBoard(); if($h){ $z=ZodiacManager::getInfo($h[0]['spec'])['zodiac']; 
        foreach(ZodiacManager::getRelatedZodiacs($z) as $r) $s[$r]+=10; } self::normalize($s); return $s;
    }
    private static function m_Tail($h) {
        $s = self::initScoreBoard(); $c=array_fill(0,10,0);
        for($i=0;$i<min(count($h),10);$i++) $c[intval($h[$i]['spec'])%10]++;
        arsort($c); $hot=array_slice(array_keys($c),0,3);
        $map=ZodiacManager::getMapping(); foreach($s as $z=>$v) foreach($map[$z] as $n) if(in_array($n%10,$hot)) $s[$z]+=10;
        self::normalize($s); return $s;
    }
    private static function m_Head($h) {
        $s = self::initScoreBoard(); $c=array_fill(0,5,0);
        for($i=0;$i<min(count($h),20);$i++) $c[floor(intval($h[$i]['spec'])/10)]++;
        arsort($c); $hot=array_key_first($c);
        $map=ZodiacManager::getMapping(); foreach($s as $z=>$v) foreach($map[$z] as $n) if(floor($n/10)==$hot) $s[$z]+=20;
        self::normalize($s); return $s;
    }
    private static function m_Color($h) {
        $s = self::initScoreBoard(); $c=['red'=>0,'blue'=>0,'green'=>0];
        for($i=0;$i<min(count($h),30);$i++) $c[ZodiacManager::getInfo($h[$i]['spec'])['color']]++;
        asort($c); $weak=array_key_first($c);
        $map=ZodiacManager::getMapping(); foreach($s as $z=>$v) foreach($map[$z] as $n) if(ZodiacManager::getInfo($n)['color']==$weak) $s[$z]+=15;
        self::normalize($s); return $s;
    }
    private static function m_WuXing($h) {
        $s = self::initScoreBoard(); if($h){ $l=ZodiacManager::getInfo($h[0]['spec'])['element']; 
        $g=['金'=>'水','水'=>'木','木'=>'火','火'=>'土','土'=>'金']; $t=$g[$l]??'';
        $map=ZodiacManager::getMapping(); foreach($s as $z=>$v) foreach($map[$z] as $n) if(ZodiacManager::getInfo($n)['element']==$t){$s[$z]+=10;break;} }
        self::normalize($s); return $s;
    }
    private static function m_History($h) {
        $s = self::initScoreBoard(); if(count($h)<20) return $s;
        $cur=self::getFullAttr($h[0]['spec']);
        for($i=2;$i<count($h);$i++) {
            $pst=self::getFullAttr($h[$i]['spec']); $sim=0;
            if($cur['zodiac']==$pst['zodiac']) $sim+=30;
            if($cur['color']==$pst['color']) $sim+=20;
            if($sim>=50) { $nz=ZodiacManager::getInfo($h[$i-1]['spec'])['zodiac']; $s[$nz]+=$sim; }
        }
        self::normalize($s); return $s;
    }
    private static function m_FlatCode($h) {
        $s = self::initScoreBoard(); if($h) { for($i=1;$i<=6;$i++) { $z=ZodiacManager::getInfo($h[0]["n$i"])['zodiac']; $s[$z]+=15; } }
        self::normalize($s); return $s;
    }
    private static function m_Offset($h) {
        $s = self::initScoreBoard(); if($h) { $l=intval($h[0]['spec']); $off=[1,-1,10,-10,12,-12];
        foreach($off as $o) { $t=$l+$o; if($t>49)$t-=49; if($t<1)$t+=49; $z=ZodiacManager::getInfo($t)['zodiac']; $s[$z]+=20; } }
        self::normalize($s); return $s;
    }

    // --- 遗传算法 ---
    private static function createGene() {
        return ['w_trend'=>rand(0,100)/10, 'w_omiss'=>rand(0,100)/10, 'w_link'=>rand(0,100)/10, 'w_tail'=>rand(0,100)/10, 
                'w_head'=>rand(0,100)/10, 'w_color'=>rand(0,100)/10, 'w_wuxing'=>rand(0,100)/10, 'w_hist'=>rand(0,100)/10, 
                'w_flat'=>rand(0,100)/10, 'w_off'=>rand(0,100)/10, 'fitness'=>0];
    }

    private static function runPrediction($history, $gene) {
        $f = self::initScoreBoard();
        $ms = [self::m_Trend($history), self::m_Omission($history), self::m_Link($history), self::m_Tail($history),
               self::m_Head($history), self::m_Color($history), self::m_WuXing($history), self::m_History($history),
               self::m_FlatCode($history), self::m_Offset($history)];
        $ws = [$gene['w_trend'], $gene['w_omiss'], $gene['w_link'], $gene['w_tail'], $gene['w_head'],
               $gene['w_color'], $gene['w_wuxing'], $gene['w_hist'], $gene['w_flat'], $gene['w_off']];
        foreach($f as $z=>$v) for($i=0;$i<10;$i++) $f[$z] += $ms[$i][$z] * $ws[$i];
        arsort($f); return array_keys($f);
    }

    public static function evolveStep($history, $population) {
        $TEST_RANGE = 80;
        $modelCache = [];
        for ($t=0; $t<$TEST_RANGE; $t++) {
            $mockH = array_slice($history, $t+1);
            if(count($mockH)<50) break;
            $modelCache[$t] = [
                'res' => ZodiacManager::getInfo($history[$t]['spec'])['zodiac'],
                'ms'  => [
                    self::m_Trend($mockH), self::m_Omission($mockH), self::m_Link($mockH), self::m_Tail($mockH),
                    self::m_Head($mockH), self::m_Color($mockH), self::m_WuXing($mockH), self::m_History($mockH),
                    self::m_FlatCode($mockH), self::m_Offset($mockH)
                ]
            ];
        }

        foreach ($population as &$gene) {
            $score = 0;
            $ws = [$gene['w_trend'], $gene['w_omiss'], $gene['w_link'], $gene['w_tail'], $gene['w_head'],
                   $gene['w_color'], $gene['w_wuxing'], $gene['w_hist'], $gene['w_flat'], $gene['w_off']];
            
            foreach ($modelCache as $data) {
                $f = self::initScoreBoard();
                foreach($f as $z=>$v) for($i=0;$i<10;$i++) $f[$z] += $data['ms'][$i][$z] * $ws[$i];
                arsort($f); $rank = array_keys($f);
                if(in_array($data['res'], array_slice($rank,0,6))) $score+=10;
                if(in_array($data['res'], array_slice($rank,0,3))) $score+=30;
            }
            $gene['fitness'] = $score;
        }
        unset($gene);
        usort($population, function($a,$b){return $b['fitness']-$a['fitness'];});
        $bestGene = $population[0];
        
        $size = count($population); $elite = intval($size/2); $newPop = array_slice($population, 0, $elite);
        while(count($newPop) < $size) {
            $p1 = $population[rand(0,$elite-1)]; $p2 = $population[rand(0,$elite-1)]; $child = $p1;
            if(rand(0,100)<30) { 
                $keys=['w_trend','w_omiss','w_link','w_tail','w_wuxing','w_hist'];
                $child[$keys[array_rand($keys)]] = rand(0,100)/10;
            }
            $newPop[] = $child;
        }
        return ['population'=>$newPop, 'best'=>$bestGene];
    }

    private static function predict_BS_OE($history) {
        $bs=['大'=>0,'小'=>0]; $oe=['单'=>0,'双'=>0];
        for($i=0;$i<min(count($history),20);$i++) { $info=ZodiacManager::getInfo($history[$i]['spec']); $bs[$info['bs']]++; $oe[$info['oe']]++; }
        asort($bs); asort($oe);
        return ['bs'=>array_key_first($bs), 'oe'=>array_key_first($oe)];
    }

    public static function generateResult($history, $bestGene, $genCount) {
        $ranking = self::runPrediction($history, $bestGene);
        $six = array_slice($ranking, 0, 6);
        $three = array_slice($ranking, 0, 3);
        
        $map = ZodiacManager::getMapping();
        $wc = ['red'=>0, 'blue'=>0, 'green'=>0];
        foreach($three as $z) foreach($map[$z] as $n) { $i=ZodiacManager::getInfo($n); $w=($i['element']=='金'||$i['element']=='水')?1.5:1; $wc[$i['color']]+=$w; }
        arsort($wc); $w=array_keys($wc);
        $bsoe = self::predict_BS_OE($history);
        $killed=end($ranking);

        // 计算信心指数 (Max score based on test range 80)
        // 理想最高分 80 * (10+30) = 3200 (实际很难达到)
        // 我们认为 1500 分以上就是非常高了
        $confidence = min(100, round(($bestGene['fitness'] / 1500) * 100));

        return [
            'killed' => $killed,
            'six_xiao' => $six, 
            'three_xiao' => $three,
            'color_wave' => ['primary'=>$w[0], 'secondary'=>$w[1]],
            'bs' => $bsoe['bs'], 
            'oe' => $bsoe['oe'],
            'confidence' => $confidence, // 新增信心指数
            'strategy_used' => "进化{$genCount}代(F:{$bestGene['fitness']}) | 杀:{$killed}"
        ];
    }
    
    public static function verifyPrediction($issue, $specNum) {
        $pdo = Db::connect();
        $stmt = $pdo->prepare("SELECT * FROM prediction_history WHERE issue = ?");
        $stmt->execute([$issue]);
        $rec = $stmt->fetch();
        if (!$rec) return;

        $info = ZodiacManager::getInfo($specNum);
        $rz = $info['zodiac']; $rc = $info['color'];
        $six = explode(',', $rec['six_xiao']); $thr = explode(',', $rec['three_xiao']);
        
        $h6 = in_array($rz, $six)?1:0; $h3 = in_array($rz, $thr)?1:0;
        $hw = ($rc==$rec['wave_primary']||$rc==$rec['wave_secondary'])?1:0;

        $upd = $pdo->prepare("UPDATE prediction_history SET result_zodiac=?, is_hit_six=?, is_hit_three=?, is_hit_wave=? WHERE issue=?");
        $upd->execute([$rz, $h6, $h3, $hw, $issue]);
    }
}
?>