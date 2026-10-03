import { ChevronDown, Leaf } from 'lucide-react';
import { useFarms } from '../../context/FarmContext.jsx';

export function FarmSelector({ compact = false }) {
  const { farms, selectedFarmId, setSelectedFarmId, loading } = useFarms();
  return (
    <label className={`farm-select${compact ? ' farm-select--compact' : ''}`}>
      {!compact && <span className="farm-select__icon"><Leaf size={16} /></span>}
      <select aria-label="Select active farm" value={selectedFarmId} disabled={loading || farms.length === 0} onChange={(event) => setSelectedFarmId(event.target.value)}>
        {loading && <option value="">Loading farms…</option>}
        {!loading && farms.length === 0 && <option value="">No farms yet</option>}
        {farms.map((farm) => <option key={farm._id} value={farm._id}>{farm.name}</option>)}
      </select>
      <ChevronDown size={15} className="farm-select__chevron" aria-hidden="true" />
    </label>
  );
}
