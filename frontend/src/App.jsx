import { Navigate, Route, Routes } from 'react-router';
import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import { ProtectedRoute, GuestRoute } from './components/ProtectedRoute.jsx';
import { AppShell } from './components/layout/AppShell.jsx';
import { DashboardPage } from './pages/DashboardPage.jsx';
import { FarmsPage } from './pages/FarmsPage.jsx';
import { FarmDetailsPage } from './pages/FarmDetailsPage.jsx';
import { CropRecommendationPage } from './pages/CropRecommendationPage.jsx';
import { IrrigationPage } from './pages/IrrigationPage.jsx';
import { FertilizerPage } from './pages/FertilizerPage.jsx';
import { AuthPage } from './pages/AuthPage.jsx';
import { PlaceholderPage } from './pages/PlaceholderPage.jsx';
import { LoadingState } from './components/ui/Feedback.jsx';

function HomeRedirect() {
  const { user, ready } = useAuth();
  if (!ready) return <LoadingState label="Checking your session…" fullPage />;
  return <Navigate to={user ? '/app/dashboard' : '/login'} replace />;
}

const placeholders = [
  ['disease-detection', 'Disease detection', 'A guided leaf image workflow is planned for a later milestone.'],
  ['disease-risk', 'Disease risk', 'Review environmental conditions associated with crop disease risk.'],
  ['weather', 'Weather', 'See persisted farm weather and refresh conditions for your location.'],
  ['market', 'Market intelligence', 'Review crop market context and price signals.'],
  ['crop-ranking', 'Crop ranking', 'Compare suitable crops using agronomic and market context.'],
  ['evaluation', 'Farm evaluation', 'Bring farm recommendations together in one assessment.']
];

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<HomeRedirect />} />
      <Route element={<GuestRoute />}>
        <Route path="/login" element={<AuthPage mode="login" />} />
        <Route path="/register" element={<AuthPage mode="register" />} />
      </Route>
      <Route path="/app" element={<ProtectedRoute><AppShell /></ProtectedRoute>}>
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="farms" element={<FarmsPage />} />
        <Route path="farms/:farmId" element={<FarmDetailsPage />} />
        <Route path="crop-recommendation" element={<CropRecommendationPage />} />
        <Route path="irrigation" element={<IrrigationPage />} />
        <Route path="fertilizer" element={<FertilizerPage />} />
        {placeholders.map(([path, title, description]) => (
          <Route key={path} path={path} element={<PlaceholderPage title={title} description={description} />} />
        ))}
      </Route>
      <Route path="*" element={<HomeRedirect />} />
    </Routes>
  );
}

export default function App() {
  return <AuthProvider><AppRoutes /></AuthProvider>;
}
