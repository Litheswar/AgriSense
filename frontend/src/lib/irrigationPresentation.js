const missingFieldLabels = {
  crop: 'Crop name',
  growth_stage: 'Crop growth stage',
  soil_moisture: 'Soil moisture',
  temperature: 'Recorded temperature',
  humidity: 'Recorded humidity',
  rain_probability: 'Rain probability',
  expected_rainfall: 'Expected rainfall'
};

export function irrigationPageMode({ loading, error, selectedFarm, selectedFarmId }) {
  if (loading) return 'loading';
  if (error) return 'farm-error';
  if (!selectedFarm || !selectedFarmId) return 'no-farm';
  return 'ready';
}

export function visibleIrrigationResult(result, selectedFarmId) {
  return result?.farmId === selectedFarmId ? result : null;
}

export function missingIrrigationFields(error) {
  const fields = error?.payload?.error?.missingFields;
  return Array.isArray(fields) ? fields : [];
}

export function labelIrrigationField(field) {
  return missingFieldLabels[field] || field;
}

export function irrigationErrorMessage(error) {
  if (error?.status === 404) return 'This farm could not be found or is no longer available to your account.';
  if (error?.status === 503 || error?.code === 'TIMEOUT') return 'The irrigation recommendation service is temporarily unavailable. Please try again.';
  return error?.message || 'The irrigation recommendation could not be loaded. Please try again.';
}

export function createIrrigationRequestTracker(initialFarmId = null) {
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
