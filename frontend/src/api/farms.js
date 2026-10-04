import { apiRequest } from './client.js';
const idPath = (farmId, suffix = '') => `/farms/${encodeURIComponent(farmId)}${suffix}`;
export const farmsApi = {
  list: () => apiRequest('/farms'),
  get: (farmId) => apiRequest(idPath(farmId)),
  create: (farm) => apiRequest('/farms', { method: 'POST', body: farm }),
  update: (farmId, changes) => apiRequest(idPath(farmId), { method: 'PATCH', body: changes }),
  replace: (farmId, farm) => apiRequest(idPath(farmId), { method: 'PUT', body: farm }),
  remove: (farmId) => apiRequest(idPath(farmId), { method: 'DELETE' }),
  sharedState: (farmId) => apiRequest(idPath(farmId, '/shared-state'))
};
