import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, ArrowRight, Check, CloudRain, Droplets, Leaf, MapPin, Pencil, Sprout, Thermometer, Wind } from 'lucide-react';
import { Link } from 'react-router';
import { irrigationApi } from '../api/irrigation.js';
import { useFarms } from '../context/FarmContext.jsx';
import { Button } from '../components/ui/Button.jsx';
import { EmptyState, ErrorState, LoadingState } from '../components/ui/Feedback.jsx';
import { PageHeader } from '../components/ui/PageHeader.jsx';
import { createIrrigationRequestTracker, irrigationErrorMessage, irrigationPageMode, labelIrrigationField, missingIrrigationFields, visibleIrrigationResult } from '../lib/irrigationPresentation.js';

function recorded(value, suffix = '') {
  return typeof value === 'number' && Number.isFinite(value) ? `${Number.isInteger(value) ? value : value.toFixed(1)}${suffix}` : '—';
}

function displayValue(value) {
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value !== 'string' || !value.trim()) return 'Not returned';
  const text = value.replaceAll('_', ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function FarmMetric({ label, value, icon: Icon }) {
  return <div className="irrigation-farm-metric"><span><Icon size={14} aria-hidden="true" />{label}</span><strong>{value}</strong></div>;
}

function Factor({ label, value }) {
  return <div className="irrigation-factor"><span>{label}</span><strong>{displayValue(value)}</strong></div>;
}

export function IrrigationPage() {
  const { selectedFarm, selectedFarmId, loading: farmsLoading, error: farmsError, refreshFarms } = useFarms();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const requestTracker = useRef(createIrrigationRequestTracker(selectedFarmId));

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
      const response = await irrigationApi.get(requestedFarmId);
      if (requestTracker.current.isCurrent(sequence, requestedFarmId)) setResult(response);
    } catch (requestError) {
      if (requestTracker.current.isCurrent(sequence, requestedFarmId)) setError({ farmId: requestedFarmId, cause: requestError });
    } finally {
      if (requestTracker.current.finish(sequence, requestedFarmId)) setLoading(false);
    }
  }

  const pageMode = irrigationPageMode({ loading: farmsLoading, error: farmsError, selectedFarm, selectedFarmId });
  if (pageMode === 'loading') return <div className="irrigation-page"><LoadingState label="Loading your selected farm…" /></div>;
  if (pageMode === 'farm-error') return <div className="irrigation-page"><PageHeader eyebrow="FIELD WATER GUIDANCE" title="Irrigation" description="Irrigation guidance based on your selected farm’s saved field and weather data." /><ErrorState title="Your farms could not be loaded" message={farmsError} onRetry={refreshFarms} /></div>;
  if (pageMode === 'no-farm') return <div className="irrigation-page"><PageHeader eyebrow="FIELD WATER GUIDANCE" title="Irrigation" description="Review irrigation guidance for the farm you have selected." /><EmptyState title="Select a farm to get started" message="Create or select a farm with crop, field moisture, and recorded weather data before requesting irrigation guidance." action={<Link className="button button--primary" to="/app/farms">Manage your farms <ArrowRight size={16} /></Link>} /></div>;

  const location = [selectedFarm.location?.village, selectedFarm.location?.district, selectedFarm.location?.state].filter(Boolean).join(', ');
  const activeError = error?.farmId === selectedFarmId ? error.cause : null;
  const missingFields = missingIrrigationFields(activeError);
  const visibleResult = visibleIrrigationResult(result, selectedFarmId);
  const showResult = Boolean(visibleResult);
  const recommendation = visibleResult?.recommendation;
  const required = recommendation?.irrigation_required;
  const factors = recommendation?.factors || {};
  const engineStatus = recommendation?.metadata?.engine_status;

  return <div className="irrigation-page">
    <PageHeader eyebrow="FIELD WATER GUIDANCE" title="Irrigation" description="Review irrigation guidance for your selected farm using its recorded crop, field moisture, and weather data." />

    <section className="irrigation-farm-panel" aria-labelledby="irrigation-farm-heading">
      <div className="irrigation-panel-heading"><span className="irrigation-section-icon"><Droplets size={18} /></span><div><span className="eyebrow">SELECTED FARM</span><h2 id="irrigation-farm-heading">{selectedFarm.name}</h2></div><span className="irrigation-farm-status"><Check size={13} /> ACTIVE</span></div>
      <div className="irrigation-farm-location"><MapPin size={15} /><span>{location || 'Location not recorded'}</span></div>
      <div className="irrigation-recorded-label"><span>RECORDED FARM DATA</span><span>Values from your saved Farm record</span></div>
      <div className="irrigation-farm-metrics">
        <FarmMetric label="Current crop" value={selectedFarm.crop?.name || '—'} icon={Leaf} />
        <FarmMetric label="Growth stage" value={selectedFarm.crop?.growthStage || '—'} icon={Sprout} />
        <FarmMetric label="Soil moisture" value={recorded(selectedFarm.fieldConditions?.soilMoisture, '%')} icon={Droplets} />
        <FarmMetric label="Temperature" value={recorded(selectedFarm.weather?.temperature, ' °C')} icon={Thermometer} />
        <FarmMetric label="Humidity" value={recorded(selectedFarm.weather?.humidity, '%')} icon={Wind} />
        <FarmMetric label="Rain probability" value={recorded(selectedFarm.weather?.rainProbability, '%')} icon={CloudRain} />
        <FarmMetric label="Expected rainfall" value={recorded(selectedFarm.weather?.expectedRainfall, ' mm')} icon={CloudRain} />
      </div>
      <p className="irrigation-farm-note"><CloudRain size={13} /> Weather values are read from the Farm record; requesting guidance does not refresh weather.</p>
    </section>

    <div className="irrigation-action-row"><Button onClick={requestRecommendation} disabled={loading || !selectedFarmId}><Droplets size={16} />{loading ? 'Assessing field conditions…' : showResult ? 'Get Updated Guidance' : 'Get Irrigation Recommendation'}</Button>{!loading && !showResult && <span>Uses the selected Farm’s recorded values.</span>}</div>
    {loading && <div className="irrigation-loading-panel"><LoadingState label="Assessing your recorded field conditions…" /><p>The decision engine is evaluating the selected Farm’s saved crop, soil moisture, and weather data.</p></div>}

    {activeError && missingFields.length > 0 && <section className="irrigation-missing-panel" role="alert"><span className="irrigation-message-icon"><AlertTriangle size={18} /></span><div className="irrigation-message-content"><h2>More farm information is required</h2><p>The irrigation service needs these values from the selected Farm:</p><ul>{missingFields.map((field, index) => <li key={`${field}-${index}`}>{labelIrrigationField(field)}</li>)}</ul><Link className="button button--outline" to={`/app/farms/${encodeURIComponent(selectedFarmId)}`}><Pencil size={15} /> Edit Farm</Link></div></section>}
    {activeError && missingFields.length === 0 && <div className="irrigation-error-panel"><ErrorState title={activeError.status === 503 || activeError.code === 'TIMEOUT' ? 'Recommendation service unavailable' : activeError.status === 404 ? 'Farm unavailable' : 'Irrigation guidance could not be loaded'} message={irrigationErrorMessage(activeError)} onRetry={requestRecommendation} /></div>}

    {showResult && <div className="irrigation-result-stack" aria-live="polite">
      <section className={`irrigation-decision${required === true ? ' irrigation-decision--required' : required === false ? ' irrigation-decision--not-required' : ''}`} aria-labelledby="irrigation-result-heading">
        <div className="irrigation-decision__top"><span className="irrigation-section-icon"><Droplets size={18} /></span><span className="eyebrow">IRRIGATION RECOMMENDATION</span><span className={`irrigation-urgency irrigation-urgency--${recommendation?.urgency || 'unknown'}`}>Urgency · {displayValue(recommendation?.urgency)}</span></div>
        <span className="irrigation-decision__kicker">CURRENT DECISION</span>
        <h2 id="irrigation-result-heading">{required === true ? 'Irrigation required' : required === false ? 'Irrigation not required' : 'Decision unavailable'}</h2>
        <p className="irrigation-decision__reason">{recommendation?.reason || 'No explanation was returned.'}</p>
        <div className="irrigation-result-farm"><span>FOR THIS FARM</span><strong>{visibleResult.farmName || 'Farm name unavailable'}</strong><small>Farm ID · {visibleResult.farmId}</small></div>
      </section>

      <section className="irrigation-factors-panel" aria-labelledby="irrigation-factors-heading"><div className="irrigation-factors-heading"><div><span className="eyebrow">ENGINE FACTORS</span><h2 id="irrigation-factors-heading">What shaped this guidance</h2></div><span>Returned by the irrigation engine</span></div><div className="irrigation-factors-grid"><Factor label="Soil condition" value={factors.soil} /><Factor label="Rain forecast" value={factors.rain_forecast} /><Factor label="Environmental demand" value={factors.environmental_demand} /><Factor label="Crop context" value={factors.context || recommendation?.metadata?.crop_context} /></div></section>
      {engineStatus && <aside className="irrigation-engine-note" aria-label="Engine status"><span className="irrigation-engine-note__icon"><AlertTriangle size={17} /></span><div><strong>Engine status · {displayValue(engineStatus)}</strong><p>{engineStatus === 'PROTOTYPE ASSUMPTIONS' ? 'The decision thresholds are prototype assumptions and require validation for specific crops and regional conditions. Use this as advisory guidance.' : 'This status was returned by the irrigation engine.'}</p></div></aside>}
    </div>}
  </div>;
}
