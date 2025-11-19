// 文件路径: frontend/src/App.jsx

import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import Login from './pages/Login';
import Register from './pages/Register';
import GameTable from './pages/GameTable';
import ProtectedRoute from './components/ProtectedRoute';

/**
 * 应用的主组件，负责设置路由规则。
 */
function App() {
  return (
    // BrowserRouter 提供了客户端路由能力
    <BrowserRouter>
      {/* Routes 组件包裹了所有的路由规则 */}
      <Routes>
        {/* 当URL是 /login 时，渲染Login页面 */}
        <Route path="/login" element={<Login />} />
        
        {/* 当URL是 /register 时，渲染Register页面 */}
        <Route path="/register" element={<Register />} />
        
        {/* 
          当URL是根路径 / 时，渲染Home页面。
          ProtectedRoute 组件会先检查用户是否已登录，
          如果未登录，会自动重定向到 /login 页面。
        */}
        <Route 
          path="/" 
          element={
            <ProtectedRoute>
              <Home />
            </ProtectedRoute>
          } 
        />
        
        {/* 
          当URL匹配 /game/:score 模式时（如 /game/2, /game/10），渲染GameTable页面。
          :score 是一个动态参数，可以在GameTable组件中获取。
          这个路由同样受 ProtectedRoute 保护。
        */}
        <Route 
          path="/game/:score" 
          element={
            <ProtectedRoute>
              <GameTable />
            </ProtectedRoute>
          } 
        />
      </Routes>
    </BrowserRouter>
  );
}

// 导出App组件，以便在其他文件中使用
export default App;