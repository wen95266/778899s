import React, { useEffect, useState } from 'react';
import axios from 'axios';
import dayjs from 'dayjs';
import { RefreshCw, Trophy, ChevronRight, Zap, ChevronLeft, Sparkles, LayoutGrid, ChevronDown, ChevronUp, Waves, Scale } from 'lucide-react';

// --- 工具函数 ---
const getBallColorClass = (n) => {
  const red = [1, 2, 7, 8, 12, 13, 18, 19, 23, 24, 29, 30, 34, 35, 40, 45, 46];
  const blue = [3, 4, 9, 10, 14, 15, 20, 25, 26, 31, 36, 37, 41, 42, 47, 48];
  
  if (red.includes(n)) return 'bg-red-500 ring-red-300';
  if (blue.includes(n)) return 'bg-blue-500 ring-blue-300';
  return 'bg-emerald-500 ring-emerald-300';
};

// --- 球体组件 ---
const Ball = ({ num, size = 'normal', isSpecial = false }) => {
  const colorClass = getBallColorClass(num);
  const sizeClass = size === 'large' ? 'w-10 h-10 text-lg' : 'w-8 h-8 text-sm';
  
  return (
    <div className={`
      relative flex items-center justify-center rounded-full 
      text-white font-bold shadow-ball
      ring-2 ring-opacity-50
      ${colorClass} ${sizeClass}
    `}>
      <div className="absolute top-1 left-2 w-2 h-1 bg-white opacity-40 rounded-full"></div>
      {String(num).padStart(2, '0')}
      {isSpecial && (
        <div className="absolute -top-2 -right-2 bg-yellow-400 text-yellow-900 text-[10px] px-1 rounded font-bold shadow-sm border border-white">
          特
        </div>
      )}
    </div>
  );
};

// --- 预测详情卡片组件 ---
const PredictionCard = ({ data, isHistory = false }) => {
  if (!data) return <div className="text-xs text-gray-400 p-2">暂无预测数据</div>;

  // 旧数据兼容
  if (Array.isArray(data)) {
    return (
      <div className="flex justify-around items-center py-2">
         {data.map((n, i) => (
           <div key={i} className="w-8 h-8 bg-white border border-orange-300 rounded-full flex items-center justify-center text-orange-700 font-bold text-xs shadow-sm">
             {String(n).padStart(2, '0')}
           </div>
         ))}
      </div>
    );
  }

  // 波色样式映射
  const waveStyles = {
    red: { label: '红波', class: 'text-red-600 bg-red-50 border-red-200' },
    blue: { label: '蓝波', class: 'text-blue-600 bg-blue-50 border-blue-200' },
    green: { label: '绿波', class: 'text-emerald-600 bg-emerald-50 border-emerald-200' }
  };

  // 新数据结构
  return (
    <div className={`space-y-2 ${isHistory ? 'bg-gray-50 p-3 rounded-lg border border-gray-100 mt-2 text-xs' : ''}`}>
      {isHistory && <div className="text-gray-400 text-[10px] mb-1">下期预测存档:</div>}

      {/* 1. 六肖 */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-bold text-gray-500 bg-gray-200 px-1.5 rounded">六肖</span>
        <div className="flex gap-1">
          {data.liu_xiao && data.liu_xiao.map((zx, i) => (
            <span key={i} className={`
              w-6 h-6 flex items-center justify-center rounded-full text-[10px] font-bold
              ${i < 3 ? 'bg-red-500 text-white' : 'bg-white border border-gray-300 text-gray-600'}
            `}>
              {zx}
            </span>
          ))}
        </div>
      </div>

      {/* 2. 头尾数 */}
      <div className="flex justify-between items-center bg-white/60 p-1.5 rounded border border-dashed border-gray-200">
         <div className="flex gap-2 items-center">
           <span className="text-[10px] text-gray-500">头数:</span>
           <b className="text-indigo-600 text-xs">主{data.hot_head} / 防{data.fang_head}</b>
         </div>
         <div className="flex gap-1 items-center">
            <span className="text-[10px] text-gray-500">尾数:</span>
            {data.rec_tails && data.rec_tails.map((t, i) => (
               <span key={i} className="w-4 h-4 bg-indigo-100 text-indigo-700 rounded text-[10px] flex items-center justify-center font-bold">{t}</span>
            ))}
         </div>
      </div>

      {/* 3. 波色与大小单双 (新增补回区域) */}
      <div className="grid grid-cols-2 gap-2">
          {/* 波色 */}
          <div className="bg-white/60 p-1.5 rounded flex items-center gap-2 border border-gray-100">
             <Waves size={12} className="text-gray-400"/>
             <div className="flex gap-1 text-[10px]">
                {data.zhu_bo && (
                  <span className={`px-1.5 rounded border ${waveStyles[data.zhu_bo]?.class}`}>
                    主: {waveStyles[data.zhu_bo]?.label}
                  </span>
                )}
                {data.fang_bo && (
                  <span className={`px-1.5 rounded border opacity-70 ${waveStyles[data.fang_bo]?.class}`}>
                    防: {waveStyles[data.fang_bo]?.label}
                  </span>
                )}
             </div>
          </div>
          
          {/* 大小单双 */}
          <div className="bg-white/60 p-1.5 rounded flex items-center gap-2 border border-gray-100">
             <Scale size={12} className="text-gray-400"/>
             <div className="flex gap-1 text-[10px] font-bold text-gray-700">
                <span className="bg-gray-100 px-1.5 rounded border border-gray-200">{data.da_xiao}</span>
                <span className="bg-gray-100 px-1.5 rounded border border-gray-200">{data.dan_shuang}</span>
             </div>
          </div>
      </div>

      {/* 4. 综合属性 */}
      {data.analysis && (
        <div className="flex gap-2 text-[10px] mt-1">
           <span className="bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded border border-amber-100">五行: {data.analysis.wuxing}</span>
           <span className="bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded border border-blue-100">{data.analysis.season}肖</span>
           <span className="bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded border border-purple-100">{data.analysis.sky_earth}肖</span>
        </div>
      )}
    </div>
  );
};

// --- 主程序 ---
function App() {
  const [latest, setLatest] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  
  // 分页状态
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 5;

  // 展开状态
  const [expandedRows, setExpandedRows] = useState({});

  const API_URL = 'https://9526.ip-ddns.com/api';

  const safeParse = (str) => {
    if (typeof str === 'object') return str; 
    try { return JSON.parse(str); } catch (e) { return null; }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const [resLatest, resHistory] = await Promise.all([
        axios.get(`${API_URL}/latest`),
        axios.get(`${API_URL}/history`)
      ]);
      
      if(resLatest.data.success) {
        const data = resLatest.data.data;
        data.next_prediction = safeParse(data.next_prediction);
        setLatest(data);
      }

      if(resHistory.data.success) {
        const parsedHistory = resHistory.data.data.map(item => ({
          ...item,
          next_prediction: safeParse(item.next_prediction)
        }));
        setHistory(parsedHistory);
        setCurrentPage(1);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // 分页逻辑
  const totalPages = Math.ceil(history.length / ITEMS_PER_PAGE);
  const currentHistory = history.slice(
    (currentPage - 1) * ITEMS_PER_PAGE, 
    currentPage * ITEMS_PER_PAGE
  );

  const prevPage = () => { if (currentPage > 1) setCurrentPage(c => c - 1); };
  const nextPage = () => { if (currentPage < totalPages) setCurrentPage(c => c + 1); };

  const toggleRow = (id) => {
    setExpandedRows(prev => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="min-h-screen max-w-md mx-auto bg-gray-50 shadow-2xl overflow-hidden pb-10 font-sans">
      
      {/* 顶部栏 */}
      <div className="bg-indigo-600 px-4 py-4 flex justify-between items-center text-white shadow-lg sticky top-0 z-50">
        <div className="flex items-center gap-2">
          <Trophy size={20} className="text-yellow-300" />
          <h1 className="text-lg font-bold tracking-wider">六合宝典</h1>
        </div>
        <button onClick={fetchData} className="p-2 bg-indigo-500 rounded-full hover:bg-indigo-400 transition active:scale-95">
          <RefreshCw size={18} className={loading ? 'animate-spin' : ''}/>
        </button>
      </div>

      <div className="p-4 space-y-5">

        {/* 最新开奖 */}
        {latest ? (
          <div className="bg-white rounded-2xl p-5 shadow-lg border border-gray-100 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 bg-blue-50 rounded-bl-full -z-0 opacity-50"></div>
            
            <div className="flex justify-between items-center mb-4 border-b border-gray-100 pb-2 relative z-10">
              <span className="text-gray-500 text-sm">第 <span className="text-2xl font-black text-gray-800">{latest.issue}</span> 期</span>
              <span className="bg-green-100 text-green-700 text-[10px] px-2 py-1 rounded-full font-bold">已开奖</span>
            </div>

            <div className="flex flex-wrap justify-center items-center gap-2 mb-4 relative z-10">
              {latest.numbers.map((n, i) => (
                <Ball key={i} num={n} size="large" />
              ))}
              <div className="text-gray-300 text-2xl font-thin">+</div>
              <Ball num={latest.special_code} size="large" isSpecial />
            </div>

            <div className="flex justify-between items-center bg-gray-50 p-3 rounded-xl text-xs text-gray-600 relative z-10">
               <div className="flex gap-3">
                 <span>特码: <b>{latest.special_code}</b></span>
                 <span>生肖: <b>{latest.shengxiao}</b></span>
               </div>
               <span className="text-gray-400">{dayjs(latest.open_date).format('MM-DD')}</span>
            </div>
          </div>
        ) : (
          <div className="text-center py-10 text-gray-400">正在加载数据...</div>
        )}

        {/* 预测区域 */}
        {latest && latest.next_prediction && (
          <div className="bg-gradient-to-br from-orange-50 to-amber-50 rounded-2xl p-4 border border-orange-100 shadow-md relative">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-orange-300 to-amber-300"></div>
            
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 text-orange-800 font-bold">
                <Sparkles size={16} className="text-orange-500"/>
                <span>第 {parseInt(latest.issue) + 1} 期 心水推荐</span>
              </div>
            </div>

            <PredictionCard data={latest.next_prediction} />

            <div className="mt-3 text-[10px] text-center text-orange-300">
              * 数据仅供参考，请理性购彩
            </div>
          </div>
        )}

        {/* 历史列表 */}
        <div className="bg-white rounded-2xl shadow-md overflow-hidden border border-gray-100">
          <div className="px-4 py-3 bg-gray-50/80 border-b font-bold text-gray-600 text-sm flex justify-between items-center backdrop-blur-sm">
            <span className="flex items-center gap-1"><LayoutGrid size={14}/> 往期记录</span>
            <span className="text-[10px] bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded-md">Total: {history.length}</span>
          </div>
          
          <div className="divide-y divide-gray-50 min-h-[300px]">
            {currentHistory.map((item) => (
              <div key={item.id} className="p-3 hover:bg-gray-50 transition-colors flex flex-col">
                <div className="flex items-center justify-between">
                    <div className="flex flex-col min-w-[3rem]">
                      <span className="text-sm font-bold text-gray-700">{item.issue}</span>
                      <span className="text-[10px] text-gray-400">{dayjs(item.open_date).format('MM-DD')}</span>
                    </div>
                    
                    <div className="flex gap-1 overflow-x-auto no-scrollbar mx-2">
                      {item.numbers.map((n, idx) => (
                        <Ball key={idx} num={n} size="normal" />
                      ))}
                      <div className="w-px h-6 bg-gray-200 mx-0.5"></div>
                      <Ball num={item.special_code} size="normal" />
                    </div>

                    <button 
                      onClick={() => toggleRow(item.id)}
                      className="text-gray-400 hover:text-indigo-500 p-1 transition"
                    >
                      {expandedRows[item.id] ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                </div>

                {/* 预测历史展开 */}
                {expandedRows[item.id] && (
                  <div className="animate-fade-in mt-2">
                    <PredictionCard data={item.next_prediction} isHistory={true} />
                  </div>
                )}
              </div>
            ))}
            
            {/* 补白 */}
            {currentHistory.length < ITEMS_PER_PAGE && currentHistory.length > 0 && 
              Array(ITEMS_PER_PAGE - currentHistory.length).fill(0).map((_, i) => (
                <div key={`empty-${i}`} className="p-3 h-[58px]"></div>
              ))
            }
          </div>

          {/* 分页按钮 */}
          {history.length > 0 && (
            <div className="flex justify-between items-center p-3 border-t border-gray-100 bg-gray-50/50">
              <button 
                onClick={prevPage} 
                disabled={currentPage === 1}
                className="flex items-center px-3 py-1.5 text-xs font-medium rounded-lg bg-white border border-gray-200 text-gray-600 hover:bg-indigo-50 hover:text-indigo-600 disabled:opacity-40 disabled:cursor-not-allowed transition shadow-sm"
              >
                <ChevronLeft size={14} className="mr-1"/> 上一页
              </button>
              
              <span className="text-xs font-medium text-gray-400 font-mono">
                {currentPage} / {totalPages}
              </span>
              
              <button 
                onClick={nextPage} 
                disabled={currentPage === totalPages}
                className="flex items-center px-3 py-1.5 text-xs font-medium rounded-lg bg-white border border-gray-200 text-gray-600 hover:bg-indigo-50 hover:text-indigo-600 disabled:opacity-40 disabled:cursor-not-allowed transition shadow-sm"
              >
                下一页 <ChevronRight size={14} className="ml-1"/>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
