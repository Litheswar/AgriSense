import { apiRequest } from './client.js';
export const diseaseApi = {
  risk: (farmId) => apiRequest(`/farms/${encodeURIComponent(farmId)}/disease-risk`),
  upload: (image, farmId) => {
    const body = new FormData();
    body.append('image', image);
    if (farmId) body.append('farmId', farmId);
    return apiRequest('/ai/disease-detection/upload', { method: 'POST', body });
  }
};
