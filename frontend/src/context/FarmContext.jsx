import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { farmsApi } from '../api/farms.js';
import { useAuth } from './AuthContext.jsx';
import { reconcileSelectedFarmId } from '../lib/farmSelection.js';

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
    const nextId = reconcileSelectedFarmId({ farms, selectedFarmId, loading, error });
    if (nextId === selectedFarmId) return;
    setSelectedFarmIdState(nextId);
    if (nextId) window.sessionStorage.setItem(SELECTED_FARM_KEY, nextId);
    else window.sessionStorage.removeItem(SELECTED_FARM_KEY);
  }, [farms, selectedFarmId, loading, error]);

  const setSelectedFarmId = useCallback((farmId) => {
    setSelectedFarmIdState(farmId);
    if (farmId) window.sessionStorage.setItem(SELECTED_FARM_KEY, farmId);
    else window.sessionStorage.removeItem(SELECTED_FARM_KEY);
  }, []);
  const refreshFarms = useCallback(() => setRefreshVersion((value) => value + 1), []);
  const createFarm = useCallback(async (farmData) => {
    const response = await farmsApi.create(farmData);
    if (response?.farm) {
      setFarms((current) => [response.farm, ...current.filter((farm) => farm._id !== response.farm._id)]);
      setSelectedFarmId(response.farm._id);
    }
    return response?.farm;
  }, [setSelectedFarmId]);
  const updateFarm = useCallback(async (farmId, changes) => {
    try {
      const response = await farmsApi.update(farmId, changes);
      if (response?.farm) setFarms((current) => current.map((farm) => farm._id === farmId ? response.farm : farm));
      return response?.farm;
    } catch (requestError) {
      if (requestError.status === 404) refreshFarms();
      throw requestError;
    }
  }, [refreshFarms]);
  const deleteFarm = useCallback(async (farmId) => {
    try {
      const response = await farmsApi.remove(farmId);
      const next = farms.filter((farm) => farm._id !== farmId);
      setFarms(next);
      if (selectedFarmId === farmId) setSelectedFarmId(next[0]?._id || '');
      return response;
    } catch (requestError) {
      if (requestError.status === 404) refreshFarms();
      throw requestError;
    }
  }, [farms, refreshFarms, selectedFarmId, setSelectedFarmId]);
  const selectedFarm = farms.find((farm) => farm._id === selectedFarmId) || null;
  const value = useMemo(() => ({ farms, selectedFarm, selectedFarmId, setSelectedFarmId, loading, error, createFarm, updateFarm, deleteFarm, refreshFarms }), [farms, selectedFarm, selectedFarmId, setSelectedFarmId, loading, error, createFarm, updateFarm, deleteFarm, refreshFarms]);
  return <FarmContext.Provider value={value}>{children}</FarmContext.Provider>;
}

export function useFarms() {
  const context = useContext(FarmContext);
  if (!context) throw new Error('useFarms must be used inside FarmProvider');
  return context;
}
