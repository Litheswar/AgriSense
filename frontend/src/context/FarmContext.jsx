import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { farmsApi } from '../api/farms.js';
import { useAuth } from './AuthContext.jsx';

const FarmContext = createContext(null);
const SELECTED_FARM_KEY = 'agrisense.selected-farm';

export function FarmProvider({ children }) {
  const { user } = useAuth();
  const [farms, setFarms] = useState([]);
  const [selectedFarmId, setSelectedFarmIdState] = useState(() => window.sessionStorage.getItem(SELECTED_FARM_KEY) || '');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshVersion, setRefreshVersion] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    farmsApi.list()
      .then((result) => { if (active) setFarms(Array.isArray(result.farms) ? result.farms : []); })
      .catch((requestError) => { if (active) { setFarms([]); setError(requestError.message); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [user?.id, refreshVersion]);

  useEffect(() => {
    if (!farms.length) {
      setSelectedFarmIdState('');
      window.sessionStorage.removeItem(SELECTED_FARM_KEY);
      return;
    }
    if (!farms.some((farm) => farm._id === selectedFarmId)) setSelectedFarmId(farms[0]._id);
  }, [farms, selectedFarmId]);

  const setSelectedFarmId = useCallback((farmId) => {
    setSelectedFarmIdState(farmId);
    if (farmId) window.sessionStorage.setItem(SELECTED_FARM_KEY, farmId);
    else window.sessionStorage.removeItem(SELECTED_FARM_KEY);
  }, []);
  const refreshFarms = useCallback(() => setRefreshVersion((value) => value + 1), []);
  const selectedFarm = farms.find((farm) => farm._id === selectedFarmId) || null;
  const value = useMemo(() => ({ farms, selectedFarm, selectedFarmId, setSelectedFarmId, loading, error, refreshFarms }), [farms, selectedFarm, selectedFarmId, setSelectedFarmId, loading, error, refreshFarms]);
  return <FarmContext.Provider value={value}>{children}</FarmContext.Provider>;
}

export function useFarms() {
  const context = useContext(FarmContext);
  if (!context) throw new Error('useFarms must be used inside FarmProvider');
  return context;
}
