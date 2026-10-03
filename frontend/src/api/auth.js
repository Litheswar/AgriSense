import { apiRequest } from './client.js';
export const authApi = {
  login: (credentials) => apiRequest('/auth/login', { method: 'POST', body: credentials }),
  register: (details) => apiRequest('/auth/register', { method: 'POST', body: details }),
  me: (options) => apiRequest('/auth/me', options)
};
