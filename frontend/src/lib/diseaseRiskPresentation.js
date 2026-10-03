const missingFieldLabels = {
  crop: 'Crop name',
  growth_stage: 'Crop growth stage',
  temperature: 'Temperature',
  humidity: 'Humidity',
  rainfall: 'Rainfall',
  recent_rainfall: 'Recent rainfall'
};

export function diseaseRiskPageMode({ loading, error, selectedFarm, selectedFarmId }) {
  if (loading) return 'loading';
  if (error) return 'farm-error';
  if (!selectedFarm || !selectedFarmId) return 'no-farm';
  return 'ready';
}

export function visibleDiseaseRiskResult(result, selectedFarmId) {
  return result?.farmId === selectedFarmId ? result : null;
}

export function diseaseRiskAssessmentPresentation(result) {
  const recommendation = result?.recommendation && typeof result.recommendation === 'object' ? result.recommendation : {};
  const engineInput = result?.engineInput && typeof result.engineInput === 'object' ? result.engineInput : {};
  const environmentalConditions = Object.fromEntries(
    ['temperature', 'humidity', 'rainfall', 'recent_rainfall']
      .filter((key) => engineInput[key] !== null && engineInput[key] !== undefined && engineInput[key] !== '')
      .map((key) => [key, engineInput[key]])
  );
  const signals = recommendation.signals && typeof recommendation.signals === 'object' && !Array.isArray(recommendation.signals) ? recommendation.signals : {};
  const reasoning = Array.isArray(recommendation.reasoning) ? recommendation.reasoning.filter((item) => typeof item === 'string') : [];
  return {
    riskLevel: typeof recommendation.risk_level === 'string' ? recommendation.risk_level : null,
    riskScore: typeof recommendation.risk_score === 'number' && Number.isFinite(recommendation.risk_score) ? recommendation.risk_score : null,
    riskScoreNote: typeof recommendation.risk_score_note === 'string' ? recommendation.risk_score_note : null,
    crop: typeof engineInput.crop === 'string' ? engineInput.crop : null,
    growthStage: typeof engineInput.growth_stage === 'string' ? engineInput.growth_stage : null,
    environmentalConditions,
    signals,
    reasoning,
    guidance: typeof recommendation.recommendation === 'string' ? recommendation.recommendation : null,
    disclaimer: typeof recommendation.disclaimer === 'string' ? recommendation.disclaimer : null
  };
}

export function missingDiseaseRiskFields(error) {
  const fields = error?.payload?.error?.missingFields;
  return Array.isArray(fields) ? fields : [];
}

export function labelDiseaseRiskField(field) {
  return missingFieldLabels[field] || field;
}

export function diseaseRiskErrorMessage(error) {
  if (error?.status === 404) return 'This Farm could not be found or is no longer available to your account.';
  if (error?.status === 401 || error?.code === 'UNAUTHENTICATED') return 'Your session may have expired. Sign in again to request a disease-risk assessment.';
  if (error?.status === 503 || error?.code === 'TIMEOUT' || error?.code === 'AUTH_NOT_CONFIGURED') return 'The disease-risk service is temporarily unavailable. Please try again.';
  return error?.message || 'The disease-risk assessment could not be loaded. Please try again.';
}

export function createDiseaseRiskRequestTracker(initialFarmId = null) {
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
