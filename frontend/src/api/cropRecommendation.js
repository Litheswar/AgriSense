import { apiRequest } from './client.js';
export const cropRecommendationApi = { get: (farmId) => apiRequest(`/farms/${encodeURIComponent(farmId)}/crop-recommendation`) };
