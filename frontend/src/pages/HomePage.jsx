// frontend/src/pages/HomePage.jsx
import React, { useState, useEffect } from 'react';
import { api } from '../api';

// 定义显示的顺序
const LOTTERY_ORDER = ['香港六合彩', '新澳门六合彩', '老澳门六合彩'];

function HomePage() {
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = () => {
    api.getLotteryResults()
      .then(res => {
        if(res.status === 'success') {
            setResults(res.data);
        }
      })
      .catch(err => {
        console.error(err);
        setError("无法获取开奖数据，请检查网络");
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchData();
    // 可选：每60秒自动刷新一次
    const timer = setInterval(fetchData, 60000);
    return () => clearInterval(timer);
  }, []);

  if (loading) return <div className="loading-container"><div className="spinner"></div><p>正在同步开奖数据...</p></div>;
  if (error) return <div className="error-card">{error}</div>;

  return (
    <div className="home-page">
      {LOTTERY_ORDER.map(type => {
        const data = results ? results[type] : null;
        return <LotteryCard key={type} type={type} data={data} />;
      })}
      
      <div className="refresh-hint">
        <p>数据来源：官方实时同步</p>
        <button onClick={fetchData} className="btn-text">🔄 点击刷新</button>
      </div>
    </div>
  );
}

// 单个彩票卡片组件
function LotteryCard({ type, data }) {
  if (!data) {
    return (
      <div className="card lottery-card">
        <div className="card-header">
          <h3>{type}</h3>
          <span className="tag pending">待开奖</span>
        </div>
        <div className="empty-state">暂无最新一期数据</div>
      </div>
    );
  }

  // 确保数据是数组
  const numbers = Array.isArray(data.winning_numbers) ? data.winning_numbers : [];
  const colors = Array.isArray(data.colors) ? data.colors : [];
  const zodiacs = Array.isArray(data.zodiac_signs) ? data.zodiac_signs : [];

  return (
    <div className="card lottery-card">
      <div className="card-header">
        <div className="title-row">
            <h3>{type}</h3>
            <span className="issue-tag">第 {data.issue_number} 期</span>
        </div>
        <div className="date-row">{data.drawing_date}</div>
      </div>

      <div className="balls-layout">
        {/* 前6个平码 */}
        <div className="normal-balls">
          {numbers.slice(0, 6).map((num, idx) => (
            <BallItem 
              key={idx} 
              num={num} 
              color={colors[idx]} 
              zodiac={zodiacs[idx]} 
            />
          ))}
        </div>

        {/* 加号 */}
        <div className="plus-sign">+</div>

        {/* 特码 */}
        <div className="special-ball">
          <BallItem 
            num={numbers[6]} 
            color={colors[6]} 
            zodiac={zodiacs[6]} 
            isSpecial={true}
          />
        </div>
      </div>
    </div>
  );
}

// 单个球组件
function BallItem({ num, color, zodiac, isSpecial }) {
  const colorClass = getColorClass(color);
  
  return (
    <div className={`ball-wrapper ${isSpecial ? 'special' : ''}`}>
      <div className={`lottery-ball ${colorClass}`}>
        {num}
      </div>
      <div className="ball-meta">
        <span className="zodiac">{zodiac || '-'}</span>
      </div>
    </div>
  );
}

// 颜色映射辅助函数
function getColorClass(colorName) {
  if (!colorName) return 'ball-grey';
  if (colorName.includes('红')) return 'ball-red';
  if (colorName.includes('绿')) return 'ball-green';
  if (colorName.includes('蓝')) return 'ball-blue';
  return 'ball-grey';
}

export default HomePage;