import { apiRequest } from './client.js';

export const cropRankingApi = {
  get: (farmId) => apiRequest(`/farms/${encodeURIComponent(farmId)}/crop-ranking`)
};
