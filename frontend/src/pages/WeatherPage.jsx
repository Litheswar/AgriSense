import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, ArrowRight, Check, CloudRain, CloudSun, Droplets, MapPin, RefreshCw, Thermometer, Wind } from 'lucide-react';
import { Link } from 'react-router';
import { weatherApi } from '../api/weather.js';
import { useFarms } from '../context/FarmContext.jsx';
import { Button } from '../components/ui/Button.jsx';
import { EmptyState, ErrorState, LoadingState } from '../components/ui/Feedback.jsx';
import { PageHeader } from '../components/ui/PageHeader.jsx';
import { canRefreshWeather, createWeatherRequestTracker, hasWeatherCoordinates, visibleWeatherResult, weatherErrorMessage, weatherFreshness, weatherMetrics, weatherPageMode, weatherSourceLabel, weatherTimestamp } from '../lib/weatherPresentation.js';

const metricIcons = {
  temperature: Thermometer,
  humidity: Wind,
  rainfall: CloudRain,
  recentRainfall: Droplets,
  expectedRainfall: CloudRain,
  rainProbability: CloudSun
};

function WeatherMetric({ metric }) {
  const Icon = metricIcons[metric.key] || CloudSun;
  return <div className="weather-metric"><span className="weather-metric__icon"><Icon size={17} aria-hidden="true" /></span><div className="weather-metric__copy"><span>{metric.label}</span><strong>{metric.value}<small> {metric.unit}</small></strong></div></div>;
}

export function WeatherPage() {
  const { farms, selectedFarm, selectedFarmId, loading: farmsLoading, error: farmsError, refreshFarms } = useFarms();
  const [weatherResult, setWeatherResult] = useState(null);
  const [weatherError, setWeatherError] = useState(null);
  const [busyKind, setBusyKind] = useState('');
  const [notice, setNotice] = useState('');
  const requestTracker = useRef(createWeatherRequestTracker(selectedFarmId));
  const hasCoordinates = hasWeatherCoordinates(selectedFarm?.location);

  const loadStoredWeather = useCallback(async (farmId) => {
    const requestId = requestTracker.current.begin(farmId, 'read');
    if (requestId === null) return;
    setBusyKind('read');
    setWeatherError(null);
    setNotice('');
    try {
      const response = await weatherApi.get(farmId);
      if (requestTracker.current.isCurrent(requestId, farmId)) setWeatherResult(response);
    } catch (error) {
      if (requestTracker.current.isCurrent(requestId, farmId)) setWeatherError({ farmId, operation: 'read', cause: error });
    } finally {
      if (requestTracker.current.finish(requestId, farmId)) setBusyKind('');
    }
  }, []);

  useEffect(() => {
    requestTracker.current.setFarmId(selectedFarmId);
    setWeatherResult(null);
    setWeatherError(null);
    setBusyKind('');
    setNotice('');
    if (selectedFarm && selectedFarmId) loadStoredWeather(selectedFarmId);
    return () => requestTracker.current.setFarmId(null);
  }, [selectedFarmId, selectedFarm, loadStoredWeather]);

  const refreshWeather = useCallback(async () => {
    if (!selectedFarm || !selectedFarmId || busyKind || requestTracker.current.activeKind()) return;
    if (!hasWeatherCoordinates(selectedFarm.location)) {
      setWeatherError({ farmId: selectedFarmId, operation: 'refresh', cause: { code: 'INSUFFICIENT_LOCATION_DATA' } });
      return;
    }
    const requestId = requestTracker.current.begin(selectedFarmId, 'refresh');
    if (requestId === null) return;
    setBusyKind('refresh');
    setWeatherError(null);
    setNotice('');
    try {
      const response = await weatherApi.refresh(selectedFarmId);
      if (requestTracker.current.isCurrent(requestId, selectedFarmId)) {
        setWeatherResult(response);
        setNotice(`Weather refreshed for ${selectedFarm.name}.`);
      }
    } catch (error) {
      if (requestTracker.current.isCurrent(requestId, selectedFarmId)) setWeatherError({ farmId: selectedFarmId, operation: 'refresh', cause: error });
    } finally {
      if (requestTracker.current.finish(requestId, selectedFarmId)) setBusyKind('');
    }
  }, [selectedFarm, selectedFarmId, busyKind]);

  const mode = weatherPageMode({ loading: farmsLoading, error: farmsError, selectedFarm, selectedFarmId });
  if (mode === 'loading') return <div className="weather-page"><LoadingState label="Loading your selected Farm…" /></div>;
  if (mode === 'farm-error') return <div className="weather-page"><PageHeader eyebrow="FARM WEATHER" title="Weather" description="Read and refresh provider weather saved for your Farm." /><ErrorState title="Your Farms could not be loaded" message={farmsError} onRetry={refreshFarms} /></div>;
  if (mode === 'no-farm') {
    const emptyMessage = farms.length === 0
      ? 'Create a Farm before viewing weather. Weather data is stored with each Farm.'
      : 'Select a Farm in the top bar to view its saved weather conditions.';
    return <div className="weather-page"><PageHeader eyebrow="FARM WEATHER" title="Weather" description="Read and refresh provider weather saved for your Farm." /><EmptyState title={farms.length === 0 ? 'Create a Farm to get started' : 'Select a Farm to get started'} message={emptyMessage} action={<Link className="button button--primary" to="/app/farms">Manage your Farms <ArrowRight size={16} /></Link>} /></div>;
  }

  const result = visibleWeatherResult(weatherResult, selectedFarmId);
  const currentError = weatherError?.farmId === selectedFarmId ? weatherError : null;
  const weather = result?.weather && typeof result.weather === 'object' ? result.weather : {};
  const metrics = weatherMetrics(weather);
  const freshness = weatherFreshness(result?.freshness);
  const source = weatherSourceLabel(weather.source);
  const isOpenMeteo = typeof weather.source === 'string' && weather.source.trim().toLowerCase() === 'open-meteo';
  const location = [selectedFarm.location?.village, selectedFarm.location?.district, selectedFarm.location?.state].filter(Boolean).join(', ');
  const coordinates = hasCoordinates ? `${selectedFarm.location.latitude}, ${selectedFarm.location.longitude}` : '';

  return <div className="weather-page">
    <PageHeader eyebrow="FARM WEATHER" title="Weather" description="Environmental weather data saved for your selected Farm. Provider observations and forecasts are not AgriSense AI predictions." />

    <section className="weather-farm-context" aria-labelledby="weather-farm-heading"><span className="weather-farm-context__icon"><MapPin size={18} aria-hidden="true" /></span><div className="weather-farm-context__copy"><span className="eyebrow">WEATHER FOR THIS FARM</span><h2 id="weather-farm-heading">{selectedFarm.name}</h2><p>{location || 'Location not recorded'}</p>{coordinates && <span className="weather-farm-context__coordinates">Coordinates: {coordinates}</span>}</div><span className="weather-farm-context__active"><Check size={13} aria-hidden="true" /> SELECTED</span></section>

    <div className="weather-actions"><Button onClick={refreshWeather} disabled={!canRefreshWeather(selectedFarm.location, Boolean(busyKind))}><RefreshCw size={16} aria-hidden="true" className={busyKind === 'refresh' ? 'spin' : ''} />{busyKind === 'refresh' ? 'Refreshing Weather…' : 'Refresh Weather'}</Button>{busyKind === 'read' && <span role="status">Loading saved weather…</span>}</div>

    {!hasCoordinates && <div className="weather-location-required" role="alert"><AlertTriangle size={17} aria-hidden="true" /><div><strong>Farm coordinates are required to refresh weather.</strong><p>Add valid latitude and longitude values to this Farm. Any weather already saved will still be shown.</p><Link className="button button--outline" to={`/app/farms/${encodeURIComponent(selectedFarmId)}`}>Edit Farm location</Link></div></div>}

    {busyKind === 'read' && !result && <div className="weather-loading"><LoadingState label="Reading saved Farm weather…" /><p>This read uses weather already stored by AgriSense; it does not contact the weather provider.</p></div>}
    {busyKind === 'refresh' && <div className="weather-loading"><LoadingState label="Refreshing weather from the configured provider…" /><p>Your current saved weather stays visible until the refresh completes.</p></div>}
    {notice && <div className="weather-success" role="status"><Check size={16} aria-hidden="true" /><span>{notice}</span></div>}
    {currentError && currentError.cause?.code !== 'INSUFFICIENT_LOCATION_DATA' && <div className="weather-error"><ErrorState title={currentError.operation === 'refresh' ? 'Weather refresh failed' : 'Saved weather could not be loaded'} message={weatherErrorMessage(currentError.cause)} onRetry={currentError.operation === 'refresh' ? refreshWeather : () => loadStoredWeather(selectedFarmId)} /></div>}

    {result && <section className="weather-status-panel" aria-labelledby="weather-status-heading"><div className="weather-status-panel__heading"><div><span className="eyebrow">WEATHER STATUS</span><h2 id="weather-status-heading">Saved provider data</h2></div><span className={`weather-freshness weather-freshness--${freshness.status.toLowerCase()}`}><span className="weather-freshness__dot" aria-hidden="true" />{freshness.status}</span></div><p className="weather-status-panel__description">{freshness.description}</p>{freshness.status === 'STALE' && <p className="weather-stale-note">This saved weather is older than the backend’s configured freshness window. It remains available; refresh it when you need newer provider data.</p>}<dl className="weather-provenance">{source && <div><dt>Source</dt><dd>{source}</dd></div>}{weather.recordedAt && <div><dt>{isOpenMeteo ? 'Observed' : 'Recorded'}</dt><dd><time dateTime={weather.recordedAt}>{weatherTimestamp(weather.recordedAt) || 'Timestamp unavailable'}</time></dd></div>}{weather.fetchedAt && <div><dt>Fetched</dt><dd><time dateTime={weather.fetchedAt}>{weatherTimestamp(weather.fetchedAt) || 'Timestamp unavailable'}</time></dd></div>}</dl></section>}

    {result && <section className="weather-data-panel" aria-labelledby="weather-data-heading" aria-live="polite"><div className="weather-data-panel__heading"><div><span className="eyebrow">ENVIRONMENTAL CONDITIONS</span><h2 id="weather-data-heading">Weather observations and provider summary</h2></div><span>Backend values and units</span></div>{metrics.length ? <div className="weather-metrics">{metrics.map((metric) => <WeatherMetric key={metric.key} metric={metric} />)}</div> : <p className="weather-no-data">No weather values are currently stored for this Farm.</p>}</section>}

    <aside className="weather-information-note"><CloudSun size={18} aria-hidden="true" /><p><strong>Weather data, not an AI forecast.</strong> Current conditions and the next-24-hour rainfall summaries come from the configured weather provider. Irrigation and Disease Risk use saved Farm weather as input to their separate decision engines.</p></aside>
  </div>;
}
