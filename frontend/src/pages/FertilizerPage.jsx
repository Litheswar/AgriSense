import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, ArrowRight, Check, FlaskConical, Leaf, MapPin, Pencil, Sprout } from 'lucide-react';
import { Link } from 'react-router';
import { fertilizerApi } from '../api/fertilizer.js';
import { useFarms } from '../context/FarmContext.jsx';
import { Button } from '../components/ui/Button.jsx';
import { EmptyState, ErrorState, LoadingState } from '../components/ui/Feedback.jsx';
import { PageHeader } from '../components/ui/PageHeader.jsx';
import { createFertilizerRequestTracker, fertilizerErrorMessage, fertilizerPageMode, labelFertilizerField, missingFertilizerFields, visibleFertilizerResult } from '../lib/fertilizerPresentation.js';

function recorded(value) {
  return typeof value === 'number' && Number.isFinite(value) ? (Number.isInteger(value) ? value : value.toFixed(1)) : '—';
}

function NutrientStatus({ nutrient, status }) {
  const safeStatus = ['low', 'adequate', 'high'].includes(status) ? status : 'unknown';
  return <div className={`fertilizer-nutrient fertilizer-nutrient--${safeStatus}`}>
    <div className="fertilizer-nutrient__identity"><span className="fertilizer-nutrient__symbol">{nutrient}</span><span>{({ N: 'Nitrogen', P: 'Phosphorus', K: 'Potassium' })[nutrient]}</span></div>
    <strong>{status || 'Not returned'}</strong>
  </div>;
}

export function FertilizerPage() {
  const { selectedFarm, selectedFarmId, loading: farmsLoading, error: farmsError, refreshFarms } = useFarms();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const requestTracker = useRef(createFertilizerRequestTracker(selectedFarmId));

  useEffect(() => {
    requestTracker.current.setFarmId(selectedFarmId);
    setResult(null);
    setError(null);
    setLoading(false);
    return () => requestTracker.current.setFarmId(null);
  }, [selectedFarmId]);

  async function requestRecommendation() {
    const requestedFarmId = selectedFarmId;
    const sequence = requestTracker.current.begin(requestedFarmId);
    if (sequence === null) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const response = await fertilizerApi.get(requestedFarmId);
      if (requestTracker.current.isCurrent(sequence, requestedFarmId)) setResult(response);
    } catch (requestError) {
      if (requestTracker.current.isCurrent(sequence, requestedFarmId)) setError({ farmId: requestedFarmId, cause: requestError });
    } finally {
      if (requestTracker.current.finish(sequence, requestedFarmId)) setLoading(false);
    }
  }

  const pageMode = fertilizerPageMode({ loading: farmsLoading, error: farmsError, selectedFarm, selectedFarmId });
  if (pageMode === 'loading') return <div className="fertilizer-page"><LoadingState label="Loading your selected farm…" /></div>;
  if (pageMode === 'farm-error') return <div className="fertilizer-page"><PageHeader eyebrow="SOIL & NUTRIENT GUIDANCE" title="Fertilizer" description="Review nutrient status and fertilizer guidance for your selected Farm." /><ErrorState title="Your farms could not be loaded" message={farmsError} onRetry={refreshFarms} /></div>;
  if (pageMode === 'no-farm') return <div className="fertilizer-page"><PageHeader eyebrow="SOIL & NUTRIENT GUIDANCE" title="Fertilizer" description="Review nutrient status and fertilizer guidance for your selected Farm." /><EmptyState title="Select a Farm to get started" message="Create or select a Farm with crop details and recorded N, P, K, and pH values before requesting fertilizer guidance." action={<Link className="button button--primary" to="/app/farms">Manage your Farms <ArrowRight size={16} /></Link>} /></div>;

  const location = [selectedFarm.location?.village, selectedFarm.location?.district, selectedFarm.location?.state].filter(Boolean).join(', ');
  const activeError = error?.farmId === selectedFarmId ? error.cause : null;
  const missingFields = missingFertilizerFields(activeError);
  const visibleResult = visibleFertilizerResult(result, selectedFarmId);
  const recommendation = visibleResult?.recommendation;
  const nutrientStatus = recommendation?.nutrient_status || {};
  const priorities = Array.isArray(recommendation?.priority_nutrients) ? recommendation.priority_nutrients : [];
  const reasoning = Array.isArray(recommendation?.reasoning) ? recommendation.reasoning : [];

  return <div className="fertilizer-page">
    <PageHeader eyebrow="SOIL & NUTRIENT GUIDANCE" title="Fertilizer" description="Review nutrient status and fertilizer guidance for your selected Farm." />

    <section className="fertilizer-farm-panel" aria-labelledby="fertilizer-farm-heading">
      <div className="fertilizer-panel-heading"><span className="fertilizer-section-icon"><FlaskConical size={18} /></span><div><span className="eyebrow">SELECTED FARM</span><h2 id="fertilizer-farm-heading">{selectedFarm.name}</h2></div><span className="fertilizer-farm-status"><Check size={13} /> ACTIVE</span></div>
      <div className="fertilizer-farm-location"><MapPin size={15} /><span>{location || 'Location not recorded'}</span></div>
      <div className="fertilizer-farm-context"><span><Sprout size={14} /> Crop <strong>{selectedFarm.crop?.name || 'Not recorded'}</strong></span><span>Growth stage <strong>{selectedFarm.crop?.growthStage || 'Not recorded'}</strong></span></div>
      <div className="fertilizer-soil-values" aria-label="Recorded soil values"><div><span>Nitrogen (N)</span><strong>{recorded(selectedFarm.soil?.nitrogen)}</strong></div><div><span>Phosphorus (P)</span><strong>{recorded(selectedFarm.soil?.phosphorus)}</strong></div><div><span>Potassium (K)</span><strong>{recorded(selectedFarm.soil?.potassium)}</strong></div><div><span>Soil pH</span><strong>{recorded(selectedFarm.soil?.ph)}</strong></div></div>
      <p className="fertilizer-farm-note"><Leaf size={13} /> Soil values are shown as saved in this Farm record; units are not provided by the recommendation service.</p>
    </section>

    <div className="fertilizer-action-row"><Button onClick={requestRecommendation} disabled={loading || !selectedFarmId}><FlaskConical size={16} />{loading ? 'Reviewing soil nutrients…' : visibleResult ? 'Refresh Fertilizer Guidance' : 'Get Fertilizer Recommendation'}</Button>{!loading && !visibleResult && <span>Uses this Farm’s saved crop, soil, and disease context.</span>}</div>
    {loading && <div className="fertilizer-loading-panel"><LoadingState label="Preparing fertilizer guidance…" /><p>The backend is evaluating the selected Farm’s recorded nutrient values and crop context.</p></div>}

    {activeError && missingFields.length > 0 && <section className="fertilizer-missing-panel" role="alert"><span className="fertilizer-message-icon"><AlertTriangle size={18} /></span><div className="fertilizer-message-content"><h2>More Farm information is required</h2><p>The recommendation service needs these saved values before it can provide guidance:</p><ul>{missingFields.map((field, index) => <li key={`${field}-${index}`}>{labelFertilizerField(field)}</li>)}</ul><Link className="button button--outline" to={`/app/farms/${encodeURIComponent(selectedFarmId)}`}><Pencil size={15} /> Edit Farm</Link></div></section>}
    {activeError && missingFields.length === 0 && <div className="fertilizer-error-panel"><ErrorState title={activeError.status === 503 || activeError.code === 'TIMEOUT' ? 'Recommendation service unavailable' : activeError.status === 404 ? 'Farm unavailable' : activeError.status === 401 ? 'Sign in required' : 'Fertilizer guidance could not be loaded'} message={fertilizerErrorMessage(activeError)} onRetry={requestRecommendation} /></div>}

    {visibleResult && <div className="fertilizer-results" aria-live="polite">
      <section className="fertilizer-status-panel" aria-labelledby="fertilizer-status-heading"><div className="fertilizer-result-heading"><div><span className="eyebrow">BACKEND NUTRIENT CLASSIFICATION</span><h2 id="fertilizer-status-heading">Nutrient status</h2></div><span>Returned for {recommendation?.crop || visibleResult.farmName || 'this Farm'} · {recommendation?.growth_stage || 'growth stage unavailable'}</span></div><div className="fertilizer-nutrient-grid"><NutrientStatus nutrient="N" status={nutrientStatus.N} /><NutrientStatus nutrient="P" status={nutrientStatus.P} /><NutrientStatus nutrient="K" status={nutrientStatus.K} /></div><div className="fertilizer-ph-status"><span>Soil pH status</span><strong>{recommendation?.ph_status || 'Not returned'}</strong></div></section>

      <section className="fertilizer-advice-panel" aria-labelledby="fertilizer-advice-heading"><div className="fertilizer-advice-panel__icon"><Sprout size={20} /></div><div className="fertilizer-advice-panel__body"><span className="eyebrow">FERTILIZER GUIDANCE</span><h2 id="fertilizer-advice-heading">Recommendation</h2><p>{recommendation?.recommendation || 'No recommendation text was returned.'}</p>{priorities.length > 0 && <div className="fertilizer-priorities"><span>Priority nutrients</span><ul>{priorities.map((nutrient, index) => <li key={`${nutrient}-${index}`}>{nutrient}</li>)}</ul></div>}{priorities.length === 0 && Array.isArray(recommendation?.priority_nutrients) && <p className="fertilizer-no-priorities">No priority nutrients were returned.</p>}</div></section>

      {recommendation?.caution && <aside className="fertilizer-caution" role="alert"><AlertTriangle size={19} aria-hidden="true" /><div><strong>Disease-related caution</strong><p>{recommendation.caution}</p></div></aside>}

      <section className="fertilizer-reasoning-panel" aria-labelledby="fertilizer-reasoning-heading"><div className="fertilizer-result-heading"><div><span className="eyebrow">DECISION CONTEXT</span><h2 id="fertilizer-reasoning-heading">Why this guidance was returned</h2></div><span>Reasoning supplied by the fertilizer engine</span></div>{reasoning.length > 0 ? <ul>{reasoning.map((reason, index) => <li key={`${reason}-${index}`}>{reason}</li>)}</ul> : <p>No reasoning details were returned.</p>}</section>

      <aside className="fertilizer-prototype-note"><AlertTriangle size={17} aria-hidden="true" /><p><strong>Prototype guidance:</strong> nutrient and pH classifications use generic prototype thresholds that require crop- and region-specific agronomic validation. This is advisory information, not an application rate or product prescription.</p></aside>
    </div>}
  </div>;
}
