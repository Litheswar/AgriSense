import { useEffect, useState } from 'react';
import { ArrowLeft, CloudSun, MapPin, Pencil, Sprout } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { farmsApi } from '../api/farms.js';
import { useFarms } from '../context/FarmContext.jsx';
import { Button } from '../components/ui/Button.jsx';
import { ErrorState, LoadingState } from '../components/ui/Feedback.jsx';
import { PageHeader } from '../components/ui/PageHeader.jsx';

function display(value, suffix = '') { return value === null || value === undefined || value === '' ? 'Not recorded' : `${value}${suffix}`; }
function Detail({ label, value }) { return <div className="farm-detail"><small>{label}</small><strong>{value}</strong></div>; }

export function FarmDetailsPage() {
  const { farmId } = useParams();
  const { farms, selectedFarmId, setSelectedFarmId } = useFarms();
  const [farm, setFarm] = useState(() => farms.find((item) => item._id === farmId) || null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [weatherError, setWeatherError] = useState('');
  const [loadVersion, setLoadVersion] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true); setError('');
    farmsApi.get(farmId).then(async (result) => {
      if (!active) return;
      let nextFarm = result.farm;
      const hasCoordinates = Number.isFinite(nextFarm.location?.latitude) && Number.isFinite(nextFarm.location?.longitude);
      const hasProviderWeather = nextFarm.weather?.source === 'open-meteo';
      if (hasCoordinates && !hasProviderWeather) {
        setWeatherLoading(true); setWeatherError('');
        try {
          const refreshed = await farmsApi.refreshWeather(farmId);
          nextFarm = { ...nextFarm, weather: refreshed.weather };
        } catch (weatherRequestError) {
          setWeatherError(weatherRequestError.message || 'Weather data is not available yet.');
        } finally {
          if (active) setWeatherLoading(false);
        }
      }
      if (active) setFarm(nextFarm);
    })
      .catch((requestError) => { if (active) { setFarm(null); setError(requestError.message); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [farmId, loadVersion]);

  if (loading) return <div className="standard-page"><LoadingState label="Loading farm details…" /></div>;
  if (error || !farm) return <div className="standard-page"><PageHeader eyebrow="FARM RECORD" title="Farm details" /><ErrorState title="Farm details are unavailable" message={error || 'This farm could not be found.'} onRetry={() => setLoadVersion((value) => value + 1)} /><Link className="text-link farm-back-link" to="/app/farms"><ArrowLeft size={15} /> Back to My Farms</Link></div>;

  const location = [farm.location?.village, farm.location?.district, farm.location?.state].filter(Boolean).join(', ');
  const active = selectedFarmId === farm._id;
  return <div className="standard-page farm-details-page">
    <Link className="text-link farm-back-link" to="/app/farms"><ArrowLeft size={15} /> Back to My Farms</Link>
    <PageHeader eyebrow="FARM RECORD" title={farm.name} description={location || 'Location not recorded'} action={<div className="farm-details__actions">{!active && <Button variant="outline" onClick={() => setSelectedFarmId(farm._id)}>Select farm</Button>}<Link className="button button--primary" to="/app/farms" state={{ editFarmId: farm._id }}><Pencil size={15} /> Edit farm</Link></div>} />
    <section className="farm-detail-panel"><div className="farm-detail-panel__heading"><span className="farm-card__icon"><MapPin size={18} /></span><div><h2>Farm details</h2><p>Basic information for this farm.</p></div></div><div className="farm-detail-grid"><Detail label="Farm name" value={farm.name} /><Detail label="State" value={display(farm.location?.state)} /><Detail label="District" value={display(farm.location?.district)} /><Detail label="Village" value={display(farm.location?.village)} /><Detail label="Latitude" value={display(farm.location?.latitude)} /><Detail label="Longitude" value={display(farm.location?.longitude)} /><Detail label="Current crop" value={display(farm.crop?.name)} /><Detail label="Selected farm" value={active ? 'Yes' : 'No'} /></div></section>
    <div className="farm-detail-columns"><section className="farm-detail-panel"><div className="farm-detail-panel__heading"><span className="farm-card__icon"><Sprout size={18} /></span><div><h2>Soil & field conditions</h2><p>Values stored in the farm record.</p></div></div><div className="farm-detail-grid"><Detail label="Nitrogen (N)" value={display(farm.soil?.nitrogen)} /><Detail label="Phosphorus (P)" value={display(farm.soil?.phosphorus)} /><Detail label="Potassium (K)" value={display(farm.soil?.potassium)} /><Detail label="Soil pH" value={display(farm.soil?.ph)} /><Detail label="Soil moisture" value={display(farm.fieldConditions?.soilMoisture, '%')} /></div></section>
      <section className="farm-detail-panel"><div className="farm-detail-panel__heading"><span className="farm-card__icon"><CloudSun size={18} /></span><div><h2>Weather</h2><p>{weatherLoading ? 'Fetching weather from the configured weather service…' : farm.weather?.source === 'open-meteo' ? 'Weather data fetched from the configured weather service.' : 'Weather data not available yet.'}</p></div></div>{weatherError && <div className="farm-detail-weather-error" role="status">{weatherError}</div>}<div className="farm-detail-grid"><Detail label="Temperature" value={display(farm.weather?.temperature, ' °C')} /><Detail label="Humidity" value={display(farm.weather?.humidity, '%')} /><Detail label="Rainfall" value={display(farm.weather?.rainfall, ' mm')} /><Detail label="Recorded" value={farm.weather?.recordedAt ? new Date(farm.weather.recordedAt).toLocaleString() : 'Not recorded'} /><Detail label="Source" value={farm.weather?.source || 'Not recorded'} /></div></section></div>
    <section className="farm-detail-panel"><div className="farm-detail-panel__heading"><div><h2>Record history</h2><p>Server-managed timestamps.</p></div></div><div className="farm-detail-grid"><Detail label="Created" value={farm.createdAt ? new Date(farm.createdAt).toLocaleString() : 'Not recorded'} /><Detail label="Last updated" value={farm.updatedAt ? new Date(farm.updatedAt).toLocaleString() : 'Not recorded'} /></div></section>
  </div>;
}
