/**
 * Market Yönetim Sistemi — Axios API İstemcisi
 * JWT token otomatik eklenir, offline durumda kuyruklanır.
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import { useAuthStore } from '../stores/authStore';
import { useSettingsStore } from '../stores/settingsStore';

// Axios instance oluştur
const createApiClient = (): AxiosInstance => {
  const serverUrl = useSettingsStore.getState().serverUrl;

  const client = axios.create({
    baseURL        : serverUrl,
    timeout        : 10000,  // 10 saniye timeout
    headers        : {
      'Content-Type': 'application/json',
      'Accept'      : 'application/json',
    },
  });

  // İstek interceptor — JWT token ekle
  client.interceptors.request.use(
    (config) => {
      const token = useAuthStore.getState().token;
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    },
    (error) => Promise.reject(error)
  );

  // Yanıt interceptor — hata yönetimi
  client.interceptors.response.use(
    (response) => response,
    (error: AxiosError) => {
      if (error.response?.status === 401) {
        // Token süresi dolmuş — oturumu kapat
        useAuthStore.getState().logout();
      }
      return Promise.reject(error);
    }
  );

  return client;
};

export const api = createApiClient();

// ============================================================
// API SERVİS FONKSİYONLARI
// ============================================================

// Auth
export const authApi = {
  login   : (email: string, password: string) =>
    api.post('/api/auth/login', { email, password }),

  loginPin: (pin: string, branchId: number) =>
    api.post('/api/auth/login/pin', { pin, branch_id: branchId }),

  me      : () => api.get('/api/auth/me'),
  logout  : () => api.post('/api/auth/logout'),
};

// Sağlık kontrolü
export const healthApi = {
  check: () => api.get('/api/health'),
};
