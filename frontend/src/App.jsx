import React, { useEffect, useState } from 'react';
import axios from 'axios';
import dayjs from 'dayjs';
import { RefreshCw, Trophy, ChevronRight, Zap, ChevronLeft, Sparkles, LayoutGrid, ChevronDown, ChevronUp, Waves, Scale, Grid, Ban, Flame, Crosshair } from 'lucide-react';

// --- 工具函数 ---
const getBallColorClass = (n) => {
  const red = [1, 2, 7, 8, 12, 13, 18, 19, 23, 24, 29, 30, 34, 35, 40, 45, 46];
  const blue = [3, 4, 9, 10, 14, 15, 20, 25, 26, 31, 36, 37, 41, 42, 47, 48];
  if (red.includes(n)) return 'bg-red-500 ring-red-300';
  if (blue.includes(n)) return 'bg-blue-500 ring-blue-300';
  return 'bg-emerald-500 ring-emerald-300';
};

const Ball = ({ num, size = 'normal', isSpecial = false }) => {
  const colorClass = getBallColorClass(num);
  const sizeClass = size === 'large' ? 'w-10 h-10 text-lg' : 'w-8 h-8 text-sm';
  const smallSize = size === 'small' ? 'w-6 h-6 text-xs' : '';
  
  return (
    <div className={`relative flex items-center justify-center rounded-full text-white font-bold shadow-ball ring-2 ring-opacity-50 ${colorClass} ${sizeClass !== '' ? sizeClass : smallSize}`}>
      <div className="absolute top-1 left-2 w-2 h-1 bg-white opacity-40 rounded-full"></div>
      {String(num).padStart(2, '0')}
      {isSpecial && (<div className="absolute -top-2 -right-2 bg-yellow-400 text-yellow-900 text-[10px] px-1 rounded font-bold shadow-sm border border-white">特</div>)}
    </div>
  );
};

const PredictionCard = ({ data, isHistory = false }) => {
  if (!data) return <div className="text-xs text-gray-400 p-2">暂无预测数据</div>;

  const waveMap = { 
    red: { label: '红波', color: 'text-red-500', bg: 'bg-red-50' },
    blue: { label: '蓝波', color: 'text-blue-500', bg: 'bg-blue-50' },
    green: { label: '绿波', color: 'text-emerald-500', bg: 'bg-emerald-50' }
  };

  return (
    <div className={`space-y-3 ${isHistory ? 'bg-gray-50 p-3 rounded-lg border border-gray-100 mt-2 text-xs' : ''}`}>
      {isHistory && <div className="text-gray-400 text-[10px] mb-1 font-medium">预测存档:</div>}

      {/* 1. 五肖中特 (核心展示) */}
      <div className="bg-gradient-to-r from-red-50 to-orange-50 p-3 rounded-xl border border-red-100 shadow-sm text-center relative overflow-hidden">
          <div className="absolute top-0 right-0 p-1 opacity-10"><Flame size={48} /></div>
          <div className="text-[10px] text-red-500 font-bold mb-2 tracking-wider uppercase flex items-center justify-center gap-1">
             <Flame size={12}/> V10.4 核心必中 - 五肖
          </div>
          <div className="flex justify-center gap-3 md:gap-4 relative z-10">
              {data.liu_xiao && data.liu_xiao.slice(0, 5).map((z, i) => (
                  <div key={i} className="flex flex-col items-center">
                     <span className="text-lg md:text-xl font-black text-gray-800 drop-shadow-sm">{z}</span>
                     {i < 3 && <div className="h-1 w-4 bg-red-400 rounded-full mt-1"></div>}
                  </div>
              ))}
          </div>
          <div className="mt-2 text-[10px] text-red-300 font-medium">* 前三肖为主攻</div>
      </div>

      {/* 2. 绝杀与尾数 */}
      <div className="grid grid-cols-2 gap-2">
           {/* 绝杀三肖 - 修正为淡红色背景 */}
           <div className="bg-rose-50 p-2 rounded-lg border border-rose-100 shadow-sm flex flex-col justify-center">
               <div className="flex items-center gap-1 text-[10px] text-rose-500 font-bold mb-1">
                  <Ban size={10} /> 绝杀三肖 (避雷)
               </div>
               <div className="flex gap-2 justify-center">
                  {data.kill_zodiacs && data.kill_zodiacs.map((z,i) => (
                      <span key={i} className="text-xs font-bold text-gray-400 line-through decoration-rose-400 decoration-2">{z}</span>
                  ))}
               </div>
           </div>
           
           {/* 尾数推荐 */}
           <div className="bg-white p-2 rounded-lg border border-gray-200 flex flex-col justify-center items-center shadow-sm">
                <div className="text-[10px] text-gray-400 mb-1 flex items-center gap-1"><Crosshair size={10}/> 推荐尾数</div>
                <div className="font-black text-indigo-600 text-sm tracking-widest bg-indigo-50 px-2 rounded">
                    {data.rec_tails ? data.rec_tails.join(' . ') : '?'}
                </div>
           </div>
      </div>

      {/* 3. 头数与波色 (主/防 对比展示) */}
      <div className="bg-white rounded-lg border border-gray-100 p-2 shadow-sm">
          <div className="grid grid-cols-2 divide-x divide-gray-100">
              {/* 头数 */}
              <div className="px-2 flex flex-col items-center">
                  <div className="text-[10px] text-gray-400 mb-1">头数策略</div>
                  <div className="flex items-center gap-2 text-xs">
                      <span className="font-bold text-gray-800">主 {data.hot_head}</span>
                      <span className="text-gray-300">|</span>
                      <span className="text-gray-500">防 {data.fang_head}</span>
                  </div>
              </div>
              {/* 波色 */}
              <div className="px-2 flex flex-col items-center">
                  <div className="text-[10px] text-gray-400 mb-1">波色策略</div>
                  <div className="flex items-center gap-2 text-xs">
                      <span className={`font-bold ${waveMap[data.zhu_bo]?.color || 'text-gray-800'}`}>主{waveMap[data.zhu_bo]?.label || '?'}</span>
                      <span className="text-gray-300">|</span>
                      <span className={`text-gray-500`}>防{waveMap[data.fang_bo]?.label || '?'}</span>
                  </div>
              </div>
          </div>
      </div>
      
      {/* 4. 一码阵 */}
      {data.zodiac_one_code && data.zodiac_one_code.length > 0 && (
          <div className="bg-gray-50 p-2 rounded-lg border border-gray-200">
               <div className="text-[10px] text-center text-gray-400 mb-2 flex items-center justify-center gap-1"><Grid size={10}/> 全肖一码阵 (参考)</div>
               <div className="grid grid-cols-5 gap-1">
                   {data.zodiac_one_code.map((item,i) => (
                       <div key={i} className="flex flex-col items-center bg-white rounded py-1 shadow-sm border border-gray-100">
                           <span className="text-[9px] text-gray-500 font-bold">{item.zodiac}</span>
                           <div className="text-[10px] font-black text-indigo-600">{String(item.num).padStart(2,'0')}</div>
                       </div>
                   ))}
               </div>
          </div>
      )}
    </div>
  );
};

function App() {
  const [latest, setLatest] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 5;
  const [expandedRows, setExpandedRows] = useState({});

  const API_URL = 'https://9526.ip-ddns.com/api';
  const safeParse = (str) => { if (typeof str === 'object') return str; try { return JSON.parse(str); } catch (e) { return null; } };

  const fetchData = async () => {
    setLoading(true);
    try {
      const [resLatest, resHistory] = await Promise.all([ axios.get(`${API_URL}/latest`), axios.get(`${API_URL}/history`) ]);
      if(resLatest.data.success) {
        const data = resLatest.data.data;
        data.next_prediction = safeParse(data.deep_prediction) || safeParse(data.next_prediction);
        setLatest(data);
      }
      if(resHistory.data.success) {
        setHistory(resHistory.data.data.map(item => ({ ...item, next_prediction: safeParse(item.deep_prediction) || safeParse(item.next_prediction) })));
      }
    } catch (error) { console.error(error); } finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, []);
  const totalPages = Math.ceil(history.length / ITEMS_PER_PAGE);
  const currentHistory = history.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);
  const toggleRow = (id) => { setExpandedRows(prev => ({ ...prev, [id]: !prev[id] })); };

  return (
    <div className="min-h-screen max-w-md mx-auto bg-gray-50 shadow-2xl overflow-hidden pb-10 font-sans">
      <div className="bg-indigo-600 px-4 py-4 flex justify-between items-center text-white shadow-lg sticky top-0 z-50">
        <div className="flex items-center gap-2"><Trophy size={20} className="text-yellow-300" /><h1 className="text-lg font-bold tracking-wider">六合宝典 V10</h1></div>
        <button onClick={fetchData} className="p-2 bg-indigo-500 rounded-full hover:bg-indigo-400 transition active:scale-95"><RefreshCw size={18} className={loading ? 'animate-spin' : ''}/></button>
      </div>

      <div className="p-4 space-y-5">
        {latest ? (
          <div className="bg-white rounded-2xl p-5 shadow-lg border border-gray-100 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 bg-blue-50 rounded-bl-full -z-0 opacity-50"></div>
            <div className="flex justify-between items-center mb-4 border-b border-gray-100 pb-2 relative z-10">
              <span className="text-gray-500 text-sm">第 <span className="text-2xl font-black text-gray-800">{latest.issue}</span> 期</span>
              <span className="bg-green-100 text-green-700 text-[10px] px-2 py-1 rounded-full font-bold">已开奖</span>
            </div>
            <div className="flex flex-wrap justify-center items-center gap-2 mb-4 relative z-10">
              {latest.numbers.map((n, i) => (<Ball key={i} num={n} size="large" />))}
              <div className="text-gray-300 text-2xl font-thin">+</div>
              <Ball num={latest.special_code} size="large" isSpecial />
            </div>
            <div className="flex justify-between items-center bg-gray-50 p-3 rounded-xl text-xs text-gray-600 relative z-10">
               <div className="flex gap-3"><span>特码: <b>{latest.special_code}</b></span><span>生肖: <b>{latest.shengxiao}</b></span></div>
               <span className="text-gray-400">{dayjs(latest.open_date).format('MM-DD')}</span>
            </div>
          </div>
        ) : (<div className="text-center py-10 text-gray-400">正在加载数据...</div>)}

        {latest && latest.next_prediction && (
          <div className="bg-gradient-to-br from-orange-50 to-amber-50 rounded-2xl p-4 border border-orange-100 shadow-md relative">
            <div className="flex items-center justify-between mb-3"><div className="flex items-center gap-2 text-orange-800 font-bold"><Sparkles size={16} className="text-orange-500"/><span>第 {parseInt(latest.issue) + 1} 期 智能决策</span></div></div>
            <PredictionCard data={latest.next_prediction} />
            <div className="mt-3 text-[10px] text-center text-orange-300">* 五行农历算法驱动，仅供参考</div>
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-md overflow-hidden border border-gray-100">
          <div className="px-4 py-3 bg-gray-50/80 border-b font-bold text-gray-600 text-sm flex justify-between items-center backdrop-blur-sm">
            <span className="flex items-center gap-1"><LayoutGrid size={14}/> 往期记录</span><span className="text-[10px] bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded-md">Total: {history.length}</span>
          </div>
          <div className="divide-y divide-gray-50 min-h-[300px]">
            {currentHistory.map((item) => (
              <div key={item.id} className="p-3 hover:bg-gray-50 transition-colors flex flex-col">
                <div className="flex items-center justify-between">
                    <div className="flex flex-col min-w-[3rem]"><span className="text-sm font-bold text-gray-700">{item.issue}</span><span className="text-[10px] text-gray-400">{dayjs(item.open_date).format('MM-DD')}</span></div>
                    <div className="flex gap-1 overflow-x-auto no-scrollbar mx-2">{item.numbers.map((n, idx) => (<Ball key={idx} num={n} size="normal" />))}<div className="w-px h-6 bg-gray-200 mx-0.5"></div><Ball num={item.special_code} size="normal" /></div>
                    <button onClick={() => toggleRow(item.id)} className="flex items-center gap-1 text-gray-400 hover:text-indigo-500 p-1 transition group active:scale-95"><span className="text-[10px] scale-90 text-gray-300 group-hover:text-indigo-400 font-medium">查看</span>{expandedRows[item.id] ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</button>
                </div>
                {expandedRows[item.id] && (<div className="animate-fade-in mt-2"><PredictionCard data={item.next_prediction} isHistory={true} /></div>)}
              </div>
            ))}
          </div>
          {history.length > 0 && (
            <div className="flex justify-between items-center p-3 border-t border-gray-100 bg-gray-50/50">
              <button onClick={() => setCurrentPage(c => c-1)} disabled={currentPage===1} className="flex items-center px-3 py-1.5 text-xs font-medium rounded-lg bg-white border border-gray-200 text-gray-600 hover:bg-indigo-50 disabled:opacity-40"><ChevronLeft size={14} className="mr-1"/> 上一页</button>
              <span className="text-xs font-medium text-gray-400 font-mono">{currentPage} / {totalPages}</span>
              <button onClick={() => setCurrentPage(c => c+1)} disabled={currentPage===totalPages} className="flex items-center px-3 py-1.5 text-xs font-medium rounded-lg bg-white border border-gray-200 text-gray-600 hover:bg-indigo-50 disabled:opacity-40">下一页 <ChevronRight size={14} className="ml-1"/></button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
