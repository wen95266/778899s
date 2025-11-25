<?php
require_once 'Db.php';
require_once 'Settings.php';

class ZodiacManager {
    // 波色数据
    public static $colors = [
        'red'   => [1,2,7,8,12,13,18,19,23,24,29,30,34,35,40,45,46],
        'blue'  => [3,4,9,10,14,15,20,25,26,31,36,37,41,42,47,48],
        'green' => [5,6,11,16,17,21,22,27,28,32,33,38,39,43,44,49]
    ];

    // 五行数据
    public static $elements = [
        '金' => [3,4,11,12,25,26,33,34,41,42],
        '木' => [7,8,15,16,23,24,37,38,45,46],
        '水' => [13,14,21,22,29,30,43,44],
        '火' => [1,2,9,10,17,18,31,32,39,40,47,48],
        '土' => [5,6,19,20,27,28,35,36,49]
    ];

    // 属性分类
    public static $attributes = [
        '家禽' => ['牛','马','羊','鸡','狗','猪'],
        '野兽' => ['鼠','虎','兔','龙','蛇','猴'],
        '天肖' => ['龙','兔','牛','马','猴','猪'],
        '地肖' => ['鼠','虎','蛇','羊','鸡','狗'],
        '阴肖' => ['鼠','龙','蛇','马','狗','猪'],
        '阳肖' => ['牛','虎','兔','羊','猴','鸡'],
        '吉肖' => ['兔','龙','蛇','马','羊','鸡'],
        '凶肖' => ['鼠','牛','虎','猴','狗','猪']
    ];

    // 生肖关系
    public static $relations = [
        '鼠'=>['三合'=>['龙','猴'], '六合'=>['牛']], '牛'=>['三合'=>['蛇','鸡'], '六合'=>['鼠']],
        '虎'=>['三合'=>['马','狗'], '六合'=>['猪']], '兔'=>['三合'=>['猪','羊'], '六合'=>['狗']],
        '龙'=>['三合'=>['鼠','猴'], '六合'=>['鸡']], '蛇'=>['三合'=>['鸡','牛'], '六合'=>['猴']],
        '马'=>['三合'=>['虎','狗'], '六合'=>['羊']], '羊'=>['三合'=>['兔','猪'], '六合'=>['马']],
        '猴'=>['三合'=>['鼠','龙'], '六合'=>['蛇']], '鸡'=>['三合'=>['蛇','牛'], '六合'=>['龙']],
        '狗'=>['三合'=>['虎','马'], '六合'=>['兔']], '猪'=>['三合'=>['兔','羊'], '六合'=>['虎']]
    ];

    public static function getMapping() {
        $json = Settings::get('zodiac_config');
        if ($json) return json_decode($json, true);
        return [
            '蛇'=>[1,13,25,37,49], '龙'=>[2,14,26,38], '兔'=>[3,15,27,39], '虎'=>[4,16,28,40],
            '牛'=>[5,17,29,41], '鼠'=>[6,18,30,42], '猪'=>[7,19,31,43], '狗'=>[8,20,32,44],
            '鸡'=>[9,21,33,45], '猴'=>[10,22,34,46], '羊'=>[11,23,35,47], '马'=>[12,24,36,48]
        ];
    }

    public static function getAttr($zodiac) {
        $res = [];
        foreach (self::$attributes as $key => $zodiacs) {
            if (in_array($zodiac, $zodiacs)) {
                if (in_array($key, ['家禽','野兽'])) $res['jy'] = $key;
                if (in_array($key, ['天肖','地肖'])) $res['td'] = $key;
                if (in_array($key, ['阴肖','阳肖'])) $res['yy'] = $key;
                if (in_array($key, ['吉肖','凶肖'])) $res['jx'] = $key;
            }
        }
        return $res;
    }

    public static function getInfo($num) {
        $num = intval($num);
        $zodiacMap = self::getMapping();
        $myZodiac = ''; foreach($zodiacMap as $z=>$ns) if(in_array($num, $ns)){$myZodiac=$z; break;}
        $myColor = ''; foreach(self::$colors as $c=>$ns) if(in_array($num, $ns)){$myColor=$c; break;}
        $myElem = ''; foreach(self::$elements as $e=>$ns) if(in_array($num, $ns)){$myElem=$e; break;}
        
        $attrs = self::getAttr($myZodiac);

        return array_merge([
            'num' => $num, 
            'zodiac' => $myZodiac, 
            'color' => $myColor, 
            'element' => $myElem,
            'bs' => ($num >= 25) ? '大' : '小', // 49也是大
            'oe' => ($num % 2 != 0) ? '单' : '双'
        ], $attrs);
    }
    
    public static function getRelatedZodiacs($zodiac) {
        return isset(self::$relations[$zodiac]) ? array_merge(self::$relations[$zodiac]['三合'], self::$relations[$zodiac]['六合']) : [];
    }
}
?>
