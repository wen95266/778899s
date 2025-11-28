import React, { useEffect, useState } from 'react';
import axios from 'axios';
import dayjs from 'dayjs';
import { RefreshCw, Trophy, ChevronRight, Zap, ChevronLeft } from 'lucide-react';

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

// --- 主程序 ---
function App() {
  const [latest, setLatest] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  
  // --- 分页状态 ---
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 5;

  // ⚠️ 请确保域名正确
  const API_URL = 'https://9526.ip-ddns.com/api';

  const fetchData = async () => {
    setLoading(true);
    try {
      const [resLatest, resHistory] = await Promise.all([
        axios.get(`${API_URL}/latest`),
        axios.get(`${API_URL}/history`)
      ]);
      if(resLatest.data.success) setLatest(resLatest.data.data);
      if(resHistory.data.success) {
        setHistory(resHistory.data.data);
        setCurrentPage(1); // 刷新数据时重置回第一页
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

  // --- 分页计算逻辑 ---
  const totalPages = Math.ceil(history.length / ITEMS_PER_PAGE);
  const currentHistory = history.slice(
    (currentPage - 1) * ITEMS_PER_PAGE, 
    currentPage * ITEMS_PER_PAGE
  );

  const prevPage = () => {
    if (currentPage > 1) setCurrentPage(c => c - 1);
  };

  const nextPage = () => {
    if (currentPage < totalPages) setCurrentPage(c => c + 1);
  };

  return (
    <div className="min-h-screen max-w-md mx-auto bg-gray-50 shadow-2xl overflow-hidden pb-10">
      
      {/* 1. 顶部栏 */}
      <div className="bg-indigo-600 px-4 py-4 flex justify-between items-center text-white shadow-lg sticky top-0 z-50">
        <div className="flex items-center gap-2">
          <Trophy size={20} className="text-yellow-300" />
          <h1 className="text-lg font-bold tracking-wider">六合宝典</h1>
        </div>
        <button onClick={fetchData} className="p-2 bg-indigo-500 rounded-full hover:bg-indigo-400 transition active:scale-95">
          <RefreshCw size={18} className={loading ? 'animate-spin' : ''}/>
        </button>
      </div>

      <div className="p-4 space-y-4">

        {/* 2. 最新开奖 */}
        {latest ? (
          <div className="bg-white rounded-xl p-5 shadow-lg border border-gray-100">
            <div className="flex justify-between items-center mb-4 border-b border-gray-100 pb-2">
              <span className="text-gray-500 text-sm">第 <span className="text-xl font-bold text-gray-800">{latest.issue}</span> 期</span>
              <span className="text-gray-400 text-xs">{dayjs(latest.open_date).format('YYYY-MM-DD')}</span>
            </div>

            <div className="flex flex-wrap justify-center items-center gap-2 mb-4">
              {latest.numbers.map((n, i) => (
                <Ball key={i} num={n} size="large" />
              ))}
              <div className="w-px h-8 bg-gray-300 mx-1"></div>
              <Ball num={latest.special_code} size="large" isSpecial />
            </div>

            <div className="flex justify-between items-center bg-gray-50 p-2 rounded-lg text-xs text-gray-500">
               <span>特码生肖: {latest.shengxiao}</span>
               <span className="text-indigo-500 cursor-pointer flex items-center">详情 <ChevronRight size={12}/></span>
            </div>
          </div>
        ) : (
          <div className="text-center py-10 text-gray-400">正在加载数据...</div>
        )}

        {/* 3. 预测区域 */}
        {latest && latest.next_prediction && (
          <div className="bg-gradient-to-r from-amber-100 to-orange-100 rounded-xl p-4 border border-orange-200 shadow-md">
            <div className="flex items-center gap-2 mb-3 text-orange-800 font-bold">
              <Zap size={18} className="fill-orange-500 text-orange-600"/>
              <span>下期心水推荐</span>
            </div>
            <div className="flex justify-around items-center">
               {latest.next_prediction.map((n, i) => (
                 <div key={i} className="flex flex-col items-center">
                    <div className="w-9 h-9 bg-white border-2 border-orange-300 rounded-full flex items-center justify-center text-orange-700 font-bold shadow-sm">
                      {String(n).padStart(2, '0')}
                    </div>
                 </div>
               ))}
            </div>
          </div>
        )}

        {/* 4. 历史列表 (带分页) */}
        <div className="bg-white rounded-xl shadow-md overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b font-bold text-gray-600 text-sm flex justify-between items-center">
            <span>往期记录</span>
            <span className="text-xs text-gray-400 font-normal">共 {history.length} 期</span>
          </div>
          
          <div className="divide-y divide-gray-100 min-h-[300px]">
            {currentHistory.map((item) => (
              <div key={item.issue} className="p-3 flex items-center justify-between hover:bg-gray-50 transition">
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-gray-700">第{item.issue}期</span>
                  <span className="text-[10px] text-gray-400">{dayjs(item.open_date).format('MM-DD')}</span>
                </div>
                <div className="flex gap-1">
                  {item.numbers.map((n, idx) => (
                    <Ball key={idx} num={n} size="normal" />
                  ))}
                  <div className="w-px h-6 bg-gray-200 mx-1"></div>
                  <Ball num={item.special_code} size="normal" />
                </div>
              </div>
            ))}
            {/* 占位符：如果不足5条，防止页面高度跳动 */}
            {currentHistory.length < ITEMS_PER_PAGE && currentHistory.length > 0 && 
              Array(ITEMS_PER_PAGE - currentHistory.length).fill(0).map((_, i) => (
                <div key={`empty-${i}`} className="p-3 h-[58px]"></div>
              ))
            }
          </div>

          {/* 分页控制栏 */}
          {history.length > 0 && (
            <div className="flex justify-between items-center p-3 bg-gray-50 border-t border-gray-100">
              <button 
                onClick={prevPage} 
                disabled={currentPage === 1}
                className="flex items-center px-3 py-1.5 text-xs font-medium rounded-md bg-white border border-gray-200 text-gray-600 hover:bg-indigo-50 hover:text-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                <ChevronLeft size={14} className="mr-1"/> 上一页
              </button>
              
              <span className="text-xs font-medium text-gray-500">
                {currentPage} / {totalPages} 页
              </span>
              
              <button 
                onClick={nextPage} 
                disabled={currentPage === totalPages}
                className="flex items-center px-3 py-1.5 text-xs font-medium rounded-md bg-white border border-gray-200 text-gray-600 hover:bg-indigo-50 hover:text-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed transition"
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