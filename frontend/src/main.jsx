// 文件路径: frontend/src/main.jsx

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './assets/App.css'; // 引入全局CSS样式

/**
 * 获取HTML中的根节点，并启动React应用。
 * ReactDOM.createRoot 是React 18的推荐方式，用于初始化应用。
 */
ReactDOM.createRoot(document.getElementById('root')).render(
  // React.StrictMode 是一个辅助组件，用于在开发模式下检查潜在问题。
  <React.StrictMode>
    {/* 将App组件作为根组件进行渲染 */}
    <App />
  </React.StrictMode>,
);