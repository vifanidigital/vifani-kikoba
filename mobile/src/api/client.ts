import { create } from 'axios';
import { getProtectedItem, SESSION_TOKEN_KEY } from '../utils/protectedStorage';

export const API_URL = (process.env.EXPO_PUBLIC_API_URL?.trim() || 'https://vifani-kikoba.onrender.com/api').replace(/\/+$/, '');

export const apiClient = create({
  baseURL: API_URL,
  timeout: 45000,
  headers: {
    'Content-Type': 'application/json',
  },
});

apiClient.interceptors.request.use(async (config) => {
  if (config.url && (/^[a-z][a-z0-9+.-]*:/i.test(config.url) || /^(?:\/\/|\\)/.test(config.url))) throw new Error('Ombi la API linahitaji njia ya ndani.');
  if (!__DEV__ && !API_URL.startsWith('https://')) throw new Error('API ya uzalishaji inahitaji HTTPS.');
  // A retry must keep the group session used by the original request.
  if (config.headers.has('Authorization')) return config;
  const token = await getProtectedItem(SESSION_TOKEN_KEY);

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const config = error.config;
    if (!config || config.signal?.aborted || config.method?.toLowerCase() !== 'get' || config._retryCount >= 1) {
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
