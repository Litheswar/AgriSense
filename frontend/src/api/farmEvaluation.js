import { apiRequest } from './client.js';

export const farmEvaluationApi = {
  get: (farmId) => apiRequest(`/farms/${encodeURIComponent(farmId)}/evaluation`)
};
