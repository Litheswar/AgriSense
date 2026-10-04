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
import { DiseaseDetectionPage } from './pages/DiseaseDetectionPage.jsx';
import { DiseaseRiskPage } from './pages/DiseaseRiskPage.jsx';
import { WeatherPage } from './pages/WeatherPage.jsx';
import { CropRankingPage } from './pages/CropRankingPage.jsx';
import { MarketPage } from './pages/MarketPage.jsx';
import { FarmEvaluationPage } from './pages/FarmEvaluationPage.jsx';
import { AuthPage } from './pages/AuthPage.jsx';
import { LoadingState } from './components/ui/Feedback.jsx';

function HomeRedirect() {
  const { user, ready } = useAuth();
  if (!ready) return <LoadingState label="Checking your session…" fullPage />;
  return <Navigate to={user ? '/app/dashboard' : '/login'} replace />;
}

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
        <Route path="disease-detection" element={<DiseaseDetectionPage />} />
        <Route path="disease-risk" element={<DiseaseRiskPage />} />
        <Route path="weather" element={<WeatherPage />} />
        <Route path="crop-ranking" element={<CropRankingPage />} />
        <Route path="market" element={<MarketPage />} />
        <Route path="evaluation" element={<FarmEvaluationPage />} />
      </Route>
      <Route path="*" element={<HomeRedirect />} />
    </Routes>
  );
}

export default function App() {
  return <AuthProvider><AppRoutes /></AuthProvider>;
}
