import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Ball from './components/Ball';

// --- 可视化组件 ---

// 1. AI 信心仪表盘 (SVG 实现)
const Gauge = ({ val }) => {
  const r = 40;
  const c = 50;
  const circumference = Math.PI * r; // 半圆周长
  const offset = ((100 - val) / 100) * circumference;
  const color = val > 70 ? '#10b981' : val > 40 ? '#f59e0b' : '#ef4444'; // 绿/黄/红

  return (
    <div className="relative w-24 h-16 flex flex-col items-center overflow-hidden">
      {/* 底色轨道 */}
      <svg className="w-full h-24" viewBox="0 0 100 50">
        <path d="M10,50 A40,40 0 0,1 90,50" fill="none" stroke="#e5e7eb" strokeWidth="10" />
        {/* 进度条 */}
        <path 
          d="M10,50 A40,40 0 0,1 90,50" 
          fill="none" 
          stroke={color} 
          strokeWidth="10" 
          strokeDasharray={circumference} 
          strokeDashoffset={offset} 
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute bottom-0 text-lg font-bold" style={{ color }}>{val}%</div>
      <div className="text-[10px] text-gray-400 absolute top-0 right-0">信心</div>
    </div>
  );
};

// 2. 迷你走势图 (SVG 实现 - 显示最近10期特码尾数)
const MiniChart = ({ history }) => {
  if (!history || history.length < 2) return null;
  
  // 取最近10期
  const data = history.slice(0, 10).reverse().map(h => h.spec.num % 10);
  
  // 生成折线路径 points="x,y x,y..."
  // 画布宽90 高30。x步长10，y根据数值0-9映射到30-0
  const points = data.map((val, i) => `${i * 10},${30 - val * 3}`).join(' ');

  return (
    <div className="w-24 h-16 border-l border-b border-gray-200 p-1 flex flex-col justify-end relative">
      <svg className="w-full h-full overflow-visible" viewBox="0 0 90 30">
        <polyline fill="none" stroke="#3b82f6" strokeWidth="2" points={points} />
        {/* 终点圆点 */}
        <circle cx={(data.length-1)*10} cy={30 - data[data.length-1]*3} r="2" fill="#3b82f6" />
      </svg>
      <div className="text-[8px] text-gray-400 text-center mt-1">尾数走势</div>
    </div>
  );
};

// --- 主应用组件 ---

function App() {
  const [data, setData] = useState(null);
  const [predHistory, setPredHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [limit, setLimit] = useState(50);
  const [expanding, setExpanding] = useState(false);

  const fetchData = async (currentLimit) => {
    try {
      const t = new Date().getTime();
      const res = await fetch(`${import.meta.env.VITE_API_URL}?action=get_data&limit=${currentLimit}&_t=${t}`);
      const json = await res.json();
      if (json.status === 'success') setData(json.data);
      
      const resHist = await fetch(`${import.meta.env.VITE_API_URL}?action=get_history&limit=5&_t=${t}`);
      const jsonHist = await resHist.json();
      if (jsonHist.status === 'success') setPredHistory(jsonHist.data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
      setExpanding(false);
    }
  };

  useEffect(() => { fetchData(limit); }, [limit]);

  const handleLoadMore = () => {
    setExpanding(true);
    setLimit(limit + 50);
  };

  if (loading && limit === 50) return <div className="h-screen flex items-center justify-center text-gray-400 bg-gray-50">正在连接 AI 引擎...</div>;
  if (!data || !data.history || data.history.length === 0) return <div className="p-10 text-center text-gray-500">暂无历史数据</div>;

  const latestDraw = data.history[0];
  const historyList = data.history.slice(1);
  const totalInDb = data.total_count || historyList.length;
  const hasMore = historyList.length < (totalInDb - 1); 

  const pred = data.prediction || {};
  const isPublished = !!data.prediction;

  const sixXiao = pred.six_xiao || Array(6).fill('?');
  const threeXiao = pred.three_xiao || Array(3).fill('?');
  const bs = pred.bs || '-'; 
  const oe = pred.oe || '-';
  const confidence = pred.confidence || 0; // 信心指数

  let w1 = 'red', w2 = 'blue';
  if (pred.color_wave) { w1 = pred.color_wave.primary; w2 = pred.color_wave.secondary; }

  let killedZodiac = '-';
  if (pred.strategy_used) {
      const match = pred.strategy_used.match(/杀[:：](.+)/);
      if (match) killedZodiac = match[1];
  } else if (pred.killed) {
      killedZodiac = pred.killed;
  }

  const waveStyles = {
    red: 'bg-red-600 border-red-500 text-white',
    blue: 'bg-blue-600 border-blue-500 text-white',
    green: 'bg-emerald-600 border-emerald-500 text-white'
  };
  const waveNames = { red: '红', blue: '蓝', green: '绿' };
  const waveTextStyles = { red: 'text-red-500', blue: 'text-blue-500', green: 'text-emerald-500' };

  return (
    <div className="min-h-screen bg-gray-100 font-sans pb-10">
      
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50 shadow-sm">
        <div className="max-w-2xl mx-auto px-4 h-12 flex items-center justify-between">
          <h1 className="text-lg font-bold text-gray-800 tracking-tight">六合AI分析</h1>
          <Link to="/history" className="text-xs font-medium text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-full hover:bg-indigo-100 transition-colors flex items-center gap-1">
            <span>📋 战绩记录</span>
          </Link>
        </div>
      </header>

      <div className="bg-slate-900 text-white shadow-xl relative overflow-hidden">
        <div className="max-w-2xl mx-auto px-4 py-5 relative z-10">
          <div className="flex justify-between items-center mb-4">
             <div>
               <div className="text-[10px] text-indigo-300 uppercase tracking-widest">Next Prediction</div>
               <div className="text-2xl font-bold text-white">第 {data.next_issue} 期</div>
             </div>
             <div className="text-right">
                <div className="text-[10px] text-gray-400">绝杀</div>
                <div className="text-xs bg-red-600 px-2 py-0.5 rounded text-white font-bold">
                  {isPublished ? killedZodiac : '计算中'}
                </div>
             </div>
          </div>
          
          <div className={`transition-opacity duration-500 ${isPublished ? 'opacity-100' : 'opacity-50 blur-sm'}`}>
              
              <div className="mb-4">
                <div className="flex items-center gap-2 mb-2"><span className="text-xs font-bold text-yellow-400">🔥 核心三肖</span></div>
                <div className="grid grid-cols-3 gap-3">
                  {threeXiao.map((z, i) => (
                    <div key={i} className="h-10 flex items-center justify-center bg-gradient-to-br from-yellow-600 to-yellow-800 rounded-lg text-lg font-bold text-white shadow-lg border border-yellow-500/50">{z}</div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-4">
                 <div className={`rounded-lg p-2 border flex flex-col items-center justify-center relative overflow-hidden ${waveStyles[w1]}`}>
                    <div className="absolute top-0 left-0 bg-white/20 text-[8px] px-1 rounded-br">主攻</div>
                    <div className="font-bold text-lg leading-none">{waveNames[w1]}波</div>
                    <div className="text-[10px] opacity-80 mt-1">防: {waveNames[w2]}</div>
                 </div>
                 <div className="bg-slate-800/60 rounded-lg p-2 border border-slate-700 flex flex-col justify-between">
                    <div className="flex justify-between items-center border-b border-slate-600/50 pb-1">
                       <span className="text-[10px] text-gray-400">推荐大小</span>
                       <span className="font-bold text-yellow-400">{bs}</span>
                    </div>
                    <div className="flex justify-between items-center pt-1">
                       <span className="text-[10px] text-gray-400">推荐单双</span>
                       <span className="font-bold text-cyan-400">{oe}</span>
                    </div>
                 </div>
              </div>

              <div className="flex items-center gap-2 opacity-60">
                 <span className="text-xs">防守:</span>
                 <div className="flex gap-1">{sixXiao.slice(3).map((z, i) => <span key={i} className="text-xs font-mono bg-white/10 px-1.5 rounded">{z}</span>)}</div>
              </div>
          </div>

          {!isPublished && (
              <div className="absolute inset-0 flex items-center justify-center z-20 bg-slate-900/60 backdrop-blur-sm">
                  <div className="bg-slate-800 px-4 py-2 rounded-full border border-slate-600 shadow-xl flex items-center gap-2">
                      <span className="animate-pulse text-green-400">●</span>
                      <span className="text-sm font-bold">AI 正在深度计算中...</span>
                  </div>
              </div>
          )}

        </div>
      </div>

      <div className="max-w-2xl mx-auto space-y-4 pt-4 px-3">
        
        {/* === 可视化仪表盘 (新) === */}
        {isPublished && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3 flex justify-around items-center">
                <Gauge val={confidence} />
                <div className="w-px h-12 bg-gray-100"></div>
                <MiniChart history={data.history} />
            </div>
        )}

        {/* === 战绩概览 === */}
        {predHistory.length > 0 && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 flex justify-between items-center">
              <span className="text-xs text-gray-500 font-bold uppercase">AI Accuracy</span>
              <Link to="/history" className="text-[10px] text-indigo-600 font-bold flex items-center gap-1">
                查看全部 &gt;
              </Link>
            </div>
            <div className="divide-y divide-gray-50">
              {predHistory.map((item) => (
                <div key={item.issue} className="p-3 flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                     <span className="font-mono text-gray-600 font-bold">{item.issue}期</span>
                     <span className="text-xs text-gray-400">开: {item.result_zodiac}</span>
                  </div>
                  <div className="flex gap-2">
                     <span className={`px-2 py-0.5 rounded text-xs font-bold ${item.is_hit_six == 1 ? 'bg-red-50 text-red-600' : 'bg-slate-100 text-slate-400'}`}>
                       {item.is_hit_six == 1 ? '六肖中' : '错'}
                     </span>
                     {item.is_hit_three == 1 && <span className="px-2 py-0.5 rounded text-xs font-bold bg-yellow-50 text-yellow-600">三肖中</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
          <div className="text-center mb-4 relative">
             <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-100"></div></div>
             <span className="relative bg-white px-4 text-xs text-gray-400 font-bold">LATEST RESULT</span>
          </div>
          <div className="flex flex-col items-center">
            <div className="flex justify-center flex-wrap gap-2 mb-4 w-full">
              {latestDraw.normals.map((ball, idx) => <Ball key={idx} num={ball.num} color={ball.color} zodiac={ball.zodiac} size="lg" />)}
            </div>
            <div className="flex items-center justify-center gap-3 w-full mb-2">
               <div className="h-px bg-gray-200 w-12"></div><span className="text-lg font-light text-gray-300">+</span><div className="h-px bg-gray-200 w-12"></div>
            </div>
            <Ball num={latestDraw.spec.num} color={latestDraw.spec.color} zodiac={latestDraw.spec.zodiac} size="xl" isSpec={true} />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-200"><span className="text-xs text-gray-500 font-bold uppercase">History Records</span></div>
          <div className="divide-y divide-gray-100">
            {historyList.map((item) => (
              <div key={item.id} className="p-3 flex flex-col gap-2 hover:bg-gray-50 transition-colors">
                <div className="flex justify-between items-center">
                   <div className="flex items-center gap-2">
                      <span className="text-sm font-mono font-bold text-gray-700">No.{item.issue}</span>
                      <div className={`w-2 h-2 rounded-full ${waveStyles[item.spec.color].split(' ')[0]}`}></div>
                   </div>
                   <span className="text-[10px] text-gray-400">{item.created_at?.substring(5, 16)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex gap-1 overflow-x-auto no-scrollbar w-full mr-2 pb-1">
                    {item.normals.map((ball, idx) => <Ball key={idx} num={ball.num} color={ball.color} zodiac={ball.zodiac} size="sm" />)}
                  </div>
                  <div className="w-px h-6 bg-gray-200 mx-1 flex-shrink-0"></div>
                  <div className="flex-shrink-0"><Ball num={item.spec.num} color={item.spec.color} zodiac={item.spec.zodiac} size="md" isSpec={true} /></div>
                </div>
              </div>
            ))}
          </div>
          {hasMore ? (
            <button onClick={handleLoadMore} disabled={expanding} className="w-full py-3 text-sm text-indigo-600 font-bold hover:bg-gray-50 border-t border-gray-100">{expanding?'加载中...':'⬇️ 加载更多历史'}</button>
          ) : (
            <div className="w-full py-3 text-xs text-gray-400 text-center">已显示全部</div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;