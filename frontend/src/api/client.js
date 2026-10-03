const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api').replace(/\/$/, '');
const TOKEN_KEY = 'agrisense.session.token';

export class ApiError extends Error {
  constructor(message, status, code, payload) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.payload = payload;
  }
}

export function getToken() {
  return typeof window === 'undefined' ? null : window.sessionStorage.getItem(TOKEN_KEY);
}
export function setToken(token) {
  if (typeof window !== 'undefined') window.sessionStorage.setItem(TOKEN_KEY, token);
}
export function clearToken() {
  if (typeof window !== 'undefined') window.sessionStorage.removeItem(TOKEN_KEY);
}

export async function apiRequest(path, { method = 'GET', body, headers = {}, signal } = {}) {
  const token = getToken();
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
  const requestHeaders = { Accept: 'application/json', ...headers };
  if (token) requestHeaders.Authorization = `Bearer ${token}`;
  if (body !== undefined && !isForm) requestHeaders['Content-Type'] = 'application/json';

  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers: requestHeaders,
      body: body === undefined ? undefined : (isForm ? body : JSON.stringify(body)),
      credentials: 'omit',
      signal
    });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new ApiError('Could not connect to AgriSense. Check that the API is running and try again.', 0, 'NETWORK_ERROR');
  }

  if (response.status === 204) return null;
  const contentType = response.headers.get('content-type') || '';
  let payload;
  try { payload = contentType.includes('application/json') ? await response.json() : await response.text(); }
  catch { payload = null; }
  if (!response.ok) {
    if (response.status === 401 && token && typeof window !== 'undefined') window.dispatchEvent(new Event('agrisense:unauthorized'));
    const error = payload && typeof payload === 'object' ? payload.error : null;
    throw new ApiError(error?.message || `The request could not be completed (${response.status}).`, response.status, error?.code || 'REQUEST_FAILED', payload);
  }
  return payload;
}

export { API_BASE_URL };
