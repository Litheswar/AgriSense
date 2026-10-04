import { ChevronDown, Leaf } from 'lucide-react';
import { useFarms } from '../../context/FarmContext.jsx';

export function FarmSelector({ compact = false }) {
  const { farms, selectedFarmId, setSelectedFarmId, loading, error } = useFarms();
  return (
    <label className={`farm-select${compact ? ' farm-select--compact' : ''}`}>
      {!compact && <span className="farm-select__icon"><Leaf size={16} /></span>}
      <select aria-label="Select active Farm" value={selectedFarmId} disabled={loading || Boolean(error) || farms.length === 0} onChange={(event) => setSelectedFarmId(event.target.value)}>
        {loading && <option value="">Loading farms…</option>}
        {!loading && error && <option value={selectedFarmId}>{selectedFarmId ? 'Farm list unavailable' : 'Could not load farms'}</option>}
        {!loading && !error && farms.length === 0 && <option value="">No farms yet</option>}
        {farms.map((farm) => <option key={farm._id} value={farm._id}>{farm.name}</option>)}
      </select>
      <ChevronDown size={15} className="farm-select__chevron" aria-hidden="true" />
    </label>
  );
}
