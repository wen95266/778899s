import React, { useEffect, useState } from 'react';
import axios from 'axios';
import dayjs from 'dayjs';
import { RefreshCw, Trophy, History, Sparkles, ChevronRight, BarChart3, Calendar } from 'lucide-react';

// --- 波色逻辑 ---
const getWaveColor = (n) => {
  const red = [1, 2, 7, 8, 12, 13, 18, 19, 23, 24, 29, 30, 34, 35, 40, 45, 46];
  const blue = [3, 4, 9, 10, 14, 15, 20, 25, 26, 31, 36, 37, 41, 42, 47, 48];
  if (red.includes(n)) return 'red';
  if (blue.includes(n)) return 'blue';
  return 'green';
};

// --- 强立体球组件 (内联样式版) ---
const Ball = ({ num, size = 'md', isSpecial = false, delay = 0 }) => {
  const colorType = getWaveColor(num);
  
  // 颜色配置
  const colors = {
    red: 'linear-gradient(135deg, #ff7675 0%, #d63031 100%)',
    blue: 'linear-gradient(135deg, #74b9ff 0%, #0984e3 100%)',
    green: 'linear-gradient(135deg, #55efc4 0%, #00b894 100%)',
  };

  const sizeClass = size === 'lg' ? 'w-11 h-11 text-xl' : 'w-8 h-8 text-xs';
  
  return (
    <div 
      className={`${sizeClass} relative flex items-center justify-center rounded-full font-black text-white select-none opacity-0 animate-pop-up`}
      style={{ 
        // 强制使用内联样式，保证立体效果绝对生效
        background: colors[colorType],
        boxShadow: 'inset -3px -3px 5px rgba(0,0,0,0.3), inset 2px 2px 5px rgba(255,255,255,0.5), 0 5px 10px rgba(0,0,0,0.2)',
        animationDelay: `${delay}ms`,
        border: '1px solid rgba(255,255,255,0.2)'
      }}
    >
      {/* 顶部高光 (反光点) */}
      <div className="absolute top-[15%] left-[20%] w-[35%] h-[20%] bg-white opacity-40 rounded-full blur-[1px]"></div>
      
      <span className="z-10 drop-shadow-md" style={{textShadow: '0 1px 2px rgba(0,0,0,0.3)'}}>
        {String(num).padStart(2, '0')}
      </span>
      
      {/* 特码角标 */}
      {isSpecial && (
        <div className="absolute -top-2 -right-2 bg-yellow-400 text-yellow-900 text-[10px] w-5 h-5 flex items-center justify-center rounded-full shadow-sm font-bold border-2 border-white z-20 animate-bounce">
          特
        </div>
      )}
    </div>
  );
};

// --- 主程序 ---

function App() {
  const [latest, setLatest] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  // ⚠️ 请确认域名正确
  const API_URL = 'https://9526.ip-ddns.com/api';

  const fetchData = async () => {
    setLoading(true);
    try {
      await new Promise(r => setTimeout(r, 400)); // 稍微延迟以展示动画
      const [resLatest, resHistory] = await Promise.all([
        axios.get(`${API_URL}/latest`),
        axios.get(`${API_URL}/history`)
      ]);
      
      if(resLatest.data.success) setLatest(resLatest.data.data);
      if(resHistory.data.success) setHistory(resHistory.data.data);
    } catch (error) {
      console.error("加载失败", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  return (
    <div className="min-h-screen max-w-[500px] mx-auto bg-[#f4f6f8] shadow-2xl relative pb-10">
      
      {/* 顶部导航 */}
      <div className="sticky top-0 z-50 bg-white/80 backdrop-blur-md px-5 py-3 flex justify-between items-center shadow-sm border-b border-gray-100">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-tr from-indigo-600 to-violet-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-indigo-200">
            <Trophy size={20} className="animate-pulse"/>
          </div>
          <div>
            <h1 className="text-xl font-black text-gray-800 tracking-tight">六合宝典</h1>
            <p className="text-[10px] text-gray-400 font-bold tracking-widest uppercase">Live Lottery</p>
          </div>
        </div>
        <button 
          onClick={fetchData} 
          className="w-10 h-10 flex items-center justify-center bg-white text-indigo-600 rounded-full hover:bg-indigo-50 active:scale-90 transition-all shadow-sm border border-gray-100"
        >
          <RefreshCw size={20} className={loading ? 'animate-spin' : ''}/>
        </button>
      </div>

      <main className="p-4 space-y-6">
        
        {/* 1. 最新开奖 (白色玻璃质感卡片) */}
        {latest ? (
          <div className="bg-white rounded-[24px] p-6 shadow-xl shadow-gray-100/50 relative overflow-hidden group border border-white">
             {/* 装饰光斑 */}
            <div className="absolute -top-10 -right-10 w-40 h-40 bg-indigo-50 rounded-full blur-3xl opacity-60"></div>
            
            <div className="flex justify-between items-center mb-6 relative z-10">
              <div>
                <span className="text-xs text-gray-400 font-medium flex items-center gap-1">
                   <Calendar size={12}/> {dayjs(latest.open_date).format('YYYY-MM-DD')}
                </span>
                <span className="text-3xl font-black text-gray-800 tracking-tight">第{latest.issue}期</span>
              </div>
              <div className="bg-emerald-50 px-3 py-1 rounded-full border border-emerald-100">
                <span className="text-xs font-bold text-emerald-600 flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  已开奖
                </span>
              </div>
            </div>

            {/* 号码展示区 */}
            <div className="flex flex-wrap justify-between items-center mb-6 relative z-10 px-1 gap-y-3">
              <div className="flex gap-2">
                {latest.numbers.map((n, i) => (
                  <Ball key={i} num={n} size="lg" delay={i * 100} />
                ))}
              </div>
              <div className="text-gray-300 text-2xl font-light">+</div>
              <Ball num={latest.special_code} size="lg" isSpecial delay={700} />
            </div>

            <div className="bg-slate-50 rounded-xl p-3 flex justify-between items-center relative z-10 border border-slate-100">
              <div className="flex gap-4 text-xs text-gray-500 font-medium">
                <span>特码: <b className="text-gray-900 text-sm">{latest.special_code}</b></span>
                <span>生肖: <b className="text-gray-900 text-sm">{latest.shengxiao}</b></span>
              </div>
              <div className="text-indigo-500 text-xs font-bold flex items-center gap-1 cursor-pointer hover:text-indigo-600">
                查看走势 <ChevronRight size={14} />
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-[24px] p-10 text-center shadow-sm animate-pulse">
            <div className="h-4 bg-gray-200 rounded w-1/3 mx-auto mb-4"></div>
            <div className="flex justify-center gap-2">
               {[...Array(7)].map((_,i) => <div key={i} className="w-10 h-10 bg-gray-200 rounded-full"></div>)}
            </div>
          </div>
        )}

        {/* 2. 预测卡片 (VIP 金色传说 - 强制内联渐变) */}
        {latest && latest.next_prediction && (
          <div className="relative group mt-8">
            {/* 外部辉光 (Gold Glow) */}
            <div className="absolute -inset-1 bg-gradient-to-r from-yellow-400 via-orange-500 to-yellow-400 rounded-3xl blur opacity-25 group-hover:opacity-50 transition duration-1000 animate-pulse-slow"></div>
            
            <div className="relative bg-white rounded-2xl p-5 border border-amber-100 shadow-xl overflow-hidden">
               {/* 流光动画层 */}
               <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-r from-transparent via-white/80 to-transparent -skew-x-12 animate-shimmer pointer-events-none z-20"></div>

               {/* 头部标题 */}
               <div className="flex items-center justify-between mb-5 relative z-10">
                 <div className="flex items-center gap-2">
                   <div className="p-1.5 bg-gradient-to-br from-amber-400 to-orange-600 text-white rounded-lg shadow-md">
                     <Sparkles size={16} fill="currentColor" />
                   </div>
                   <h3 className="font-bold text-gray-800 text-lg">
                     第{parseInt(latest.issue) + 1}期 <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-500 to-orange-600">心水推荐</span>
                   </h3>
                 </div>
                 <div className="px-2 py-0.5 bg-gray-900 text-[#ffd700] text-[10px] font-bold rounded uppercase tracking-wider shadow-sm border border-gray-700">
                   VIP
                 </div>
               </div>

               {/* 预测号码球 (扁平化带金边，与上面开奖球区分) */}
               <div className="flex justify-between px-2 relative z-10">
                 {latest.next_prediction.map((n, i) => (
                    <div key={i} className="flex flex-col items-center gap-1 group/num">
                      <div 
                        className="w-10 h-10 rounded-full flex items-center justify-center text-amber-800 font-black text-lg transition-transform group-hover/num:-translate-y-1"
                        style={{
                          background: 'linear-gradient(to bottom, #fff, #fffbf0)',
                          border: '2px solid #fcd34d', // amber-300
                          boxShadow: '0 4px 6px -1px rgba(251, 191, 36, 0.2), 0 2px 4px -1px rgba(251, 191, 36, 0.1)'
                        }}
                      >
                        {String(n).padStart(2, '0')}
                      </div>
                    </div>
                 ))}
               </div>
               
               <div className="mt-4 pt-3 border-t border-amber-50 flex justify-center text-amber-800/60 text-[10px]">
                 <p className="flex items-center gap-1">
                   <BarChart3 size={12}/> 基于 AI 大数据算法分析 · 仅供参考
                 </p>
               </div>
            </div>
          </div>
        )}

        {/* 3. 历史记录 (列表模式) */}
        <div className="bg-white rounded-[24px] shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-50 flex items-center gap-2 bg-gray-50/50">
            <History size={18} className="text-indigo-500"/> 
            <span className="font-bold text-gray-700 text-sm">往期回顾</span>
          </div>
          <div className="divide-y divide-gray-50">
            {history.map((item) => (
              <div key={item.issue} className="px-5 py-3 hover:bg-gray-50 transition-colors flex items-center justify-between">
                <div>
                  <div className="text-sm font-bold text-gray-700">第 {item.issue} 期</div>
                  <div className="text-[10px] text-gray-400">{dayjs(item.open_date).format('MM-DD')}</div>
                </div>
                
                <div className="flex gap-1 overflow-x-auto no-scrollbar pl-2 py-1">
                  {item.numbers.map((n, i) => {
                    const c = getWaveColor(n);
                    const bg = c === 'red' ? '#ff7675' : c === 'blue' ? '#74b9ff' : '#55efc4';
                    return (
                      <div key={i} className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] text-white font-medium min-w-[24px]" style={{backgroundColor: bg}}>
                         {n}
                      </div>
                    )
                  })}
                  <div className="w-[1px] h-6 bg-gray-200 mx-1"></div>
                  <div 
                    className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] text-white font-bold min-w-[24px]"
                    style={{backgroundColor: getWaveColor(item.special_code) === 'red' ? '#ff7675' : getWaveColor(item.special_code) === 'blue' ? '#74b9ff' : '#55efc4'}}
                  >
                    {item.special_code}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

      </main>
    </div>
  );
}

export default App;