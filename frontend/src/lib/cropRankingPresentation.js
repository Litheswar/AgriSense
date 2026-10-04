export function cropRankingPageMode({ loading, error, selectedFarm, selectedFarmId }) {
  if (loading) return 'loading';
  if (error) return 'farm-error';
  if (!selectedFarm || !selectedFarmId) return 'no-farm';
  return 'ready';
}

export function visibleCropRanking(result, selectedFarmId) {
  return result?.farmId === selectedFarmId ? result : null;
}

export function rankingCandidates(recommendation) {
  return Array.isArray(recommendation?.ranked_crops) ? recommendation.ranked_crops : [];
}

export function topRankedCrop(recommendation) {
  return rankingCandidates(recommendation).find((candidate) => candidate?.rank === 1) || null;
}

export function rankingCandidateSignals(candidate) {
  return [
    { key: 'agronomic_signal', label: 'Agronomic recommendation signal', value: candidate?.agronomic_signal },
    { key: 'market_signal', label: 'Market signal', value: candidate?.market_signal },
    { key: 'combined_score', label: 'Combined ranking score', value: candidate?.combined_score }
  ].filter((signal) => typeof signal.value === 'number' && Number.isFinite(signal.value));
}

export function formatRankingScore(value) {
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : 'Not returned';
}

export function cropRankingMarketProvenance(source) {
  if (typeof source !== 'string' || !source.trim()) return { kind: 'unknown', label: 'Market source not returned' };
  const normalized = source.trim().toLowerCase();
  if (normalized === 'local-fallback') return { kind: 'local-fallback', label: 'Local fallback market data' };
  if (normalized === 'data.gov.in (live)') return { kind: 'government-live', label: 'Live Government market data (data.gov.in)' };
  return { kind: 'other', label: `Market source: ${source.trim()}` };
}

export function hasLocalFallbackMarketData(candidates) {
  return rankingCandidates({ ranked_crops: candidates }).some((candidate) => cropRankingMarketProvenance(candidate?.market_source).kind === 'local-fallback');
}

export function cropRankingFallbackMessage(recommendation) {
  if (hasLocalFallbackMarketData(rankingCandidates(recommendation))) {
    return 'Market signal uses local fallback test data. Government market API verification is currently unavailable.';
  }
  if (recommendation?.missing_market_data_policy === 'FALLBACK_AGRONOMIC_PRIMARY') {
    return 'Where no market signal was returned, the backend ranked that candidate using its agronomic signal alone.';
  }
  return null;
}

export function missingCropRankingFields(error) {
  const fields = error?.payload?.error?.missingFields;
  return Array.isArray(fields) ? fields : [];
}

const missingFieldLabels = {
  N: 'Soil nitrogen (N)',
  P: 'Soil phosphorus (P)',
  K: 'Soil potassium (K)',
  ph: 'Soil pH',
  temperature: 'Recorded temperature',
  humidity: 'Recorded humidity',
  rainfall: 'Recorded rainfall'
};

export function labelCropRankingField(field) {
  return missingFieldLabels[field] || field;
}

export function cropRankingErrorTitle(error) {
  if (error?.status === 401 || error?.code === 'UNAUTHENTICATED') return 'Sign in required';
  if (error?.status === 404 || error?.code === 'FARM_NOT_FOUND') return 'Farm unavailable';
  if (error?.status === 503 || ['TIMEOUT', 'PROVIDER_TIMEOUT', 'PROVIDER_UNAVAILABLE'].includes(error?.code)) return 'Ranking service unavailable';
  if (['MARKET_PROVIDER_UNAVAILABLE', 'WEATHER_PROVIDER_UNAVAILABLE'].includes(error?.code)) return 'A ranking dependency is unavailable';
  if (error?.code === 'CROP_RECOMMENDATION_UNAVAILABLE') return 'Crop Recommendation input unavailable';
  return 'Crop ranking could not be loaded';
}

export function cropRankingErrorMessage(error) {
  if (error?.status === 401 || error?.code === 'UNAUTHENTICATED') return error.message || 'Authentication is required. Sign in again to request a crop ranking.';
  if (error?.status === 404 || error?.code === 'FARM_NOT_FOUND') return error.message || 'This Farm could not be found or is no longer available to your account.';
  if (error?.code === 'CROP_RECOMMENDATION_UNAVAILABLE') return error.message || 'Crop Ranking needs a successful Crop Recommendation result as input.';
  if (error?.code === 'MARKET_PROVIDER_UNAVAILABLE' || error?.code === 'PROVIDER_UNAVAILABLE') return error.message || 'A ranking dependency is temporarily unavailable. Please try again.';
  if (error?.status === 503 || ['TIMEOUT', 'PROVIDER_TIMEOUT'].includes(error?.code)) return error.message || 'The ranking service is temporarily unavailable. Please try again.';
  return error?.message || 'The crop ranking could not be loaded. Please try again.';
}

export function createCropRankingRequestTracker(initialFarmId = null) {
  let farmId = initialFarmId;
  let sequence = 0;
  let inFlightFarmId = null;
  return {
    setFarmId(nextFarmId) {
      if (nextFarmId !== farmId) {
        farmId = nextFarmId;
        sequence += 1;
        inFlightFarmId = null;
      }
    },
    begin(requestedFarmId) {
      if (!requestedFarmId || requestedFarmId !== farmId || inFlightFarmId === requestedFarmId) return null;
      sequence += 1;
      inFlightFarmId = requestedFarmId;
      return sequence;
    },
    isCurrent(requestId, requestedFarmId) {
      return requestId === sequence && requestedFarmId === farmId;
    },
    finish(requestId, requestedFarmId) {
      if (!this.isCurrent(requestId, requestedFarmId)) return false;
      inFlightFarmId = null;
      return true;
    }
  };
}
