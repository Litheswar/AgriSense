import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { authApi } from '../api/auth.js';
import { clearToken, getToken, setToken } from '../api/client.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const resetSession = useCallback(() => {
    clearToken();
    window.sessionStorage.removeItem('agrisense.selected-farm');
    setUser(null);
    setReady(true);
  }, []);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    if (!getToken()) {
      setReady(true);
      return () => { active = false; controller.abort(); };
    }
    authApi.me({ signal: controller.signal })
      .then((result) => { if (active) setUser(result.user); })
      .catch((error) => { if (active && error.name !== 'AbortError') resetSession(); })
      .finally(() => { if (active) setReady(true); });
    return () => { active = false; controller.abort(); };
  }, [resetSession]);

  useEffect(() => {
    const handleUnauthorized = () => {
      resetSession();
      navigate('/login', { replace: true, state: { from: location.pathname, expired: true } });
    };
    window.addEventListener('agrisense:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('agrisense:unauthorized', handleUnauthorized);
  }, [location.pathname, navigate, resetSession]);

  const signIn = useCallback((result) => {
    setToken(result.token);
    setUser(result.user);
    setReady(true);
  }, []);
  const logout = useCallback(() => {
    resetSession();
    navigate('/login', { replace: true });
  }, [navigate, resetSession]);

  const value = useMemo(() => ({ user, ready, signIn, logout }), [user, ready, signIn, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
