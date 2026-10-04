export function reconcileSelectedFarmId({ farms, selectedFarmId, loading, error }) {
  const selectedId = typeof selectedFarmId === 'string' ? selectedFarmId : '';
  if (loading || error) return selectedId;
  if (!Array.isArray(farms) || farms.length === 0) return '';
  return farms.some((farm) => farm?._id === selectedId) ? selectedId : farms[0]?._id || '';
}
