export function marketPageMode({ loading, error, selectedFarm, selectedFarmId }) {
  if (loading) return 'loading';
  if (error) return 'farm-error';
  if (!selectedFarm || !selectedFarmId) return 'no-farm';
  return 'ready';
}

export function visibleMarketResult(result, selectedFarmId) {
  return result?.farmId === selectedFarmId ? result : null;
}

export function marketRecommendation(result) {
  return result?.recommendation && typeof result.recommendation === 'object' ? result.recommendation : null;
}

export function marketSource(source) {
  if (typeof source !== 'string' || !source.trim()) return { kind: 'unknown', label: 'Source not returned' };
  const value = source.trim();
  if (value.toLowerCase() === 'local-fallback') return { kind: 'local', label: 'Local fallback data' };
  if (value.toLowerCase() === 'data.gov.in (live)') return { kind: 'live', label: 'Live data.gov.in' };
  return { kind: 'other', label: `Source: ${value}` };
}

export function marketPriceRange(recommendation) {
  const range = recommendation?.price_range;
  if (!range || typeof range !== 'object') return null;
  return ['min_price', 'modal_price', 'max_price'].every((key) => Number.isFinite(range[key])) ? range : null;
}

export function marketErrorTitle(error) {
  if (error?.status === 401 || error?.code === 'UNAUTHENTICATED') return 'Sign in required';
  if (error?.status === 404 || error?.code === 'FARM_NOT_FOUND') return 'Farm unavailable';
  if (error?.status === 503 || ['TIMEOUT', 'PROVIDER_TIMEOUT', 'PROVIDER_UNAVAILABLE', 'MARKET_PROVIDER_UNAVAILABLE'].includes(error?.code)) return 'Market service unavailable';
  if (error?.code === 'INSUFFICIENT_FARM_DATA') return 'Crop information is required';
  return 'Market intelligence could not be loaded';
}

export function marketErrorMessage(error) {
  if (error?.code === 'INSUFFICIENT_FARM_DATA') return 'Add a crop name to this Farm before requesting market intelligence.';
  return error?.message || 'Market intelligence could not be loaded. Please try again.';
}

export function createMarketRequestTracker(initialFarmId = null) {
  let farmId = initialFarmId;
  let sequence = 0;
  let inFlightFarmId = null;
  return {
    setFarmId(nextFarmId) {
      if (nextFarmId !== farmId) { farmId = nextFarmId; sequence += 1; inFlightFarmId = null; }
    },
    begin(requestedFarmId) {
      if (!requestedFarmId || requestedFarmId !== farmId || inFlightFarmId === requestedFarmId) return null;
      inFlightFarmId = requestedFarmId;
      return ++sequence;
    },
    isCurrent(requestId, requestedFarmId) { return requestId === sequence && requestedFarmId === farmId; },
    finish(requestId, requestedFarmId) {
      if (!this.isCurrent(requestId, requestedFarmId)) return false;
      inFlightFarmId = null;
      return true;
    }
  };
}
