export const dashboardModules = [
  { key: 'cropRecommendation', label: 'Crop Recommendation', path: '/app/crop-recommendation', description: 'Review crop predictions and candidates.' },
  { key: 'irrigation', label: 'Irrigation', path: '/app/irrigation', description: 'Check irrigation guidance for this Farm.' },
  { key: 'fertilizer', label: 'Fertilizer', path: '/app/fertilizer', description: 'Review nutrient classifications and guidance.' },
  { key: 'diseaseDetection', label: 'Disease Detection', path: '/app/disease-detection', description: 'Analyze a leaf image when you are ready.' },
  { key: 'diseaseRisk', label: 'Disease Risk', path: '/app/disease-risk', description: 'Review environmental disease risk signals.' },
  { key: 'cropRanking', label: 'Crop Ranking', path: '/app/crop-ranking', description: 'Compare returned crop candidates.' },
  { key: 'market', label: 'Market Intelligence', path: '/app/market', description: 'Review returned market prices and trends.' },
  { key: 'evaluation', label: 'Farm Evaluation', path: '/app/evaluation', description: 'Open the combined decision-support overview.' }
];

export function dashboardValue(value, suffix = '') {
  return typeof value === 'number' && Number.isFinite(value) ? `${value}${suffix}` : 'Not recorded';
}

export function dashboardTimestamp(value) {
  if (!value) return null;
  const timestamp = new Date(value);
  return Number.isNaN(timestamp.getTime()) ? null : timestamp.toLocaleString();
}

export function dashboardDate(value) {
  if (!value) return null;
  const timestamp = new Date(value);
  return Number.isNaN(timestamp.getTime()) ? null : timestamp.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function dashboardWeatherProvenance(weather) {
  return {
    source: typeof weather?.source === 'string' && weather.source.trim() ? weather.source.trim() : null,
    recordedAt: dashboardTimestamp(weather?.recordedAt),
    fetchedAt: dashboardTimestamp(weather?.fetchedAt)
  };
}
