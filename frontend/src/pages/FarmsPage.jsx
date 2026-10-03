import { useEffect, useState } from 'react';
import { Check, Eye, MapPin, Pencil, Plus, Sprout, Trash2 } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router';
import { useFarms } from '../context/FarmContext.jsx';
import { Button } from '../components/ui/Button.jsx';
import { EmptyState, ErrorState, LoadingState } from '../components/ui/Feedback.jsx';
import { PageHeader } from '../components/ui/PageHeader.jsx';
import { FarmForm } from '../components/farm/FarmForm.jsx';

export function FarmsPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { farms, selectedFarmId, setSelectedFarmId, loading, error, refreshFarms, createFarm, updateFarm, deleteFarm } = useFarms();
  const [formFarm, setFormFarm] = useState(null);
  const [formOpen, setFormOpen] = useState(() => new URLSearchParams(window.location.search).get('create') === '1');
  const [deletingFarm, setDeletingFarm] = useState(null);
  const [busyDelete, setBusyDelete] = useState(false);
  const [notice, setNotice] = useState('');
  const [pageError, setPageError] = useState('');

  useEffect(() => {
    const requestedFarm = location.state?.editFarmId;
    const match = farms.find((farm) => farm._id === requestedFarm);
    if (match) { setFormFarm(match); setFormOpen(true); navigate(location.pathname, { replace: true, state: null }); }
  }, [farms, location.pathname, location.state, navigate]);

  const closeForm = () => { setFormOpen(false); setFormFarm(null); };
  async function saveFarm(payload) {
    setPageError('');
    if (formFarm) { await updateFarm(formFarm._id, payload); setNotice('Farm updated successfully.'); }
    else { await createFarm(payload); setNotice('Farm created successfully. It is now your selected farm.'); }
    closeForm();
  }
  async function confirmDelete() {
    if (!deletingFarm) return;
    setBusyDelete(true); setPageError('');
    try { await deleteFarm(deletingFarm._id); setNotice('Farm deleted successfully.'); setDeletingFarm(null); }
    catch (requestError) { setPageError(requestError.message || 'The farm could not be deleted.'); setDeletingFarm(null); }
    finally { setBusyDelete(false); }
  }

  return <div className="standard-page">
    <PageHeader eyebrow="YOUR WORKSPACE" title="My Farms" description="Manage your farm records and choose which farm AgriSense keeps in focus." action={<Button onClick={() => { setFormFarm(null); setFormOpen(true); }}><Plus size={16} /> Add Farm</Button>} />
    {notice && <div className="farm-notice" role="status" aria-live="polite"><Check size={16} />{notice}<button type="button" aria-label="Dismiss message" onClick={() => setNotice('')}>×</button></div>}
    {pageError && <ErrorState title="Farm action failed" message={pageError} onRetry={() => setPageError('')} />}
    {loading ? <LoadingState label="Loading farms…" /> : error ? <ErrorState title="Your farms could not be loaded" message={error} onRetry={refreshFarms} /> : farms.length === 0 ? <EmptyState title="No farms yet" message="Create your first farm to start using AgriSense’s AI-powered agricultural recommendations." action={<Button onClick={() => { setFormFarm(null); setFormOpen(true); }}><Plus size={16} /> Create Your First Farm</Button>} /> : <div className="farms-grid">{farms.map((farm) => {
      const active = farm._id === selectedFarmId;
      const location = [farm.location?.village, farm.location?.district, farm.location?.state].filter(Boolean).join(', ');
      return <article className={`farm-card${active ? ' farm-card--active' : ''}`} key={farm._id}>
        <div className="farm-card__top"><span className="farm-card__icon"><Sprout size={19} /></span>{active && <span className="farm-card__active"><Check size={13} /> SELECTED</span>}</div>
        <h2>{farm.name}</h2><p className="farm-card__location"><MapPin size={15} />{location || 'Location not recorded'}</p>
        <div className="farm-card__facts"><span><small>CURRENT CROP</small><strong>{farm.crop?.name || 'Not recorded'}</strong></span><span><small>SOIL MOISTURE</small><strong>{typeof farm.fieldConditions?.soilMoisture === 'number' ? `${farm.fieldConditions.soilMoisture}%` : 'Not recorded'}</strong></span><span><small>SOIL pH</small><strong>{farm.soil?.ph ?? 'Not recorded'}</strong></span><span><small>UPDATED</small><strong>{farm.updatedAt ? new Date(farm.updatedAt).toLocaleDateString() : 'Not recorded'}</strong></span></div>
        <div className="farm-card__actions"><Button variant={active ? 'soft' : 'outline'} onClick={() => setSelectedFarmId(farm._id)} disabled={active}>{active ? 'Selected' : 'Select farm'}</Button><Link className="button button--outline" to={`/app/farms/${encodeURIComponent(farm._id)}`} aria-label={`View ${farm.name}`}><Eye size={15} /> View</Link><Button variant="outline" onClick={() => { setFormFarm(farm); setFormOpen(true); }} aria-label={`Edit ${farm.name}`}><Pencil size={15} /> Edit</Button><Button variant="outline" className="farm-card__delete" onClick={() => setDeletingFarm(farm)} aria-label={`Delete ${farm.name}`}><Trash2 size={15} /></Button></div>
      </article>;
    })}</div>}

    {formOpen && <div className="farm-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeForm(); }}><section className="farm-dialog" role="dialog" aria-modal="true" aria-labelledby="farm-dialog-title"><div className="farm-dialog__header"><div><span className="eyebrow">FARM MANAGEMENT</span><h2 id="farm-dialog-title">{formFarm ? 'Edit farm' : 'Add a farm'}</h2></div><button type="button" className="farm-dialog__close" onClick={closeForm} aria-label="Close">×</button></div><FarmForm key={formFarm?._id || 'new'} farm={formFarm} onSubmit={saveFarm} onCancel={closeForm} submitLabel={formFarm ? 'Save changes' : 'Create farm'} /></section></div>}

    {deletingFarm && <div className="farm-dialog-backdrop"><section className="farm-confirm" role="alertdialog" aria-modal="true" aria-labelledby="delete-title" aria-describedby="delete-description"><span className="farm-confirm__icon"><Trash2 size={20} /></span><h2 id="delete-title">Delete Farm?</h2><p id="delete-description">This will permanently remove <strong>{deletingFarm.name}</strong>. This action cannot be undone.</p><div className="farm-form__actions"><Button variant="outline" onClick={() => setDeletingFarm(null)} disabled={busyDelete}>Cancel</Button><Button className="button--danger" onClick={confirmDelete} disabled={busyDelete}>{busyDelete ? 'Deleting farm…' : 'Delete Farm'}</Button></div></section></div>}
    <div className="page-note"><span className="page-note__icon"><Sprout size={17} /></span><p><strong>Farm records are protected.</strong> Farm data is loaded and changed through your authenticated account. The server determines ownership for every operation.</p></div>
  </div>;
}
