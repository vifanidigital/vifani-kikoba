import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const API_URL = 'https://onrender.com';

export const apiClient = axios.create({
  baseURL: API_URL,
  timeout: 45000,
  headers: {
    'Content-Type': 'application/json',
  },
});

apiClient.interceptors.request.use(async (config) => {
  const token =
    (await AsyncStorage.getItem('userToken')) ||
    (await AsyncStorage.getItem('token')) ||
    (await AsyncStorage.getItem('@vifani_token'));

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const config = error.config;
    if (!config || config.method?.toLowerCase() !== 'get' || config._retryCount >= 1) {
      return Promise.reject(error);
    }
    const isNetworkOrTimeout = !error.response || error.code === 'ECONNABORTED';
    if (isNetworkOrTimeout) {
      config._retryCount = (config._retryCount || 0) + 1;
      await new Promise((resolve) => setTimeout(resolve, 1500));
      return apiClient(config);
    }
    return Promise.reject(error);
  }
);
