import { Navigate, Outlet, useLocation } from 'react-router';
import { useAuth } from '../context/AuthContext.jsx';
import { LoadingState } from './ui/Feedback.jsx';

export function ProtectedRoute({ children }) {
  const { user, ready } = useAuth();
  const location = useLocation();
  if (!ready) return <LoadingState label="Checking your session…" fullPage />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return children || <Outlet />;
}

export function GuestRoute() {
  const { user, ready } = useAuth();
  if (!ready) return <LoadingState label="Checking your session…" fullPage />;
  return user ? <Navigate to="/app/dashboard" replace /> : <Outlet />;
}
