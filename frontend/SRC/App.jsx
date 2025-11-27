import React, { useEffect, useState } from 'react';
import axios from 'axios';
import dayjs from 'dayjs';
import { RefreshCcw, Trophy, Calendar } from 'lucide-react';

// 球组件
const Ball = ({ num, isSpecial = false, size = 'md' }) => {
  // 简单的波色映射（实际需要完整的波色表）
  const getColor = (n) => {
    const red = [1, 2, 7, 8, 12, 13, 18, 19, 23, 24, 29, 30, 34, 35, 40, 45, 46];
    const blue = [3, 4, 9, 10, 14, 15, 20, 25, 26, 31, 36, 37, 41, 42, 47, 48];
    // 剩下是绿
    if (red.includes(n)) return 'bg-red-500';
    if (blue.includes(n)) return 'bg-blue-500';
    return 'bg-green-500';
  };

  const sizeClass = size === 'lg' ? 'w-10 h-10 text-lg' : 'w-8 h-8 text-sm';
  const colorClass = getColor(num);

  return (
    <div className={`${sizeClass} ${colorClass} rounded-full flex items-center justify-center text-white font-bold shadow-md m-1`}>
      {String(num).padStart(2, '0')}
    </div>
  );
};

function App() {
  const [latest, setLatest] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  // 后端 API 地址
  const API_URL = 'https://9526.ip-ddns.com/api';

  const fetchData = async () => {
    setLoading(true);
    try {
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
    <div className="min-h-screen pb-10 max-w-md mx-auto bg-gray-50 shadow-xl overflow-hidden">
      {/* 头部 */}
      <div className="bg-indigo-600 p-4 text-white flex justify-between items-center">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Trophy size={20} /> 六合彩开奖
        </h1>
        <button onClick={fetchData} className="p-2 hover:bg-indigo-500 rounded-full transition">
          <RefreshCcw size={18} className={loading ? 'animate-spin' : ''}/>
        </button>
      </div>

      {/* 最新开奖卡片 */}
      <div className="p-4">
        {latest ? (
          <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
            <div className="flex justify-between items-center mb-4 border-b pb-2">
              <span className="text-gray-500 text-sm">第 <span className="text-lg font-bold text-gray-800">{latest.issue}</span> 期</span>
              <span className="text-gray-400 text-xs flex items-center gap-1">
                <Calendar size={12}/> {dayjs(latest.open_date).format('YYYY-MM-DD')}
              </span>
            </div>

            {/* 开奖号码 */}
            <div className="flex flex-wrap justify-center mb-2">
              {latest.numbers.map((n, idx) => <Ball key={idx} num={n} size="lg" />)}
              <div className="w-4"></div>
              <Ball num={latest.special_code} isSpecial size="lg" />
            </div>
            <div className="text-center text-xs text-gray-400 mb-4">平码 + 特码</div>
            
            <div className="text-center bg-gray-50 py-1 rounded text-sm text-gray-600">
               特码属性: {latest.shengxiao || '-'}
            </div>
          </div>
        ) : (
          <div className="text-center py-10 text-gray-400">暂无数据...</div>
        )}
      </div>

      {/* 下期预测 (重点展示) */}
      {latest && latest.next_prediction && (
        <div className="mx-4 mb-4">
           <div className="bg-gradient-to-r from-orange-100 to-amber-100 border border-orange-200 rounded-xl p-4 shadow-sm relative overflow-hidden">
              <div className="absolute top-0 right-0 bg-orange-500 text-white text-xs px-2 py-1 rounded-bl-lg font-bold">
                智能预测
              </div>
              <h3 className="text-orange-800 font-bold text-sm mb-3">第 {parseInt(latest.issue) + 1} 期 心水推荐</h3>
              <div className="flex justify-center gap-2">
                  {latest.next_prediction.map((n, i) => (
                    <div key={i} className="w-9 h-9 bg-white border-2 border-orange-400 rounded-full flex items-center justify-center text-orange-600 font-bold shadow-sm">
                      {String(n).padStart(2, '0')}
                    </div>
                  ))}
              </div>
              <p className="text-center text-xs text-orange-400 mt-2 opacity-70">* 仅供参考，理性购彩</p>
           </div>
        </div>
      )}

      {/* 历史记录列表 */}
      <div className="mx-4 bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-3 bg-gray-50 border-b font-bold text-gray-700 text-sm">
          历史开奖
        </div>
        <div className="divide-y divide-gray-100">
          {history.map((item) => (
            <div key={item.issue} className="p-3 hover:bg-gray-50 transition">
              <div className="flex justify-between items-center mb-2">
                 <span className="text-xs font-bold bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded">
                   {item.issue}期
                 </span>
                 <span className="text-xs text-gray-400">{dayjs(item.open_date).format('MM-DD')}</span>
              </div>
              <div className="flex gap-1 justify-start overflow-x-auto pb-1">
                {item.numbers.map((n, idx) => <Ball key={idx} num={n} size="sm" />)}
                <div className="border-l mx-1 pl-1 flex items-center">
                   <Ball num={item.special_code} size="sm" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default App;