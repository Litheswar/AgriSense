import { ArrowRight, Check, MapPin, Sprout } from 'lucide-react';
import { Link } from 'react-router';
import { useFarms } from '../context/FarmContext.jsx';
import { Button } from '../components/ui/Button.jsx';
import { EmptyState, ErrorState, LoadingState } from '../components/ui/Feedback.jsx';
import { PageHeader } from '../components/ui/PageHeader.jsx';

export function FarmsPage() {
  const { farms, selectedFarmId, setSelectedFarmId, loading, error, refreshFarms } = useFarms();
  return (
    <div className="standard-page">
      <PageHeader eyebrow="YOUR WORKSPACE" title="My farms" description="Choose the farm you want AgriSense to keep in focus." />
      {loading ? <LoadingState label="Loading your farms…" /> : error ? <ErrorState title="Your farms could not be loaded" message={error} onRetry={refreshFarms} /> : farms.length === 0 ? <EmptyState title="No farms in your workspace yet" message="When a farm is connected to your account, it will appear here. Farm records remain protected by your account." action={<Link to="/app/dashboard" className="button button--outline">Back to dashboard <ArrowRight size={16} /></Link>} /> : <div className="farms-grid">{farms.map((farm) => {
        const active = farm._id === selectedFarmId;
        const location = [farm.location?.district, farm.location?.state].filter(Boolean).join(', ');
        return <article className={`farm-card${active ? ' farm-card--active' : ''}`} key={farm._id}><div className="farm-card__top"><span className="farm-card__icon"><Sprout size={19} /></span>{active && <span className="farm-card__active"><Check size={13} /> ACTIVE</span>}</div><h2>{farm.name}</h2><p className="farm-card__location"><MapPin size={15} />{location || 'Location not recorded'}</p><div className="farm-card__facts"><span><small>CURRENT CROP</small><strong>{farm.crop?.name || 'Not recorded'}</strong></span><span><small>SOIL MOISTURE</small><strong>{typeof farm.fieldConditions?.soilMoisture === 'number' ? `${farm.fieldConditions.soilMoisture}%` : 'Not recorded'}</strong></span></div><Button variant={active ? 'soft' : 'outline'} className="farm-card__button" onClick={() => setSelectedFarmId(farm._id)} disabled={active}>{active ? 'Selected farm' : 'Set as active'} {!active && <ArrowRight size={15} />}</Button></article>;
      })}</div>}
      <div className="page-note"><span className="page-note__icon"><Sprout size={17} /></span><p><strong>Farm records are protected.</strong> Only farms returned by your authenticated account are shown here. Farm creation and editing will be added in a later milestone.</p></div>
    </div>
  );
}
