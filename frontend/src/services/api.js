
import axios from 'axios';

// --- Axios 实例配置 ---

const API_BASE_URL = 'https://9526.ip-ddns.com/api.php';

// 创建一个公共的 axios 实例
const apiClient = axios.create({
  baseURL: API_BASE_URL,
});

// 添加请求拦截器，在每个请求头中自动附加 Authorization Token
apiClient.interceptors.request.use(
  config => {
    const token = localStorage.getItem('authToken');
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }
    return config;
  },
  error => {
    return Promise.reject(error);
  }
);

// --- API 服务函数 ---

// 封装错误处理
const handleRequest = async (request) => {
  try {
    const response = await request();
    return response.data;
  } catch (error) {
    // 返回一个统一的错误结构
    return Promise.reject(error.response?.data || { success: false, message: '网络错误或服务器无响应' });
  }
};

// --- 用户认证 API ---

export const login = (phoneNumber, password) => {
  return handleRequest(() => apiClient.post('/user/login', { phone_number: phoneNumber, password }));
};

export const register = (phoneNumber, password) => {
  return handleRequest(() => apiClient.post('/user/register', { phone_number: phoneNumber, password }));
};

export const getCurrentUser = () => {
  return handleRequest(() => apiClient.get('/user/me'));
};

// --- 用户操作 API ---

export const searchUserByPhone = (phoneNumber) => {
  return handleRequest(() => apiClient.post('/user/search', { phone_number: phoneNumber }));
};

export const transferPoints = (receiverPublicId, amount) => {
  return handleRequest(() => apiClient.post('/user/transfer', { receiver_public_id: receiverPublicId, amount }));
};

// --- 游戏 API ---

export const dealNewGame = () => {
  return handleRequest(() => apiClient.get('/game/deal'));
};

export const compareHands = (playerSorted) => {
  return handleRequest(() => apiClient.post('/game/compare', { playerSorted }));
};

