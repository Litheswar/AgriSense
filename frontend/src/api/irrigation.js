import { apiRequest } from './client.js';
export const irrigationApi = { get: (farmId) => apiRequest(`/farms/${encodeURIComponent(farmId)}/irrigation`) };
