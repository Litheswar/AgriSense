import { apiRequest } from './client.js';
export const fertilizerApi = { get: (farmId) => apiRequest(`/farms/${encodeURIComponent(farmId)}/fertilizer`) };
