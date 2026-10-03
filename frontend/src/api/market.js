import { apiRequest } from './client.js';
export const marketApi = { get: (farmId) => apiRequest(`/farms/${encodeURIComponent(farmId)}/market`) };
