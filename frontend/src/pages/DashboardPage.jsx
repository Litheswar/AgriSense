import { useEffect, useMemo, useState } from 'react';
import { ArrowDownRight, ArrowRight, ArrowUpRight, CloudRain, Droplets, Leaf, MapPin, RefreshCw, Sprout, Thermometer, Wind } from 'lucide-react';
import { Link } from 'react-router';
import { farmsApi } from '../api/farms.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useFarms } from '../context/FarmContext.jsx';
import { Button } from '../components/ui/Button.jsx';
import { EmptyState, ErrorState, LoadingState } from '../components/ui/Feedback.jsx';
import { PageHeader } from '../components/ui/PageHeader.jsx';

const insights = [
  { key: 'cropRecommendation', label: 'Crop recommendation', icon: Sprout, tone: 'moss', hint: 'Crop fit' },
  { key: 'irrigation', label: 'Irrigation', icon: Droplets, tone: 'blue', hint: 'Water guidance' },
  { key: 'fertilizer', label: 'Fertilizer', icon: Leaf, tone: 'gold', hint: 'Nutrient guidance' },
  { key: 'diseaseRisk', label: 'Disease risk', icon: Wind, tone: 'coral', hint: 'Field conditions' },
  { key: 'market', label: 'Market insight', icon: ArrowUpRight, tone: 'violet', hint: 'Market context' }
];

function numberOrDash(value, suffix = '') {
  return typeof value === 'number' && Number.isFinite(value) ? `${Number.isInteger(value) ? value : value.toFixed(1)}${suffix}` : '—';
}

function bestValue(value, candidates) {
  if (!value || typeof value !== 'object') return null;
  for (const key of candidates) {
    const item = value[key];
    if (typeof item === 'string' && item.trim()) return item.trim();
    if (typeof item === 'number' && Number.isFinite(item)) return String(item);
  }
  return null;
}

function detailFor(key, data) {
  const result = data?.recommendation || data?.result || data || {};
  const specific = {
    cropRecommendation: ['predicted_crop', 'recommended_crop', 'crop_name', 'crop'],
    irrigation: ['urgency', 'urgency_level', 'action', 'recommendation', 'summary'],
    fertilizer: ['priority', 'priorities', 'nutrient_status', 'recommendation', 'summary'],
    diseaseRisk: ['risk_level', 'risk', 'risk_category', 'summary'],
    market: ['trend', 'price_trend', 'price', 'market', 'summary']
  }[key] || [];
  const text = bestValue(result, specific) || bestValue(result, ['summary', 'message', 'status']);
  if (text) return text;
  if (result.data_available === false || result.status === 'UNAVAILABLE') return 'Market data unavailable';
  return 'Recommendation ready';
}

function recordStatus(record) {
  if (!record) return 'Not assessed';
  if (record.status === 'SUCCESS') return 'Available';
  if (record.status === 'UNAVAILABLE' || record.status === 'PROVIDER_UNAVAILABLE') return 'Provider unavailable';
  if (record.status === 'INSUFFICIENT_FARM_DATA') return 'More farm data needed';
  return 'Not assessed';
}

function MetricCard({ icon: Icon, label, value, unit, tone }) {
  return <article className="metric-card"><span className={`metric-card__icon tone-${tone}`}><Icon size={18} /></span><span className="metric-card__label">{label}</span><strong className="metric-card__value">{value}<small>{unit}</small></strong></article>;
}

export function DashboardPage() {
  const { user } = useAuth();
  const { farms, selectedFarm, loading: farmsLoading, error: farmsError, refreshFarms } = useFarms();
  const [evaluation, setEvaluation] = useState(null);
  const [evaluationError, setEvaluationError] = useState('');
  const [evaluationLoading, setEvaluationLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!selectedFarm?._id) { setEvaluation(null); setEvaluationError(''); return undefined; }
    let active = true;
    setEvaluationLoading(true);
    setEvaluationError('');
    farmsApi.evaluation(selectedFarm._id)
      .then((result) => { if (active) setEvaluation(result); })
      .catch((error) => { if (active) setEvaluationError(error.message); })
      .finally(() => { if (active) setEvaluationLoading(false); });
    return () => { active = false; };
  }, [selectedFarm?._id, refreshKey]);

  const recommendations = evaluation?.recommendations || {};
  const completedCount = useMemo(() => Object.values(recommendations).filter((item) => item?.status === 'SUCCESS').length, [recommendations]);
  const firstName = user?.name?.trim().split(/\s+/)[0] || 'there';
  const farmLocation = [selectedFarm?.location?.district, selectedFarm?.location?.state].filter(Boolean).join(', ');

  if (farmsLoading) return <div className="dashboard-page"><LoadingState label="Loading your farm workspace…" /></div>;
  if (farmsError) return <div className="dashboard-page"><ErrorState title="Your farms could not be loaded" message={farmsError} onRetry={refreshFarms} /></div>;
  if (!farms.length) {
    return <div className="dashboard-page"><PageHeader eyebrow="YOUR FIELD, IN FOCUS" title={`Good day, ${firstName}`} description="A clear view of your farm starts here." /><EmptyState title="Create your first Farm" message="Add your Farm details, then start receiving AI-powered insights. Your dashboard will show real information after a farm is saved." action={<Link className="button button--primary" to="/app/farms?create=1">Create your first farm <ArrowRight size={16} /></Link>} /><div className="farm-onboarding-steps" aria-label="Getting started"><span><b>1</b> Create your first Farm</span><ArrowRight size={15} /><span><b>2</b> Add your Farm details</span><ArrowRight size={15} /><span><b>3</b> Start receiving AI-powered insights</span></div></div>;
  }
  if (!selectedFarm) return <div className="dashboard-page"><LoadingState label="Opening your selected farm…" /></div>;

  return (
    <div className="dashboard-page">
      <PageHeader eyebrow="YOUR FIELD, IN FOCUS" title={`Good day, ${firstName}`} description="Here’s the latest picture of your farm and its growing conditions." action={<Button variant="outline" onClick={() => setRefreshKey((value) => value + 1)} disabled={evaluationLoading}><RefreshCw size={15} className={evaluationLoading ? 'spin' : ''} /> Refresh view</Button>} />

      <section className="farm-hero" aria-label="Selected farm overview">
        <div className="farm-hero__copy"><span className="hero-label"><span /> ACTIVE FARM</span><h2>{selectedFarm.name}</h2><div className="farm-hero__meta"><span><MapPin size={15} />{farmLocation || 'Location not recorded'}</span><span className="meta-divider" /><span><Leaf size={15} />{selectedFarm.crop?.name || 'No crop recorded'}</span></div></div>
        <div className="farm-hero__visual" aria-hidden="true"><div className="hero-orbit hero-orbit--outer" /><div className="hero-orbit hero-orbit--inner" /><div className="hero-leaf"><Sprout size={70} strokeWidth={1.05} /></div><span className="hero-coordinate">FIELD · {selectedFarm.location?.latitude != null ? Number(selectedFarm.location.latitude).toFixed(2) : '—'}°</span></div>
        <div className="farm-hero__stats"><div><small>YOUR FARMS</small><strong>{farms.length.toString().padStart(2, '0')}</strong></div><div><small>FIELD UPDATED</small><strong>{selectedFarm.updatedAt ? new Date(selectedFarm.updatedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '—'}</strong></div></div>
      </section>

      <div className="section-heading"><div><span className="eyebrow">FIELD CONDITIONS</span><h2>Environmental snapshot</h2></div><span className="section-heading__note">From the latest farm record</span></div>
      <section className="metrics-grid" aria-label="Environmental snapshot">
        <MetricCard icon={Thermometer} label="Temperature" value={numberOrDash(selectedFarm.weather?.temperature)} unit="°C" tone="coral" />
        <MetricCard icon={Wind} label="Humidity" value={numberOrDash(selectedFarm.weather?.humidity)} unit="%" tone="blue" />
        <MetricCard icon={Droplets} label="Soil moisture" value={numberOrDash(selectedFarm.fieldConditions?.soilMoisture)} unit="%" tone="moss" />
        <MetricCard icon={CloudRain} label="Rainfall" value={numberOrDash(selectedFarm.weather?.rainfall)} unit="mm" tone="gold" />
      </section>

      <div className="dashboard-columns">
        <section className="insights-section">
          <div className="section-heading section-heading--tight"><div><span className="eyebrow">AGRI INTELLIGENCE</span><h2>Insights for this farm</h2></div><span className={`assessment-pill${evaluation?.status === 'SUCCESS' ? ' assessment-pill--ready' : ''}`}>{evaluationLoading ? 'Assessing…' : evaluation ? `${completedCount} modules ready` : 'Not assessed'}</span></div>
          {evaluationError ? <ErrorState title="Farm insights are unavailable" message={evaluationError} onRetry={() => setRefreshKey((value) => value + 1)} /> : evaluationLoading && !evaluation ? <div className="insight-loading"><LoadingState label="Assessing farm conditions…" /><p>Recommendations use the data recorded for {selectedFarm.name}.</p></div> : (
            <div className="insight-grid">
              {insights.map(({ key, label, icon: Icon, tone, hint }) => {
                const record = recommendations[key];
                const ready = record?.status === 'SUCCESS';
                return <article className="insight-card" key={key}><div className="insight-card__top"><span className={`insight-card__icon tone-${tone}`}><Icon size={17} /></span><span className={`status-dot${ready ? ' status-dot--ready' : ''}`} title={recordStatus(record)} /></div><span className="insight-card__hint">{hint}</span><h3>{label}</h3><p className={`insight-card__value${ready ? '' : ' insight-card__value--muted'}`}>{ready ? detailFor(key, record.data) : recordStatus(record)}</p></article>;
              })}
            </div>
          )}
        </section>

        <aside className="health-card"><div className="health-card__head"><div><span className="eyebrow">AT A GLANCE</span><h2>Farm health</h2></div><span className="health-mark"><Sprout size={18} /></span></div><div className="health-summary"><div className="health-summary__ring"><span>{evaluation ? completedCount : '—'}</span><small>{evaluation ? 'of 6' : 'modules'}</small></div><div><strong>{evaluation?.status === 'SUCCESS' ? 'Assessment ready' : evaluation ? 'Partial assessment' : evaluationLoading ? 'In progress' : 'Not assessed'}</strong><p>{evaluation ? 'Based on the selected farm’s recorded conditions.' : 'Farm health indicators appear after the assessment loads.'}</p></div></div><div className="health-list">{[
            ['Disease risk', recordStatus(recommendations.diseaseRisk), recommendations.diseaseRisk],
            ['Water status', recordStatus(recommendations.irrigation), recommendations.irrigation],
            ['Soil & nutrients', recordStatus(recommendations.fertilizer), recommendations.fertilizer],
            ['Market condition', recordStatus(recommendations.market), recommendations.market]
          ].map(([label, value, record]) => <div className="health-row" key={label}><span className="health-row__label"><i className={record?.status === 'SUCCESS' ? 'health-indicator health-indicator--ready' : 'health-indicator'} />{label}</span><span className="health-row__value">{evaluationLoading && !evaluation ? 'Loading' : value}</span></div>)}</div><Link className="health-link" to="/app/evaluation">View farm evaluation <ArrowRight size={15} /></Link></aside>
      </div>
      <div className="dashboard-footnote"><span><Leaf size={14} /> Recommendations reflect the data recorded for this farm.</span><span>AI guidance is a decision aid for your field observations.</span></div>
    </div>
  );
}
