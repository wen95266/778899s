import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

function HistoryPage() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const res = await fetch(`${import.meta.env.VITE_API_URL}?action=get_history&t=${Date.now()}`);
        const json = await res.json();
        if (json.status === 'success') setRecords(json.data);
      } catch (error) { console.error(error); } finally { setLoading(false); }
    };
    fetchHistory();
  }, []);

  const waveMap = { red: '红', blue: '蓝', green: '绿' };

  return (
    <div className="min-h-screen bg-slate-50 font-sans pb-10">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50 shadow-sm">
        <div className="max-w-2xl mx-auto px-4 h-12 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-1 text-sm font-bold text-slate-600 hover:text-indigo-600 transition-colors">
            &larr; 返回首页
          </Link>
          <h1 className="text-base font-bold text-slate-800">AI 战绩复盘</h1>
          <div className="w-12"></div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto p-4 space-y-4">
        {loading ? (
          <div className="text-center text-slate-400 py-10">正在拉取战报...</div>
        ) : records.length === 0 ? (
          <div className="text-center text-slate-400 py-10">暂无复盘数据</div>
        ) : (
          records.map((item) => {
            const isHit3 = item.is_hit_three == 1;
            const isHit6 = item.is_hit_six == 1;
            const isHitWave = item.is_hit_wave == 1;
            
            return (
              <div key={item.issue} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                {/* 头部：期号与结果 */}
                <div className="bg-slate-50 px-4 py-2 flex justify-between items-center border-b border-slate-100">
                  <span className="font-mono font-bold text-slate-700">#{item.issue}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400">实际开:</span>
                    <span className="w-6 h-6 flex items-center justify-center bg-slate-800 text-white rounded-full text-xs font-bold">
                      {item.result_zodiac}
                    </span>
                  </div>
                </div>

                {/* 内容区：预测对比 */}
                <div className="p-4">
                  <div className="grid grid-cols-2 gap-4 mb-3">
                    {/* 三肖 */}
                    <div>
                      <div className="text-[10px] text-slate-400 mb-1">推荐三肖</div>
                      <div className={`text-sm font-bold ${isHit3 ? 'text-yellow-600' : 'text-slate-600'}`}>
                        {item.three_xiao ? item.three_xiao.replace(/,/g, ' ') : '-'}
                        {isHit3 && <span className="ml-1 text-xs bg-yellow-100 text-yellow-700 px-1 rounded">中</span>}
                      </div>
                    </div>
                    {/* 波色 */}
                    <div>
                      <div className="text-[10px] text-slate-400 mb-1">推荐波色</div>
                      <div className={`text-sm font-bold ${isHitWave ? 'text-blue-600' : 'text-slate-600'}`}>
                        {waveMap[item.wave_primary]}/{waveMap[item.wave_secondary]}
                        {isHitWave && <span className="ml-1 text-xs bg-blue-100 text-blue-700 px-1 rounded">中</span>}
                      </div>
                    </div>
                  </div>

                  {/* 底部：六肖 */}
                  <div className="pt-3 border-t border-slate-50 flex justify-between items-center">
                    <div className="text-xs text-slate-500">
                      <span className="mr-2 opacity-60">六肖:</span>
                      {item.six_xiao ? item.six_xiao.replace(/,/g, ' ') : '-'}
                    </div>
                    <div className={`text-xs font-bold px-2 py-0.5 rounded ${isHit6 ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-400'}`}>
                      {isHit6 ? '六肖中' : '全错'}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export default HistoryPage;