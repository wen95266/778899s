import React, { useEffect, useState } from 'react';
import Ball from './components/Ball';

function App() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // 新增：控制历史记录展开的状态
  const [expandHistory, setExpandHistory] = useState(false);

  const fetchData = async () => {
    try {
      // 加上时间戳防止缓存
      const apiUrl = `${import.meta.env.VITE_API_URL}?action=get_data&t=${Date.now()}`;
      const res = await fetch(apiUrl);
      const json = await res.json();
      if (json.status === 'success') {
        setData(json.data);
      }
    } catch (error) {
      console.error('Failed to fetch', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  if (loading) return <div className="h-screen flex items-center justify-center text-gray-400 bg-gray-50">加载数据中...</div>;
  if (!data || !data.history || data.history.length === 0) return <div className="p-10 text-center text-gray-500">暂无数据</div>;

  const latestDraw = data.history[0];
  const fullHistoryList = data.history.slice(1);

  // 逻辑：如果没展开，只切片取前 10 条；如果展开了，显示全部
  const displayList = expandHistory ? fullHistoryList : fullHistoryList.slice(0, 10);
  const remainingCount = fullHistoryList.length - 10;

  return (
    <div className="min-h-screen bg-gray-100 font-sans pb-10">
      
      {/* === 顶部 Header === */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50 shadow-sm">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between">
          <h1 className="text-xl font-black tracking-tighter text-gray-800 flex items-center gap-1">
            <span className="text-indigo-600">MACAO</span>6
          </h1>
          <div className="text-xs font-mono bg-gray-100 px-2 py-1 rounded text-gray-500">
            第 {latestDraw.issue} 期
          </div>
        </div>
      </header>

      {/* === 预测横幅 (Banner) === */}
      <div className="bg-slate-900 text-white shadow-lg relative overflow-hidden">
        <div className="max-w-2xl mx-auto px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          
          {/* 左侧：标题 */}
          <div className="flex items-center gap-2">
            <span className="bg-indigo-600 text-white text-[10px] px-1.5 py-0.5 rounded font-mono border border-indigo-400">
              NEXT: {data.next_issue}
            </span>
            <span className="font-bold text-sm tracking-wide text-indigo-100">智能预测</span>
          </div>

          {/* 右侧：预测内容 */}
          <div className="flex items-center justify-between sm:justify-end gap-6 w-full sm:w-auto">
            {/* 六肖 */}
            <div className="flex items-center gap-1">
              <span className="text-xs text-slate-400 mr-1">六肖</span>
              {data.prediction.six_xiao.map((z, i) => (
                <span key={i} className="w-6 h-6 flex items-center justify-center bg-slate-800 border border-slate-600 rounded text-xs font-bold text-yellow-400 shadow-sm">
                  {z}
                </span>
              ))}
            </div>

            {/* 波色 */}
            <div className="flex items-center gap-1">
               <span className="text-xs text-slate-400">波色</span>
               <span className={`px-3 py-0.5 text-xs font-bold rounded border shadow-sm
                 ${data.prediction.color_wave === 'red' ? 'bg-red-900 border-red-500 text-red-300' : 
                   data.prediction.color_wave === 'blue' ? 'bg-blue-900 border-blue-500 text-blue-300' : 
                   'bg-emerald-900 border-emerald-500 text-emerald-300'}`}>
                 {data.prediction.color_wave === 'red' ? '红' : 
                  data.prediction.color_wave === 'blue' ? '蓝' : '绿'}
               </span>
            </div>
          </div>

        </div>
      </div>

      <div className="max-w-2xl mx-auto space-y-4 pt-4 px-3">
        
        {/* === 最新一期 (Hero) === */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
          <div className="text-center mb-4">
             <span className="text-xs text-gray-400 uppercase tracking-widest font-semibold">Latest Result</span>
          </div>
          
          <div className="flex flex-col items-center">
            
            {/* 平码区 */}
            <div className="mb-6 w-full">
              <div className="flex justify-center flex-wrap gap-2">
                {latestDraw.normals.map((ball, idx) => (
                  <Ball key={idx} num={ball.num} color={ball.color} zodiac={ball.zodiac} size="lg" />
                ))}
              </div>
            </div>

            {/* 特码分割线 */}
            <div className="w-full flex items-center gap-4 mb-4">
               <div className="h-px bg-gray-100 flex-1"></div>
               <span className="text-[10px] text-gray-400 font-bold bg-gray-50 px-2 rounded-full border border-gray-100">特码 SPEC</span>
               <div className="h-px bg-gray-100 flex-1"></div>
            </div>

            {/* 特码区 */}
            <div className="flex items-center gap-4">
               <Ball num={latestDraw.spec.num} color={latestDraw.spec.color} zodiac={latestDraw.spec.zodiac} size="xl" isSpec={true} />
            </div>

          </div>
        </div>

        {/* === 历史记录列表 === */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex justify-between items-center">
            <span className="text-xs text-gray-500 font-bold uppercase tracking-wider">History Records</span>
            <span className="text-[10px] text-gray-400 bg-white px-2 py-0.5 rounded border border-gray-200">
              近 {displayList.length} / {fullHistoryList.length} 期
            </span>
          </div>
          
          <div className="divide-y divide-gray-100">
            {displayList.map((item) => (
              <div key={item.id} className="p-4 flex flex-col gap-3 hover:bg-gray-50 transition-colors">
                
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-mono font-bold text-gray-700">
                      No.{item.issue}
                    </span>
                    {/* 小彩蛋：根据波色显示一个小圆点 */}
                    <div className={`w-2 h-2 rounded-full 
                      ${item.spec.color === 'red' ? 'bg-red-500' : item.spec.color === 'blue' ? 'bg-blue-500' : 'bg-emerald-500'}
                    `}></div>
                  </div>
                  <span className="text-[10px] text-gray-400">{item.created_at ? item.created_at.substring(5, 16) : '已完结'}</span>
                </div>

                <div className="flex items-center justify-between">
                  {/* 平码区：允许水平滚动以防小屏幕挤压 */}
                  <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar w-full mr-2">
                    {item.normals.map((ball, idx) => (
                      <Ball key={idx} num={ball.num} color={ball.color} zodiac={ball.zodiac} size="sm" />
                    ))}
                  </div>

                  {/* 竖线分隔 */}
                  <div className="w-px h-8 bg-gray-200 mx-1 flex-shrink-0"></div>

                  {/* 特码区 */}
                  <div className="flex-shrink-0">
                    <Ball num={item.spec.num} color={item.spec.color} zodiac={item.spec.zodiac} size="md" isSpec={true} />
                  </div>
                </div>

              </div>
            ))}
          </div>

          {/* === 底部“加载更多”按钮 === */}
          {!expandHistory && remainingCount > 0 && (
            <button 
              onClick={() => setExpandHistory(true)}
              className="w-full py-3 text-sm text-indigo-600 font-bold bg-gray-50 hover:bg-indigo-50 transition-colors border-t border-gray-100"
            >
              ⬇️ 查看剩余 {remainingCount} 期记录
            </button>
          )}

           {expandHistory && (
            <button 
              onClick={() => setExpandHistory(false)}
              className="w-full py-3 text-sm text-gray-500 font-bold bg-gray-50 hover:bg-gray-100 transition-colors border-t border-gray-100"
            >
              ⬆️ 收起列表
            </button>
          )}
        </div>

      </div>
    </div>
  );
}

export default App;