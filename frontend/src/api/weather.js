import { apiRequest } from './client.js';
export const weatherApi = {
  get: (farmId) => apiRequest(`/farms/${encodeURIComponent(farmId)}/weather`),
  refresh: (farmId) => apiRequest(`/farms/${encodeURIComponent(farmId)}/weather/refresh`, { method: 'POST' })
};
