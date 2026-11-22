import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

//router ya ttcl nyumban 
// const SERVER_IP = '192.168.100.205';

//hotsport ya samsung a016 dickson
// const SERVER_IP = '10.71.198.71';
// export const API_URL = `http://${SERVER_IP}:5000/api`;

export const API_URL = 'https://vifani-kikoba.onrender.com/api';

export const apiClient = axios.create({
  baseURL: API_URL,
  timeout: 20000,
  headers: {
    'Content-Type': 'application/json',
  },
});

apiClient.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem('userToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const config = error.config;
    if (!config || config._retryCount >= 2) {
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
