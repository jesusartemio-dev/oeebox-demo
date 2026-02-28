import axios from 'axios';
import { API_URL } from '../config';

const client = axios.create({
  baseURL: `${API_URL}/api`,
});

client.interceptors.request.use((config) => {
  const token = localStorage.getItem('oee_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

client.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('oee_token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default client;
