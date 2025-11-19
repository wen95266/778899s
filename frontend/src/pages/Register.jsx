
import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { registerUser } from '../services/api';

const Register = () => {
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (password.length < 6) {
      setError('密码长度至少6位');
      return;
    }

    const registrationData = { phone, password };

    // --- 在这里添加调试日志 ---
    console.log("即将发起注册请求...");
    console.log("请求方法: POST");
    console.log("请求URL: /api/user/register.php");
    console.log("请求数据:", registrationData);
    // --- 调试日志结束 ---

    try {
      // 这里的 registerUser 内部是 axios.post
      await registerUser(registrationData);
      setSuccess('注册成功！正在跳转到登录页面...');
      setTimeout(() => navigate('/login'), 2000);
    } catch (err) {
      // --- 在这里添加错误日志 ---
      console.error("注册请求失败:", err);
      if (err.response) {
        console.error("服务器响应状态:", err.response.status);
        console.error("服务器响应数据:", err.response.data);
      }
      // --- 错误日志结束 ---
      setError(err.response?.data?.error || '注册失败');
    }
  };

  return (
    <div className="container">
      <h1>注册</h1>
      <form className="auth-container" onSubmit={handleSubmit}>
        <input type="tel" placeholder="手机号" value={phone} onChange={(e) => setPhone(e.target.value)} required />
        <input type="password" placeholder="密码 (至少6位)" value={password} onChange={(e) => setPassword(e.target.value)} required />
        {error && <p style={{ color: 'red' }}>{error}</p>}
        {success && <p style={{ color: 'green' }}>{success}</p>}
        <button type="submit">注册</button>
        <p>已有账号？ <Link to="/login">返回登录</Link></p>
      </form>
    </div>
  );
};

export default Register;
