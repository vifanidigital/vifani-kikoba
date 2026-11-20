import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SERVER_IP = '192.168.100.205';
export const API_URL = `http://${SERVER_IP}:5000/api`;

export const apiClient = axios.create({
  baseURL: API_URL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
});

apiClient.interceptors.request.use(
  async (config) => {
    const token = await AsyncStorage.getItem('vifani_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);