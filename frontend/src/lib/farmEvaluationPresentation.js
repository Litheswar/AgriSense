const componentLabels = {
  cropRecommendation: 'Crop Recommendation',
  irrigation: 'Irrigation',
  fertilizer: 'Fertilizer',
  diseaseRisk: 'Disease Risk',
  market: 'Market Intelligence',
  cropRanking: 'Crop Ranking'
};

export function farmEvaluationPageMode({ loading, error, selectedFarm, selectedFarmId }) {
  if (loading) return 'loading';
  if (error) return 'farm-error';
  if (!selectedFarm || !selectedFarmId) return 'no-farm';
  return 'ready';
}

export function visibleFarmEvaluation(result, selectedFarmId) {
  return result?.farmId === selectedFarmId ? result : null;
}

export function evaluationComponents(result) {
  const recommendations = result?.recommendations;
  if (!recommendations || typeof recommendations !== 'object' || Array.isArray(recommendations)) return [];
  return Object.entries(componentLabels)
    .filter(([key]) => Object.prototype.hasOwnProperty.call(recommendations, key))
    .map(([key, label]) => ({ key, label, result: recommendations[key] }));
}

export function evaluationStatus(status) {
  if (status === 'SUCCESS') return { kind: 'success', label: 'Complete' };
  if (status === 'PARTIAL') return { kind: 'partial', label: 'Partial evaluation' };
  return { kind: 'unknown', label: typeof status === 'string' && status ? status.replaceAll('_', ' ').toLowerCase() : 'Status not returned' };
}

export function componentStatus(status) {
  const labels = {
    SUCCESS: ['success', 'Available'],
    UNAVAILABLE: ['unavailable', 'Data unavailable'],
    INSUFFICIENT_FARM_DATA: ['incomplete', 'Farm data needed'],
    PROVIDER_UNAVAILABLE: ['unavailable', 'Provider unavailable'],
    INSUFFICIENT_DEPENDENCY: ['incomplete', 'Required result unavailable'],
    INTERNAL_ERROR: ['error', 'Could not evaluate']
  };
  const [kind, label] = labels[status] || ['unknown', typeof status === 'string' && status ? status.replaceAll('_', ' ').toLowerCase() : 'Status not returned'];
  return { kind, label };
}

export function componentRecommendation(component) {
  const recommendation = component?.data?.recommendation;
  return recommendation && typeof recommendation === 'object' && !Array.isArray(recommendation) ? recommendation : null;
}

export function formatEvaluationValue(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : null;
  if (typeof value === 'string') return value;
  return null;
}

export function confidenceLabel(value) {
  return typeof value === 'number' && Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : null;
}

export function cropCandidates(recommendation) {
  return Array.isArray(recommendation?.top_3) ? recommendation.top_3.filter((candidate) => candidate && typeof candidate === 'object') : [];
}

export function rankedCropCandidates(recommendation) {
  return Array.isArray(recommendation?.ranked_crops) ? recommendation.ranked_crops.filter((candidate) => candidate && typeof candidate === 'object') : [];
}

export function marketProvenance(source) {
  if (typeof source !== 'string' || !source.trim()) return { kind: 'unknown', label: 'Source not returned' };
  const value = source.trim();
  if (value.toLowerCase() === 'local-fallback') return { kind: 'local', label: 'Local fallback data' };
  if (value.toLowerCase() === 'data.gov.in (live)') return { kind: 'live', label: 'Live data.gov.in' };
  return { kind: 'other', label: `Source: ${value}` };
}

export function componentWarnings(component, recommendation) {
  const warnings = [];
  if (typeof recommendation?.disclaimer === 'string' && recommendation.disclaimer.trim()) warnings.push(recommendation.disclaimer.trim());
  if (typeof recommendation?.risk_score_note === 'string' && recommendation.risk_score_note.trim()) warnings.push(recommendation.risk_score_note.trim());
  if (typeof recommendation?.caution === 'string' && recommendation.caution.trim()) warnings.push(recommendation.caution.trim());
  if (component?.key === 'market' && marketProvenance(recommendation?.raw_source).kind === 'local') {
    warnings.push('This result uses local fallback market data; it is not live Government market data.');
  }
  return [...new Set(warnings)];
}

export function componentError(component) {
  const error = component?.error;
  if (!error || typeof error !== 'object') return null;
  return {
    code: error.code || null,
    message: error.message || 'This component did not return a result.',
    missingFields: Array.isArray(error.missingFields) ? error.missingFields : []
  };
}

export function evaluationMissingFields(error) {
  const fields = error?.payload?.error?.missingFields;
  return Array.isArray(fields) ? fields : [];
}

export function evaluationErrorTitle(error) {
  if (error?.status === 401 || error?.code === 'UNAUTHENTICATED') return 'Sign in required';
  if (error?.code === 'INSUFFICIENT_FARM_DATA') return 'Farm information is incomplete';
  if (error?.status === 400 || error?.code === 'INVALID_FARM_ID') return 'Farm evaluation request is invalid';
  if (error?.status === 404 || error?.code === 'FARM_NOT_FOUND') return 'Farm unavailable';
  if (error?.status === 503 || ['TIMEOUT', 'PROVIDER_TIMEOUT', 'PROVIDER_UNAVAILABLE'].includes(error?.code)) return 'Evaluation service unavailable';
  return 'Farm evaluation could not be loaded';
}

export function evaluationErrorMessage(error) {
  if (error?.code === 'INSUFFICIENT_FARM_DATA') return error.message || 'Add the required Farm information, then run the evaluation again.';
  return error?.message || 'Farm evaluation could not be loaded. Please try again.';
}

export function createFarmEvaluationRequestTracker(initialFarmId = null) {
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
