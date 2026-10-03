const missingFieldLabels = {
  N: 'Soil nitrogen (N)',
  P: 'Soil phosphorus (P)',
  K: 'Soil potassium (K)',
  ph: 'Soil pH',
  temperature: 'Recorded temperature',
  humidity: 'Recorded humidity',
  rainfall: 'Recorded rainfall'
};

export function formatModelProbability(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'Unavailable';
  const percent = value * 100;
  const rounded = Math.round((percent + Math.max(1, Math.abs(percent)) * Number.EPSILON) * 10) / 10;
  return `${rounded.toFixed(1)}%`;
}

export function labelMissingField(field) {
  return missingFieldLabels[field] || field;
}

export function recommendationErrorMessage(error) {
  if (error?.status === 404) return 'This farm could not be found or is no longer available to your account.';
  if (error?.status === 503 || error?.code === 'TIMEOUT') return 'The AI recommendation service is temporarily unavailable. Please try again.';
  return error?.message || 'The recommendation could not be loaded. Please try again.';
}

export function missingRecommendationFields(error) {
  const fields = error?.payload?.error?.missingFields;
  return Array.isArray(fields) ? fields : [];
}

export function cropRecommendationPageMode({ loading, error, selectedFarm, selectedFarmId }) {
  if (loading) return 'loading';
  if (error) return 'farm-error';
  if (!selectedFarm || !selectedFarmId) return 'no-farm';
  return 'ready';
}

export function visibleCropRecommendation(result, selectedFarmId) {
  return result?.farmId === selectedFarmId ? result : null;
}

export function createRecommendationRequestTracker(initialFarmId = null) {
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
