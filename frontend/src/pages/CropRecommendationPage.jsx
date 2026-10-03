import { useEffect, useRef, useState } from 'react';
import { ArrowRight, BarChart3, Check, CloudRain, Droplets, Leaf, MapPin, Pencil, Sprout, Thermometer, Wind } from 'lucide-react';
import { Link } from 'react-router';
import { cropRecommendationApi } from '../api/cropRecommendation.js';
import { useFarms } from '../context/FarmContext.jsx';
import { Button } from '../components/ui/Button.jsx';
import { EmptyState, ErrorState, LoadingState } from '../components/ui/Feedback.jsx';
import { PageHeader } from '../components/ui/PageHeader.jsx';
import { createRecommendationRequestTracker, cropRecommendationPageMode, formatModelProbability, labelMissingField, missingRecommendationFields, recommendationErrorMessage, visibleCropRecommendation } from '../lib/cropRecommendationPresentation.js';

function recorded(value, suffix = '') {
  return typeof value === 'number' && Number.isFinite(value) ? `${Number.isInteger(value) ? value : value.toFixed(1)}${suffix}` : '—';
}

function FarmMetric({ label, value, icon: Icon }) {
  return <div className="crop-farm-metric"><span><Icon size={14} aria-hidden="true" />{label}</span><strong>{value}</strong></div>;
}

function Candidate({ candidate, index }) {
  const probability = candidate?.probability;
  const width = typeof probability === 'number' && Number.isFinite(probability) ? `${probability * 100}%` : '0%';
  return <li className="crop-candidate"><div className="crop-candidate__row"><span className="crop-candidate__rank">{index + 1}</span><strong>{candidate?.crop || 'Crop unavailable'}</strong><span className="crop-candidate__probability">{formatModelProbability(probability)}</span></div><div className="crop-candidate__track" role="img" aria-label={`${candidate?.crop || 'Candidate'} probability ${formatModelProbability(probability)}`}><span style={{ width }} /></div></li>;
}

export function CropRecommendationPage() {
  const { selectedFarm, selectedFarmId, loading: farmsLoading, error: farmsError, refreshFarms } = useFarms();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const requestTracker = useRef(createRecommendationRequestTracker(selectedFarmId));
  requestTracker.current.setFarmId(selectedFarmId);

  useEffect(() => {
    setResult(null);
    setError(null);
    setLoading(false);
  }, [selectedFarmId]);
  useEffect(() => {
    requestTracker.current.setFarmId(selectedFarmId);
    return () => requestTracker.current.setFarmId(null);
  }, []);

  async function requestRecommendation() {
    const requestedFarmId = selectedFarmId;
    const sequence = requestTracker.current.begin(requestedFarmId);
    if (sequence === null) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const response = await cropRecommendationApi.get(requestedFarmId);
      if (requestTracker.current.isCurrent(sequence, requestedFarmId)) setResult(response);
    } catch (requestError) {
      if (requestTracker.current.isCurrent(sequence, requestedFarmId)) setError({ farmId: requestedFarmId, cause: requestError });
    } finally {
      if (requestTracker.current.finish(sequence, requestedFarmId)) setLoading(false);
    }
  }

  const pageMode = cropRecommendationPageMode({ loading: farmsLoading, error: farmsError, selectedFarm, selectedFarmId });
  if (pageMode === 'loading') return <div className="crop-recommendation-page"><LoadingState label="Loading your selected farm…" /></div>;
  if (pageMode === 'farm-error') return <div className="crop-recommendation-page"><PageHeader eyebrow="AGRI INTELLIGENCE" title="Crop Recommendation" description="AI-powered crop recommendation based on your farm’s recorded data." /><ErrorState title="Your farms could not be loaded" message={farmsError} onRetry={refreshFarms} /></div>;
  if (pageMode === 'no-farm') return <div className="crop-recommendation-page"><PageHeader eyebrow="AGRI INTELLIGENCE" title="Crop Recommendation" description="AI-powered crop recommendation for your selected farm using its recorded soil and weather data." /><EmptyState title="Select a farm to get started" message="Create or select a farm with recorded soil and weather information before requesting a crop recommendation." action={<Link className="button button--primary" to="/app/farms">Manage your farms <ArrowRight size={16} /></Link>} /></div>;

  const location = [selectedFarm.location?.village, selectedFarm.location?.district, selectedFarm.location?.state].filter(Boolean).join(', ');
  const activeError = error?.farmId === selectedFarmId ? error.cause : null;
  const missingFields = missingRecommendationFields(activeError);
  const visibleResult = visibleCropRecommendation(result, selectedFarmId);
  const showResult = Boolean(visibleResult);
  const candidates = showResult && Array.isArray(visibleResult.recommendation?.top_3) ? visibleResult.recommendation.top_3 : [];

  return <div className="crop-recommendation-page">
    <PageHeader eyebrow="AGRI INTELLIGENCE" title="Crop Recommendation" description="AI-powered crop recommendation for your selected farm using its recorded soil and weather data." />

    <section className="crop-farm-panel" aria-labelledby="crop-farm-heading">
      <div className="crop-panel-heading"><span className="crop-section-icon"><Sprout size={17} /></span><div><span className="eyebrow">SELECTED FARM</span><h2 id="crop-farm-heading">{selectedFarm.name}</h2></div><span className="crop-farm-status"><Check size={13} /> ACTIVE</span></div>
      <div className="crop-farm-location"><MapPin size={15} /><span>{location || 'Location not recorded'}</span></div>
      <div className="crop-recorded-label"><span>RECORDED FARM DATA</span><span>From your saved farm record</span></div>
      <div className="crop-farm-metrics">
        <FarmMetric label="Nitrogen (N)" value={recorded(selectedFarm.soil?.nitrogen)} icon={Leaf} />
        <FarmMetric label="Phosphorus (P)" value={recorded(selectedFarm.soil?.phosphorus)} icon={Leaf} />
        <FarmMetric label="Potassium (K)" value={recorded(selectedFarm.soil?.potassium)} icon={Leaf} />
        <FarmMetric label="Soil pH" value={recorded(selectedFarm.soil?.ph)} icon={BarChart3} />
        <FarmMetric label="Temperature" value={recorded(selectedFarm.weather?.temperature, ' °C')} icon={Thermometer} />
        <FarmMetric label="Humidity" value={recorded(selectedFarm.weather?.humidity, '%')} icon={Wind} />
        <FarmMetric label="Rainfall" value={recorded(selectedFarm.weather?.rainfall, ' mm')} icon={CloudRain} />
      </div>
      <p className="crop-farm-note"><Droplets size={13} /> Weather values shown here are recorded in the farm data.</p>
    </section>

    <div className="crop-action-row"><Button onClick={requestRecommendation} disabled={loading || !selectedFarmId}><Sprout size={16} />{loading ? 'Analyzing farm data…' : showResult ? 'Get New Recommendation' : 'Get Recommendation'}</Button>{!loading && !showResult && <span>Uses the selected farm’s saved soil and weather values.</span>}</div>
    {loading && <div className="crop-loading-panel"><LoadingState label="Analyzing your farm data…" /><p>The recommendation is based on the selected farm’s recorded conditions.</p></div>}
    {activeError && missingFields.length > 0 && <section className="crop-missing-panel" role="alert"><div className="crop-message-icon"><BarChart3 size={18} /></div><div className="crop-message-content"><h2>More farm information is required</h2><p>Add the following recorded values before requesting a recommendation:</p><ul>{missingFields.map((field, index) => <li key={`${field}-${index}`}>{labelMissingField(field)}</li>)}</ul><Link className="button button--outline" to={`/app/farms/${encodeURIComponent(selectedFarmId)}`}><Pencil size={15} /> Edit Farm</Link></div></section>}
    {activeError && missingFields.length === 0 && <div className="crop-error-panel"><ErrorState title={activeError.status === 503 || activeError.code === 'TIMEOUT' ? 'Recommendation service unavailable' : activeError.status === 404 ? 'Farm unavailable' : 'Recommendation could not be loaded'} message={recommendationErrorMessage(activeError)} onRetry={requestRecommendation} /></div>}

    {showResult && <div className="crop-result-stack" aria-live="polite">
      <section className="crop-result-hero" aria-labelledby="crop-result-heading"><div className="crop-result-hero__top"><span className="crop-section-icon"><Sprout size={18} /></span><span className="eyebrow">AI RECOMMENDATION</span></div><span className="crop-result-kicker">RECOMMENDED CROP</span><h2 id="crop-result-heading">{visibleResult.recommendation?.predicted_crop || 'Recommendation unavailable'}</h2><div className="crop-result-hero__bottom"><div><small>CONFIDENCE</small><strong>{formatModelProbability(visibleResult.recommendation?.confidence)}</strong></div><div className="crop-result-farm"><span>FOR THIS FARM</span><strong>{visibleResult.farmName || 'Farm name unavailable'}</strong><small>Farm ID · {visibleResult.farmId}</small></div></div></section>
      <section className="crop-candidates-panel" aria-labelledby="crop-candidates-heading"><div className="crop-candidates-panel__heading"><div><span className="eyebrow">MODEL OUTPUT</span><h2 id="crop-candidates-heading">Top 3 candidates</h2></div><span className="crop-candidates-panel__note">Returned by the recommendation model</span></div>{candidates.length ? <ol className="crop-candidates">{candidates.map((candidate, index) => <Candidate key={`${candidate?.crop || 'candidate'}-${index}`} candidate={candidate} index={index} />)}</ol> : <p className="crop-no-candidates">No candidate details were returned.</p>}</section>
    </div>}
  </div>;
}
