import { useEffect, useRef, useState } from 'react';
import { Activity, AlertTriangle, ArrowRight, Check, Leaf, MapPin, ShieldAlert, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router';
import { diseaseApi } from '../api/disease.js';
import { useFarms } from '../context/FarmContext.jsx';
import { Button } from '../components/ui/Button.jsx';
import { EmptyState, ErrorState, LoadingState } from '../components/ui/Feedback.jsx';
import { PageHeader } from '../components/ui/PageHeader.jsx';
import { createDiseaseRiskRequestTracker, diseaseRiskErrorMessage, diseaseRiskPageMode, labelDiseaseRiskField, missingDiseaseRiskFields, visibleDiseaseRiskResult } from '../lib/diseaseRiskPresentation.js';

function recorded(value, suffix = '') {
  if (value === null || value === undefined || value === '') return 'Not returned';
  return `${value}${suffix}`;
}

function RiskAssessment({ result, farmName }) {
  const recommendation = result?.recommendation || {};
  const riskLevel = typeof recommendation.risk_level === 'string' ? recommendation.risk_level : '';
  const riskTone = ['low', 'medium', 'high'].includes(riskLevel.toLowerCase()) ? riskLevel.toLowerCase() : 'unknown';
  const signals = recommendation.signals && typeof recommendation.signals === 'object' ? recommendation.signals : {};
  const reasoning = Array.isArray(recommendation.reasoning) ? recommendation.reasoning : [];
  const signalLabels = { humidity: 'Humidity', temperature: 'Temperature', rainfall: 'Rainfall', recent_rainfall: 'Recent rainfall' };

  return <div className="disease-risk-results" aria-live="polite">
    <section className="disease-risk-summary" aria-labelledby="disease-risk-summary-heading">
      <div className="disease-risk-summary__top"><span className="disease-risk-icon"><Activity size={19} aria-hidden="true" /></span><div><span className="eyebrow">BACKEND ENVIRONMENTAL ASSESSMENT</span><h2 id="disease-risk-summary-heading">Disease risk for {result.farmName || farmName || 'selected Farm'}</h2></div><span className={`disease-risk-badge disease-risk-badge--${riskTone}`}><span aria-hidden="true">{riskTone === 'low' ? <ShieldCheck size={14} /> : riskTone === 'high' ? <ShieldAlert size={14} /> : <Activity size={14} />}</span>{riskLevel || 'Not returned'}</span></div>
      <div className="disease-risk-score"><span>Prototype composite index</span><strong>{recorded(recommendation.risk_score)}</strong><p>{recommendation.risk_score_note || 'The backend did not return an explanation for this score.'}</p></div>
    </section>

    <section className="disease-risk-panel" aria-labelledby="disease-risk-inputs-heading"><div className="disease-risk-panel__heading"><div><span className="eyebrow">ENGINE INPUTS</span><h2 id="disease-risk-inputs-heading">Conditions used for this assessment</h2></div><span>Returned with this response</span></div><dl className="disease-risk-metrics">
      <div><dt>Crop</dt><dd>{recorded(result.engineInput?.crop)}</dd></div><div><dt>Growth stage</dt><dd>{recorded(result.engineInput?.growth_stage)}</dd></div><div><dt>Temperature</dt><dd>{recorded(result.engineInput?.temperature, ' °C')}</dd></div><div><dt>Humidity</dt><dd>{recorded(result.engineInput?.humidity, '%')}</dd></div><div><dt>Rainfall</dt><dd>{recorded(result.engineInput?.rainfall, ' mm')}</dd></div><div><dt>Recent rainfall</dt><dd>{recorded(result.engineInput?.recent_rainfall, ' mm')}</dd></div>
    </dl></section>

    <section className="disease-risk-panel" aria-labelledby="disease-risk-signals-heading"><div className="disease-risk-panel__heading"><div><span className="eyebrow">MODEL SIGNALS</span><h2 id="disease-risk-signals-heading">Signal contributions</h2></div><span>Values supplied by the disease-risk engine</span></div><dl className="disease-risk-signals">{Object.entries(signals).length ? Object.entries(signals).map(([key, value]) => <div key={key}><dt>{signalLabels[key] || key}</dt><dd>{recorded(value)}</dd></div>) : <p>No signal values were returned.</p>}</dl></section>

    <section className="disease-risk-panel" aria-labelledby="disease-risk-reasoning-heading"><div className="disease-risk-panel__heading"><div><span className="eyebrow">DECISION CONTEXT</span><h2 id="disease-risk-reasoning-heading">Why this risk was returned</h2></div><span>Reasoning supplied by the engine</span></div>{reasoning.length ? <ul className="disease-risk-reasoning">{reasoning.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul> : <p className="disease-risk-empty-copy">No reasoning details were returned.</p>}</section>

    {recommendation.disclaimer && <aside className="disease-risk-disclaimer"><AlertTriangle size={18} aria-hidden="true" /><p>{recommendation.disclaimer}</p></aside>}
  </div>;
}

export function DiseaseRiskPage() {
  const { selectedFarm, selectedFarmId, loading: farmsLoading, error: farmsError, refreshFarms } = useFarms();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const requestTracker = useRef(createDiseaseRiskRequestTracker(selectedFarmId));

  useEffect(() => {
    requestTracker.current.setFarmId(selectedFarmId);
    setResult(null);
    setError(null);
    setLoading(false);
    return () => requestTracker.current.setFarmId(null);
  }, [selectedFarmId]);

  async function requestAssessment() {
    const requestedFarmId = selectedFarmId;
    const requestId = requestTracker.current.begin(requestedFarmId);
    if (requestId === null) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const response = await diseaseApi.risk(requestedFarmId);
      if (requestTracker.current.isCurrent(requestId, requestedFarmId)) setResult(response);
    } catch (requestError) {
      if (requestTracker.current.isCurrent(requestId, requestedFarmId)) setError({ farmId: requestedFarmId, cause: requestError });
    } finally {
      if (requestTracker.current.finish(requestId, requestedFarmId)) setLoading(false);
    }
  }

  const mode = diseaseRiskPageMode({ loading: farmsLoading, error: farmsError, selectedFarm, selectedFarmId });
  if (mode === 'loading') return <div className="disease-risk-page"><LoadingState label="Loading your selected Farm…" /></div>;
  if (mode === 'farm-error') return <div className="disease-risk-page"><PageHeader eyebrow="PLANT HEALTH CONDITIONS" title="Disease Risk" description="Review the environmental risk assessment returned for your selected Farm." /><ErrorState title="Your Farms could not be loaded" message={farmsError} onRetry={refreshFarms} /></div>;
  if (mode === 'no-farm') return <div className="disease-risk-page"><PageHeader eyebrow="PLANT HEALTH CONDITIONS" title="Disease Risk" description="Review the environmental risk assessment returned for your selected Farm." /><EmptyState title="Select a Farm to get started" message="Create or select a Farm with crop and weather information before requesting an environmental disease-risk assessment." action={<Link className="button button--primary" to="/app/farms">Manage your Farms <ArrowRight size={16} /></Link>} /></div>;

  const location = [selectedFarm.location?.village, selectedFarm.location?.district, selectedFarm.location?.state].filter(Boolean).join(', ');
  const activeError = error?.farmId === selectedFarmId ? error.cause : null;
  const missingFields = missingDiseaseRiskFields(activeError);
  const visibleResult = visibleDiseaseRiskResult(result, selectedFarmId);

  return <div className="disease-risk-page">
    <PageHeader eyebrow="PLANT HEALTH CONDITIONS" title="Disease Risk" description="Review the environmental risk assessment returned for your selected Farm." />
    <section className="disease-risk-farm" aria-labelledby="disease-risk-farm-heading"><span className="disease-risk-icon"><Leaf size={18} aria-hidden="true" /></span><div className="disease-risk-farm__copy"><span className="eyebrow">SELECTED FARM</span><h2 id="disease-risk-farm-heading">{selectedFarm.name}</h2><p><MapPin size={14} aria-hidden="true" />{location || 'Location not recorded'}</p><span className="disease-risk-farm__crop">{selectedFarm.crop?.name || 'Crop not recorded'}{selectedFarm.crop?.growthStage ? ` · ${selectedFarm.crop.growthStage}` : ''}</span></div><span className="disease-risk-farm__status"><Check size={13} aria-hidden="true" /> ACTIVE</span></section>
    <div className="disease-risk-action"><Button onClick={requestAssessment} disabled={loading || !selectedFarmId}><Activity size={16} aria-hidden="true" />{loading ? 'Assessing environmental conditions…' : visibleResult ? 'Refresh Risk Assessment' : 'Assess Disease Risk'}</Button>{!visibleResult && <span>Uses the selected Farm’s saved crop and weather data.</span>}</div>
    {loading && <div className="disease-risk-loading"><LoadingState label="Preparing the environmental assessment…" /><p>The backend disease-risk engine is evaluating the selected Farm’s current recorded conditions.</p></div>}
    {activeError && missingFields.length > 0 && <section className="disease-risk-missing" role="alert"><AlertTriangle size={18} aria-hidden="true" /><div><h2>More Farm information is required</h2><p>Add these saved values before requesting an assessment:</p><ul>{missingFields.map((field, index) => <li key={`${field}-${index}`}>{labelDiseaseRiskField(field)}</li>)}</ul><Link className="button button--outline" to={`/app/farms/${encodeURIComponent(selectedFarmId)}`}>Edit Farm</Link></div></section>}
    {activeError && missingFields.length === 0 && <div className="disease-risk-error"><ErrorState title={activeError.status === 503 || activeError.code === 'TIMEOUT' ? 'Risk service unavailable' : activeError.status === 404 ? 'Farm unavailable' : activeError.status === 401 ? 'Sign in required' : 'Assessment could not be loaded'} message={diseaseRiskErrorMessage(activeError)} onRetry={requestAssessment} /></div>}
    {visibleResult && <RiskAssessment result={visibleResult} farmName={selectedFarm.name} />}
    {visibleResult && <p className="disease-risk-prototype-note"><ShieldCheck size={15} aria-hidden="true" />Environmental risk indicates conditions that may favor disease development. It does not confirm disease presence; use image-based disease detection for a plant check.</p>}
  </div>;
}
