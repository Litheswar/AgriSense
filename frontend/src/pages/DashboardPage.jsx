import { Activity, ArrowRight, BarChart3, CloudRain, Droplets, FlaskConical, Leaf, LineChart, MapPin, RefreshCw, ShieldAlert, Sprout, Thermometer, Wheat, Wind } from 'lucide-react';
import { Link } from 'react-router';
import { useAuth } from '../context/AuthContext.jsx';
import { useFarms } from '../context/FarmContext.jsx';
import { Button } from '../components/ui/Button.jsx';
import { EmptyState, ErrorState, LoadingState } from '../components/ui/Feedback.jsx';
import { PageHeader } from '../components/ui/PageHeader.jsx';
import { dashboardDate, dashboardModules, dashboardTimestamp, dashboardValue, dashboardWeatherProvenance } from '../lib/dashboardPresentation.js';

const moduleIcons = {
  cropRecommendation: Sprout,
  irrigation: Droplets,
  fertilizer: FlaskConical,
  diseaseDetection: ShieldAlert,
  diseaseRisk: Activity,
  cropRanking: Wheat,
  market: BarChart3,
  evaluation: LineChart
};

function MetricCard({ icon: Icon, label, value, unit, tone }) {
  const hasValue = value !== 'Not recorded';
  return <article className="metric-card"><span className={`metric-card__icon tone-${tone}`}><Icon size={18} aria-hidden="true" /></span><span className="metric-card__label">{label}</span><strong className={`metric-card__value${hasValue ? '' : ' metric-card__value--missing'}`}>{value}{hasValue && unit && <small>{unit}</small>}</strong></article>;
}

export function DashboardPage() {
  const { user } = useAuth();
  const { farms, selectedFarm, loading: farmsLoading, error: farmsError, refreshFarms } = useFarms();
  const firstName = user?.name?.trim().split(/\s+/)[0] || 'there';

  if (farmsLoading) return <div className="dashboard-page"><LoadingState label="Loading your Farm workspace…" /></div>;
  if (farmsError) return <div className="dashboard-page"><ErrorState title="Your Farms could not be loaded" message={farmsError} onRetry={refreshFarms} /></div>;
  if (!farms.length) {
    return <div className="dashboard-page"><PageHeader eyebrow="YOUR FIELD, IN FOCUS" title={`Good day, ${firstName}`} description="A clear view of your Farm starts here." /><EmptyState title="Create your first Farm" message="Add your Farm details to see its recorded conditions and open AgriSense decision-support modules." action={<Link className="button button--primary" to="/app/farms?create=1">Create your first Farm <ArrowRight size={16} /></Link>} /><div className="farm-onboarding-steps" aria-label="Getting started"><span><b>1</b> Create your first Farm</span><ArrowRight size={15} /><span><b>2</b> Add your Farm details</span><ArrowRight size={15} /><span><b>3</b> Open a decision-support module</span></div></div>;
  }
  if (!selectedFarm) return <div className="dashboard-page"><LoadingState label="Opening your selected Farm…" /></div>;

  const farmLocation = [selectedFarm.location?.district, selectedFarm.location?.state].filter(Boolean).join(', ');
  const weatherMeta = dashboardWeatherProvenance(selectedFarm.weather);
  const updatedAt = dashboardDate(selectedFarm.updatedAt);
  const weatherDetails = [
    weatherMeta.source && `Source: ${weatherMeta.source}`,
    weatherMeta.recordedAt && `Recorded: ${weatherMeta.recordedAt}`,
    weatherMeta.fetchedAt && `Fetched: ${weatherMeta.fetchedAt}`
  ].filter(Boolean);

  return <div className="dashboard-page">
    <PageHeader eyebrow="YOUR FIELD, IN FOCUS" title={`Good day, ${firstName}`} description="Your selected Farm’s saved conditions and a direct path to each AgriSense module." action={<Button variant="outline" onClick={refreshFarms} disabled={farmsLoading}><RefreshCw size={15} aria-hidden="true" /> Refresh Farm data</Button>} />

    <section className="farm-hero" aria-label="Selected Farm overview">
      <div className="farm-hero__copy"><span className="hero-label"><span /> SELECTED FARM</span><h2>{selectedFarm.name}</h2><div className="farm-hero__meta"><span><MapPin size={15} aria-hidden="true" />{farmLocation || 'Location not recorded'}</span><span className="meta-divider" aria-hidden="true" /><span><Leaf size={15} aria-hidden="true" />{selectedFarm.crop?.name || 'Crop not recorded'}</span></div></div>
      <div className="farm-hero__visual" aria-hidden="true"><div className="hero-orbit hero-orbit--outer" /><div className="hero-orbit hero-orbit--inner" /><div className="hero-leaf"><Sprout size={70} strokeWidth={1.05} /></div><span className="hero-coordinate">FIELD · {selectedFarm.location?.latitude != null ? `${selectedFarm.location.latitude}°` : '—'}</span></div>
      <div className="farm-hero__stats"><div><small>YOUR FARMS</small><strong>{farms.length}</strong></div><div><small>FIELD UPDATED</small><strong>{updatedAt || 'Not recorded'}</strong></div></div>
    </section>

    <div className="section-heading"><div><span className="eyebrow">SAVED CONDITIONS</span><h2>Environmental snapshot</h2></div><Link className="section-heading__link" to="/app/weather">Weather details <ArrowRight size={14} aria-hidden="true" /></Link></div>
    <section className="metrics-grid" aria-label="Saved environmental conditions">
      <MetricCard icon={Thermometer} label="Temperature" value={dashboardValue(selectedFarm.weather?.temperature)} unit="°C" tone="coral" />
      <MetricCard icon={Wind} label="Humidity" value={dashboardValue(selectedFarm.weather?.humidity)} unit="%" tone="blue" />
      <MetricCard icon={Droplets} label="Soil moisture" value={dashboardValue(selectedFarm.fieldConditions?.soilMoisture)} unit="%" tone="moss" />
      <MetricCard icon={CloudRain} label="Rainfall" value={dashboardValue(selectedFarm.weather?.rainfall)} unit="mm" tone="gold" />
    </section>
    <section className="dashboard-soil" aria-labelledby="dashboard-soil-heading"><div><span className="eyebrow">FARM OVERVIEW</span><h2 id="dashboard-soil-heading">Recorded soil profile</h2></div><dl>{[['Nitrogen (N)', selectedFarm.soil?.nitrogen], ['Phosphorus (P)', selectedFarm.soil?.phosphorus], ['Potassium (K)', selectedFarm.soil?.potassium], ['Soil pH', selectedFarm.soil?.ph]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{dashboardValue(value)}</dd></div>)}</dl></section>
    <section className="dashboard-weather-meta" aria-label="Saved weather provenance"><CloudRain size={16} aria-hidden="true" /><p>{weatherDetails.length ? weatherDetails.join(' · ') : 'Weather source and timestamps have not been recorded on this Farm.'} <Link to="/app/weather">View saved weather status</Link></p></section>

    <section className="dashboard-modules" aria-labelledby="dashboard-modules-heading"><div className="section-heading"><div><span className="eyebrow">AGRI INTELLIGENCE</span><h2 id="dashboard-modules-heading">Decision-support modules</h2></div><span className="section-heading__note">Choose a module to continue</span></div><div className="dashboard-module-grid">{dashboardModules.map((module) => {
      const Icon = moduleIcons[module.key];
      return <Link className={`dashboard-module-card dashboard-module-card--${module.key}`} to={module.path} key={module.key}><span className="dashboard-module-card__icon"><Icon size={18} aria-hidden="true" /></span><span className="dashboard-module-card__eyebrow">FARM DECISION SUPPORT</span><h3>{module.label}</h3><p>{module.description}</p><span className="dashboard-module-card__action">Open module <ArrowRight size={14} aria-hidden="true" /></span></Link>;
    })}</div></section>

    <div className="dashboard-footnote"><span><Leaf size={14} aria-hidden="true" /> Conditions shown here are values saved with this Farm.</span><span>Open a module to request its latest decision-support result.</span></div>
  </div>;
}
