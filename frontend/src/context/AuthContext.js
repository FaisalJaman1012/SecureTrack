import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const AuthContext = createContext(null);

// Axios instance with JWT interceptor
const api = axios.create({ baseURL: '' });

let refreshPromise = null;

api.interceptors.request.use(cfg => {
  const token = localStorage.getItem('accessToken');
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

api.interceptors.response.use(
  r => r,
  async err => {
    const original = err.config;
    if (err.response?.status === 401 && err.response?.data?.code === 'TOKEN_EXPIRED' && !original._retry) {
      original._retry = true;
      if (!refreshPromise) {
        refreshPromise = axios.post('/api/auth/refresh', { refreshToken: localStorage.getItem('refreshToken') })
          .then(r => {
            localStorage.setItem('accessToken', r.data.accessToken);
            localStorage.setItem('refreshToken', r.data.refreshToken);
            refreshPromise = null;
            return r.data.accessToken;
          })
          .catch(() => {
            refreshPromise = null;
            localStorage.clear();
            window.location.href = '/';
          });
      }
      const newToken = await refreshPromise;
      if (newToken) {
        original.headers.Authorization = `Bearer ${newToken}`;
        return api(original);
      }
    }
    return Promise.reject(err);
  }
);

export { api };

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadUser = useCallback(async () => {
    const token = localStorage.getItem('accessToken');
    if (!token) { setLoading(false); return; }
    try {
      const r = await api.get('/api/auth/me');
      setUser(r.data);
    } catch {
      localStorage.clear();
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadUser(); }, [loadUser]);

  const login = async (username, password) => {
    const r = await api.post('/api/auth/login', { username, password });
    localStorage.setItem('accessToken', r.data.accessToken);
    localStorage.setItem('refreshToken', r.data.refreshToken);
    setUser(r.data.user);
    return r.data.user;
  };

  const logout = async () => {
    try { await api.post('/api/auth/logout', { refreshToken: localStorage.getItem('refreshToken') }); } catch {}
    localStorage.clear();
    setUser(null);
  };

  const can = (action) => {
    if (!user) return false;
    const perms = {
      admin: ['create', 'read', 'update', 'delete', 'manage_users', 'view_logs'],
      engineer: ['create', 'read', 'update'],
      viewer: ['read'],
    };
    return perms[user.role]?.includes(action) ?? false;
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, can }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
