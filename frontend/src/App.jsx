import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Ball from './components/Ball';

// --- 组件定义 ---
const Gauge = ({ val }) => {
  const color = val > 75 ? '#34d399' : val > 40 ? '#fbbf24' : '#f87171';
  return (
    <div className="flex flex-col items-center">
      <div className="relative w-16 h-16 flex items-center justify-center">
        <svg className="w-full h-full transform -rotate-90">
          <circle cx="32" cy="32" r="28" stroke="#334155" strokeWidth="4" fill="none" />
          <circle cx="32" cy="32" r="28" stroke={color} strokeWidth="4" fill="none" strokeDasharray={175} strokeDashoffset={175 - (val/100)*175} strokeLinecap="round" className="transition-all duration-1000" />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center flex-col">
          <span className="text-sm font-bold text-white">{val}<span className="text-[10px]">%</span></span>
        </div>
      </div>
      <span className="text-[10px] text-gray-400 mt-1">AI信心</span>
    </div>
  );
};

const TrendLine = ({ history }) => {
  if (!history || history.length < 10) return null;
  const data = history.slice(0, 15).reverse().map(h => h.spec.num % 10);
  const points = data.map((v, i) => `${i * 6},${25 - v * 2.5}`).join(' ');
  return (
    <div className="flex flex-col justify-end h-16 w-24">
        <svg className="w-full h-full overflow-visible" viewBox="0 0 90 25">
            <polyline fill="none" stroke="#60a5fa" strokeWidth="2" points={points} />
            <circle cx={(data.length-1)*6} cy={25 - data[data.length-1]*2.5} r="3" fill="#fff" stroke="#60a5fa" strokeWidth="2" />
        </svg>
        <div className="text-[8px] text-gray-500 text-center mt-1 tracking-wider">尾数走势</div>
    </div>
  );
};

function App() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [limit, setLimit] = useState(50);
  const [expanding, setExpanding] = useState(false);

  const fetchData = async (currentLimit) => {
    try {
      const t = Date.now();
      const res = await fetch(`${import.meta.env.VITE_API_URL}?action=get_data&limit=${currentLimit}&_t=${t}`);
      const json = await res.json();
      if (json.status === 'success') setData(json.data);
    } catch (error) { console.error(error); } finally { setLoading(false); setExpanding(false); }
  };

  useEffect(() => { fetchData(limit); }, [limit]);

  const handleLoadMore = () => { setExpanding(true); setLimit(limit + 50); };

  if (loading && limit === 50) return <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-400">正在连接 AI 神经元...</div>;
  if (!data) return <div className="p-10 text-center text-gray-500">暂无数据</div>;

  const latestDraw = data.history[0];
  const historyList = data.history.slice(1);
  const hasMore = historyList.length < (data.total_count - 1);

  const pred = data.prediction || {};
  const isPub = !!data.prediction;
  const threeXiao = pred.three_xiao || ['?', '?', '?'];
  const sixXiao = pred.six_xiao || [];
  
  let w1 = 'red', w2 = 'blue';
  if (pred.color_wave) { w1 = pred.color_wave.primary; w2 = pred.color_wave.secondary; }
  
  const bs = pred.bs || '-'; 
  const oe = pred.oe || '-';
  const conf = pred.confidence || 0;

  let killed = '-';
  if (pred.strategy_used) { const m = pred.strategy_used.match(/杀[:：](.+)/); if(m) killed = m[1]; } 
  else if (pred.killed) killed = pred.killed;

  const waveMap = { red: '红波', blue: '蓝波', green: '绿波' };
  // 颜色映射：from-xxx to-xxx
  const waveColors = { 
      red: 'from-red-500 to-red-700', 
      blue: 'from-blue-500 to-blue-700', 
      green: 'from-emerald-500 to-emerald-700' 
  };
  // 防守波色颜色：稍微淡一点
  const waveColorsLight = {
      red: 'from-red-400/80 to-red-600/80',
      blue: 'from-blue-400/80 to-blue-600/80',
      green: 'from-emerald-400/80 to-emerald-600/80'
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans pb-12">
      
      <header className="bg-white/80 backdrop-blur-md sticky top-0 z-50 border-b border-slate-200">
        <div className="max-w-xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-bold text-sm shadow-lg shadow-indigo-200">AI</div>
            <h1 className="text-lg font-extrabold text-slate-800 tracking-tight">六合大脑</h1>
          </div>
          <Link to="/history" className="text-xs font-semibold text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-full hover:bg-indigo-100 transition-colors">
            历史战绩 &rarr;
          </Link>
        </div>
      </header>

      <div className="max-w-xl mx-auto px-3 pt-4 space-y-5">

        <div className="relative rounded-2xl overflow-hidden shadow-2xl shadow-slate-300">
          <div className="absolute inset-0 bg-slate-900">
            <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-600 rounded-full mix-blend-multiply filter blur-[80px] opacity-20 animate-pulse"></div>
            <div className="absolute bottom-0 left-0 w-64 h-64 bg-blue-600 rounded-full mix-blend-multiply filter blur-[80px] opacity-20"></div>
          </div>

          <div className="relative p-5 text-white">
            <div className="flex justify-between items-start mb-6">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 text-[10px] font-bold uppercase border border-indigo-500/30">Next Draw</span>
                  {!isPub && <span className="flex h-2 w-2 relative"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span><span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span></span>}
                </div>
                <div className="text-3xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-white to-slate-400">
                  第 {data.next_issue} 期
                </div>
              </div>
              <Gauge val={conf} />
            </div>

            <div className={`transition-all duration-500 ${isPub ? 'opacity-100 filter-none' : 'opacity-40 blur-sm pointer-events-none'}`}>
              
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="col-span-2 bg-white/5 rounded-xl p-3 border border-white/10 backdrop-blur-sm">
                  <div className="text-[10px] text-gray-400 mb-2 flex items-center gap-1">🔥 核心三肖 <span className="w-full h-px bg-white/10"></span></div>
                  <div className="flex justify-between items-center">
                    {threeXiao.map((z,i) => (
                      <div key={i} className="w-10 h-10 flex items-center justify-center bg-gradient-to-b from-amber-300 to-yellow-600 rounded-full shadow-lg shadow-yellow-900/50 font-bold text-lg text-white border border-yellow-200/50">{z}</div>
                    ))}
                  </div>
                </div>
                
                <div className={`rounded-xl p-3 border border-white/10 flex flex-col justify-center items-center bg-gradient-to-br ${waveColors[w1]}`}>
                  <span className="text-[10px] text-white/80 mb-1">主攻</span>
                  <span className="text-xl font-black tracking-widest">{waveMap[w1]}</span>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-2 text-center">
                {/* 【核心修改】防守波色现在也有背景色了 */}
                <div className={`rounded-lg p-2 border border-white/10 bg-gradient-to-br ${waveColorsLight[w2]}`}>
                  <div className="text-[9px] text-white/70">防守</div>
                  <div className="text-sm font-bold text-white">{waveMap[w2]}</div>
                </div>
                
                <div className="bg-white/5 rounded-lg p-2 border border-white/5">
                  <div className="text-[9px] text-gray-400">大小</div>
                  <div className="text-sm font-bold text-yellow-400">{bs}</div>
                </div>
                <div className="bg-white/5 rounded-lg p-2 border border-white/5">
                  <div className="text-[9px] text-gray-400">单双</div>
                  <div className="text-sm font-bold text-cyan-400">{oe}</div>
                </div>
                <div className="bg-white/5 rounded-lg p-2 border border-white/5 relative overflow-hidden">
                  <div className="absolute inset-0 bg-red-500/10"></div>
                  <div className="text-[9px] text-red-300">绝杀</div>
                  <div className="text-sm font-bold text-red-400">{killed}</div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-white/10 flex justify-between items-end">
                <div>
                  <div className="text-[9px] text-gray-500 mb-1">防守六肖</div>
                  <div className="flex gap-1.5">
                    {sixXiao.slice(3).map((z,i) => <span key={i} className="text-xs font-mono text-slate-300 bg-white/10 px-1.5 py-0.5 rounded">{z}</span>)}
                  </div>
                </div>
                <div className="opacity-50 scale-75 origin-bottom-right">
                   <TrendLine history={data.history} />
                </div>
              </div>

            </div>

            {!isPub && (
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center">
                <div className="bg-slate-800/90 backdrop-blur-md px-6 py-3 rounded-full border border-indigo-500/30 shadow-2xl flex items-center gap-3">
                  <span className="flex h-3 w-3 relative">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-indigo-500"></span>
                  </span>
                  <span className="text-sm font-bold text-indigo-100">AI 深度运算中...</span>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200/60 overflow-hidden">
          <div className="bg-slate-50 px-4 py-2 border-b border-slate-100 flex justify-between items-center">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Latest Result</span>
            <span className="text-[10px] text-slate-400">{latestDraw.created_at?.substring(0,16)}</span>
          </div>
          <div className="p-5 flex flex-col items-center">
            <div className="flex justify-center flex-wrap gap-3 mb-5 w-full">
              {latestDraw.normals.map((b,i) => <Ball key={i} num={b.num} color={b.color} zodiac={b.zodiac} size="lg"/>)}
            </div>
            <div className="relative w-full flex items-center justify-center gap-4">
               <div className="h-px bg-slate-200 flex-1"></div><span className="text-slate-300 text-xl font-thin">+</span><div className="h-px bg-slate-200 flex-1"></div>
            </div>
            <div className="mt-4">
               <Ball num={latestDraw.spec.num} color={latestDraw.spec.color} zodiac={latestDraw.spec.zodiac} size="xl" isSpec={true}/>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <h3 className="text-sm font-bold text-slate-700 px-2 flex items-center gap-2">
            <span className="w-1 h-4 bg-indigo-500 rounded-full"></span> 往期走势
          </h3>
          {historyList.map((item) => (
            <div key={item.id} className="bg-white rounded-xl p-3 shadow-sm border border-slate-100 flex flex-col gap-3">
              <div className="flex justify-between items-center">
                 <span className="font-mono font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded text-sm">#{item.issue}</span>
                 <div className="flex gap-2 text-[10px] text-slate-400">
                    <span>{item.spec.bs}</span><span>{item.spec.oe}</span><span>{item.spec.element}</span>
                 </div>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex gap-1 overflow-x-auto no-scrollbar w-full mr-2 pb-1">
                  {item.normals.map((b,i) => <Ball key={i} num={b.num} color={b.color} zodiac={b.zodiac} size="sm"/>)}
                </div>
                <div className="w-px h-8 bg-slate-100 mx-1 flex-shrink-0"></div>
                <div className="flex-shrink-0">
                  <Ball num={item.spec.num} color={item.spec.color} zodiac={item.spec.zodiac} size="md" isSpec={true}/>
                </div>
              </div>
            </div>
          ))}
          <button onClick={handleLoadMore} disabled={expanding || !hasMore} className="w-full py-3 text-sm font-medium text-slate-500 bg-white rounded-xl shadow-sm border border-slate-200 hover:bg-slate-50 transition-colors disabled:opacity-50">{expanding ? '加载中...' : hasMore ? '⬇️ 查看更多历史' : '已显示全部数据'}</button>
        </div>
      </div>
    </div>
  );
}

export default App;