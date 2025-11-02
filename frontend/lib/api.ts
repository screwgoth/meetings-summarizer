import axios from 'axios';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

const api = axios.create({
  baseURL: API_BASE_URL,
});

// Add token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export interface LoginRequest {
  username: string;
  password: string;
}

export interface MeetingSession {
  id: string;
  title: string;
  filename: string;
  upload_date: string;
  status: string;
  transcription?: string;
  summary?: string;
  action_items?: string;
  duration?: string;
}

export const authAPI = {
  login: async (credentials: LoginRequest) => {
    const response = await api.post('/api/auth/login', credentials);
    return response.data;
  },
};

export const sessionsAPI = {
  getAll: async (): Promise<MeetingSession[]> => {
    const response = await api.get('/api/sessions');
    return response.data;
  },
  
  getOne: async (id: string): Promise<MeetingSession> => {
    const response = await api.get(`/api/sessions/${id}`);
    return response.data;
  },
  
  create: async (title: string, file: File): Promise<MeetingSession> => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('title', title);
    
    const response = await api.post('/api/sessions', formData, {
      params: { title },
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },
  
  process: async (id: string): Promise<MeetingSession> => {
    const response = await api.post(`/api/sessions/${id}/process`);
    return response.data;
  },
  
  delete: async (id: string): Promise<void> => {
    await api.delete(`/api/sessions/${id}`);
  },
};

export default api;