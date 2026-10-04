import { useEffect, useRef, useState } from 'react';
import { Activity, AlertTriangle, ArrowRight, Check, CircleAlert, ClipboardCheck, Droplets, FlaskConical, Info, Leaf, LineChart, MapPin, RefreshCw, Sprout, TrendingUp } from 'lucide-react';
import { Link } from 'react-router';
import { farmEvaluationApi } from '../api/farmEvaluation.js';
import { useFarms } from '../context/FarmContext.jsx';
import { Button } from '../components/ui/Button.jsx';
import { EmptyState, ErrorState, LoadingState } from '../components/ui/Feedback.jsx';
import { PageHeader } from '../components/ui/PageHeader.jsx';
import { componentError, componentRecommendation, componentStatus, componentWarnings, confidenceLabel, createFarmEvaluationRequestTracker, cropCandidates, evaluationComponents, evaluationErrorMessage, evaluationErrorTitle, evaluationMissingFields, farmEvaluationPageMode, evaluationStatus, formatEvaluationValue, marketProvenance, rankedCropCandidates, visibleFarmEvaluation } from '../lib/farmEvaluationPresentation.js';

const icons = { cropRecommendation: Leaf, irrigation: Droplets, fertilizer: FlaskConical, diseaseRisk: Activity, market: TrendingUp, cropRanking: LineChart };

function Field({ label, value }) {
  const display = formatEvaluationValue(value);
  return display === null ? null : <div className="evaluation-field"><dt>{label}</dt><dd>{display}</dd></div>;
}

function ValueList({ title, values }) {
  if (!Array.isArray(values) || values.length === 0) return null;
  return <div className="evaluation-value-list"><h4>{title}</h4><ul>{values.map((value, index) => <li key={`${String(value)}-${index}`}>{typeof value === 'string' ? value : formatEvaluationValue(value)}</li>)}</ul></div>;
}

function ComponentDetails({ component }) {
  const recommendation = componentRecommendation(component);
  if (!recommendation) return <p className="evaluation-no-details">The backend did not return recommendation details for this component.</p>;
  const fields = [];
  const lists = [];

  if (component.key === 'cropRecommendation') {
    fields.push(['Predicted crop', recommendation.predicted_crop], ['Confidence', confidenceLabel(recommendation.confidence)]);
    const candidates = cropCandidates(recommendation);
    if (candidates.length) lists.push(['Top candidates', candidates.map((candidate) => `${candidate.crop || 'Crop name not returned'}${confidenceLabel(candidate.probability) ? ` · ${confidenceLabel(candidate.probability)}` : ''}`)]);
  } else if (component.key === 'irrigation') {
    fields.push(['Irrigation required', recommendation.irrigation_required], ['Urgency', recommendation.urgency], ['Reason', recommendation.reason]);
    if (recommendation.factors && typeof recommendation.factors === 'object') fields.push(...Object.entries(recommendation.factors).map(([key, value]) => [`Factor · ${key.replaceAll('_', ' ')}`, value]));
  } else if (component.key === 'fertilizer') {
    if (recommendation.nutrient_status && typeof recommendation.nutrient_status === 'object') fields.push(...Object.entries(recommendation.nutrient_status).map(([key, value]) => [`Nutrient ${key}`, value]));
    fields.push(['pH classification', recommendation.ph_status], ['Recommendation', recommendation.recommendation]);
    lists.push(['Priority nutrients', recommendation.priority_nutrients], ['Reasoning', recommendation.reasoning]);
  } else if (component.key === 'diseaseRisk') {
    fields.push(['Environmental risk level', recommendation.risk_level], ['Prototype risk score', recommendation.risk_score]);
    if (recommendation.signals && typeof recommendation.signals === 'object') fields.push(...Object.entries(recommendation.signals).map(([key, value]) => [`Signal · ${key.replaceAll('_', ' ')}`, value]));
    lists.push(['Reasoning', recommendation.reasoning]);
  } else if (component.key === 'market') {
    const priceRange = recommendation.price_range;
    fields.push(['Market status', recommendation.status], ['Market message', recommendation.message], ['Crop', recommendation.crop], ['Market', recommendation.market], ['Latest modal price', recommendation.current_price !== null && recommendation.current_price !== undefined ? `${recommendation.current_price}${priceRange?.unit ? ` ${priceRange.unit}` : ''}` : null], ['Latest record date', recommendation.latest_date], ['Trend', recommendation.trend], ['Price change', Number.isFinite(recommendation.price_change_percent) ? `${recommendation.price_change_percent}%` : null], ['Market source', marketProvenance(recommendation.raw_source).label], ['History records', recommendation.history_points]);
    if (priceRange && typeof priceRange === 'object') fields.push(['Price range · minimum', priceRange.min_price], ['Price range · modal', priceRange.modal_price], ['Price range · maximum', priceRange.max_price]);
  } else if (component.key === 'cropRanking') {
    const candidates = rankedCropCandidates(recommendation);
    if (candidates.length) lists.push(['Ranked candidates', candidates.map((candidate) => {
      const source = marketProvenance(candidate.market_source);
      const score = Number.isFinite(candidate.combined_score) ? ` · score ${candidate.combined_score}` : '';
      const provenance = candidate.market_source ? ` · ${source.label}` : '';
      return `${Number.isInteger(candidate.rank) ? `${candidate.rank}. ` : ''}${candidate.crop || 'Crop name not returned'}${score}${provenance}`;
    })]);
  }

  const populatedFields = fields.filter(([, value]) => formatEvaluationValue(value) !== null);
  const populatedLists = lists.filter(([, values]) => Array.isArray(values) && values.length > 0);
  return <>
    {populatedFields.length > 0 && <dl className="evaluation-fields">{populatedFields.map(([label, value]) => <Field key={label} label={label} value={value} />)}</dl>}
    {component.key === 'cropRanking' && recommendation.ranked_crops?.some((candidate) => candidate?.market_source === 'local-fallback') && <p className="evaluation-fallback-note"><AlertTriangle size={15} aria-hidden="true" /> Some crop-ranking market signals use local fallback data.</p>}
    <div className="evaluation-lists">{populatedLists.map(([title, values]) => <ValueList key={title} title={title} values={values} />)}</div>
    {componentWarnings(component, recommendation).map((warning, index) => <p className="evaluation-warning" key={`${warning}-${index}`}><AlertTriangle size={15} aria-hidden="true" />{warning}</p>)}
    {!populatedFields.length && !populatedLists.length && !componentWarnings(component, recommendation).length && <p className="evaluation-no-details">No additional details were returned.</p>}
  </>;
}

function EvaluationCard({ component, farmId }) {
  const Icon = icons[component.key] || ClipboardCheck;
  const state = componentStatus(component.result?.status);
  const failure = componentError(component.result);
  const missingFields = failure?.missingFields || [];
  const isAvailable = ['SUCCESS', 'UNAVAILABLE'].includes(component.result?.status);
  return <article className={`evaluation-card evaluation-card--${state.kind}`}>
    <header className="evaluation-card__header"><span className="evaluation-card__icon"><Icon size={18} aria-hidden="true" /></span><div><h3>{component.label}</h3><span className={`evaluation-badge evaluation-badge--${state.kind}`}>{state.label}</span></div></header>
    {isAvailable ? <ComponentDetails component={{ ...component.result, key: component.key }} /> : <div className="evaluation-component-error"><p>{failure?.message || 'The backend did not return a result for this component.'}</p>{missingFields.length > 0 && <><span>Missing Farm fields</span><ul>{missingFields.map((field, index) => <li key={`${field}-${index}`}>{field}</li>)}</ul><Link className="button button--outline" to={`/app/farms/${encodeURIComponent(farmId)}`}>Edit Farm information</Link></>}</div>}
  </article>;
}

export function FarmEvaluationPage() {
  const { farms, selectedFarm, selectedFarmId, loading: farmsLoading, error: farmsError, refreshFarms } = useFarms();
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const requestTracker = useRef(createFarmEvaluationRequestTracker(selectedFarmId));

  useEffect(() => {
    requestTracker.current.setFarmId(selectedFarmId);
    setResult(null);
    setError(null);
    setLoading(false);
    return () => requestTracker.current.setFarmId(null);
  }, [selectedFarmId]);

  async function runEvaluation() {
    const farmId = selectedFarmId;
    const requestId = requestTracker.current.begin(farmId);
    if (requestId === null) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const response = await farmEvaluationApi.get(farmId);
      if (requestTracker.current.isCurrent(requestId, farmId)) setResult(response);
    } catch (requestError) {
      if (requestTracker.current.isCurrent(requestId, farmId)) setError({ farmId, cause: requestError });
    } finally {
      if (requestTracker.current.finish(requestId, farmId)) setLoading(false);
    }
  }

  const mode = farmEvaluationPageMode({ loading: farmsLoading, error: farmsError, selectedFarm, selectedFarmId });
  if (mode === 'loading') return <div className="farm-evaluation-page"><LoadingState label="Loading your selected Farm…" /></div>;
  if (mode === 'farm-error') return <div className="farm-evaluation-page"><PageHeader eyebrow="FARM OVERVIEW" title="Farm Evaluation" description="Review the decision-support results available for your selected Farm." /><ErrorState title="Your Farms could not be loaded" message={farmsError} onRetry={refreshFarms} /></div>;
  if (mode === 'no-farm') return <div className="farm-evaluation-page"><PageHeader eyebrow="FARM OVERVIEW" title="Farm Evaluation" description="Review the decision-support results available for your selected Farm." /><EmptyState title={farms.length ? 'Select a Farm to get started' : 'Create a Farm to generate an evaluation'} message={farms.length ? 'Select a Farm in the top bar before running its evaluation.' : 'Create a Farm and record its conditions before requesting a composite evaluation.'} action={<Link className="button button--primary" to="/app/farms">Manage your Farms <ArrowRight size={16} /></Link>} /></div>;

  const visibleResult = visibleFarmEvaluation(result, selectedFarmId);
  const activeError = error?.farmId === selectedFarmId ? error.cause : null;
  const missingFields = evaluationMissingFields(activeError);
  const components = evaluationComponents(visibleResult);
  const evaluationState = evaluationStatus(visibleResult?.status);
  const location = [selectedFarm.location?.village, selectedFarm.location?.district, selectedFarm.location?.state].filter(Boolean).join(', ');
  const lastUpdated = visibleResult?.farmContext?.lastUpdated || selectedFarm.updatedAt;

  return <div className="farm-evaluation-page">
    <PageHeader eyebrow="FARM OVERVIEW" title="Farm Evaluation" description="A consolidated view of the existing AgriSense decision-support modules for your selected Farm." />
    <section className="evaluation-farm-summary" aria-labelledby="evaluation-farm-name"><span className="evaluation-farm-summary__icon"><MapPin size={19} aria-hidden="true" /></span><div className="evaluation-farm-summary__copy"><span className="eyebrow">SELECTED FARM</span><h2 id="evaluation-farm-name">{selectedFarm.name || 'Farm name not returned'}</h2><p><Sprout size={14} aria-hidden="true" />{selectedFarm.crop?.name || 'Crop not recorded'}<span aria-hidden="true"> · </span>{location || 'Location not recorded'}</p>{lastUpdated && <span className="evaluation-farm-summary__updated">Last updated: {lastUpdated}</span>}</div><span className="evaluation-farm-summary__selected"><Check size={13} aria-hidden="true" /> SELECTED</span></section>
    <section className="evaluation-method-note" aria-label="Evaluation scope"><InfoIcon /><p>This read-only overview combines existing module results for this Farm. It does not calculate a separate overall health score. Review each module’s status and caveats.</p></section>
    <div className="evaluation-actions"><Button onClick={runEvaluation} disabled={loading || !selectedFarmId}><RefreshCw size={16} aria-hidden="true" className={loading ? 'spin' : ''} />{loading ? 'Evaluating Farm…' : visibleResult ? 'Refresh Evaluation' : 'Run Farm Evaluation'}</Button>{!loading && !visibleResult && <span>Uses the Farm data currently saved in AgriSense.</span>}</div>
    {loading && <div className="evaluation-loading"><LoadingState label="Running the selected Farm’s component evaluations…" /><p>The backend evaluates available modules and returns each component’s status.</p></div>}
    {activeError && <div className="evaluation-error"><ErrorState title={evaluationErrorTitle(activeError)} message={evaluationErrorMessage(activeError)} onRetry={runEvaluation} /></div>}
    {activeError && missingFields.length > 0 && <section className="evaluation-missing-fields" role="alert"><div><strong>Required Farm fields</strong><ul>{missingFields.map((field, index) => <li key={`${field}-${index}`}>{field}</li>)}</ul></div><Link className="button button--outline" to={`/app/farms/${encodeURIComponent(selectedFarmId)}`}>Edit Farm</Link></section>}
    {visibleResult && <section className="evaluation-results" aria-live="polite" aria-labelledby="evaluation-results-heading">
      <div className={`evaluation-overview evaluation-overview--${evaluationState.kind}`}><span className="evaluation-overview__icon">{visibleResult.status === 'SUCCESS' ? <Check size={22} aria-hidden="true" /> : <CircleAlert size={22} aria-hidden="true" />}</span><div><span className="eyebrow">OVERALL EVALUATION STATUS</span><h2 id="evaluation-results-heading">{evaluationState.label}</h2><p>{visibleResult.status === 'SUCCESS' ? 'All returned decision-support components completed successfully.' : visibleResult.status === 'PARTIAL' ? 'Some components need Farm data, a dependency, or a provider before they can return a result.' : `Backend status: ${evaluationState.label}`}</p></div><span className="evaluation-overview__count">{components.length} component{components.length === 1 ? '' : 's'} returned</span></div>
      {components.length > 0 ? <div className="evaluation-component-grid">{components.map((component) => <EvaluationCard key={component.key} component={component} farmId={selectedFarmId} />)}</div> : <div className="evaluation-empty-results" role="status">The backend returned no component results for this evaluation.</div>}
      <p className="evaluation-caveat"><InfoIcon />AgriSense is a prototype decision-support tool. Recommendations and thresholds may have limitations; use the component caveats shown above when reviewing results.</p>
    </section>}
  </div>;
}

function InfoIcon() {
  return <Info size={17} aria-hidden="true" />;
}
