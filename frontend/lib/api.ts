import axios from 'axios';

// Determine API URL based on environment
const getAPIBaseURL = () => {
  // Build-time env var takes precedence
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL;
  }
  
  // Runtime detection for browser
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    // If accessing via IP, use that IP for API
    if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
      return `http://${hostname}:8000`;
    }
  }
  
  // Fallback
  return 'http://localhost:8000';
};

const API_BASE_URL = getAPIBaseURL();

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

export interface LoginResponse {
  access_token: string;
  token_type: string;
  requires_password_change: boolean;
  is_admin: boolean;
}

export interface UserProfile {
  username: string;
  email?: string | null;
  full_name?: string | null;
  is_admin: boolean;
  must_change_password: boolean;
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
  sentiment_analysis?: string;
  duration?: string;
  error?: string;
}

export const authAPI = {
  login: async (credentials: LoginRequest): Promise<LoginResponse> => {
    const response = await api.post('/api/auth/login', credentials);
    return response.data;
  },
};

export const usersAPI = {
  getProfile: async (): Promise<UserProfile> => {
    const response = await api.get('/api/users/me');
    return response.data;
  },
  updateProfile: async (payload: { email?: string | null; full_name?: string | null }): Promise<UserProfile> => {
    const response = await api.put('/api/users/me', payload);
    return response.data;
  },
  changePassword: async (payload: { current_password: string; new_password: string }): Promise<{ message: string; requires_logout: boolean }> => {
    const response = await api.post('/api/users/me/change-password', payload);
    return response.data;
  },
};

export interface AWSCredentials {
  aws_access_key_id?: string | null;
  aws_secret_access_key?: string | null;
  aws_region?: string | null;
  s3_bucket_name?: string | null;
  bedrock_bearer_token?: string | null;
}

export interface AWSCredentialsResponse {
  aws_access_key_id?: string | null;
  aws_secret_access_key_masked?: string | null;
  aws_region?: string | null;
  s3_bucket_name?: string | null;
  bedrock_bearer_token?: string | null;
  is_configured: boolean;
}

export const adminAPI = {
  listUsers: async () => {
    const response = await api.get('/api/admin/users');
    return response.data as Array<{
      username: string;
      email?: string | null;
      full_name?: string | null;
      is_admin: boolean;
      must_change_password: boolean;
    }>;
  },
  createUser: async (payload: { username: string; email?: string | null; password: string; full_name?: string | null; is_admin?: boolean }) => {
    const response = await api.post('/api/admin/users', payload);
    return response.data;
  },
  getAWSCredentials: async (): Promise<AWSCredentialsResponse> => {
    const response = await api.get('/api/admin/aws-credentials');
    return response.data;
  },
  updateAWSCredentials: async (payload: AWSCredentials): Promise<{ message: string }> => {
    const response = await api.put('/api/admin/aws-credentials', payload);
    return response.data;
  },
  testAWSCredentials: async (): Promise<{ success: boolean; message: string }> => {
    const response = await api.post('/api/admin/aws-credentials/test');
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
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  process: async (id: string): Promise<MeetingSession> => {
    const response = await api.post(`/api/sessions/${id}/process`);
    return response.data;
  },

  stop: async (id: string, stage: 'transcription' | 'analysis'): Promise<MeetingSession> => {
    const response = await api.post(`/api/sessions/${id}/stop`, { stage });
    return response.data;
  },

  restart: async (id: string, stage: 'transcription' | 'analysis'): Promise<MeetingSession> => {
    const response = await api.post(`/api/sessions/${id}/restart`, { stage });
    return response.data;
  },

  getSpeakerLabels: async (id: string) => {
    const response = await api.get(`/api/sessions/${id}/speakers`);
    return response.data as { labels: string[]; current_mappings: Record<string, string> };
  },

  renameSpeakers: async (
    id: string,
    mapping: Record<string, string>,
  ): Promise<MeetingSession> => {
    const response = await api.patch(`/api/sessions/${id}/speakers`, { mapping });
    return response.data;
  },

  delete: async (id: string): Promise<void> => {
    await api.delete(`/api/sessions/${id}`);
  },
};

export default api;