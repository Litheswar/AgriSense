const metricDefinitions = [
  ['temperature', 'Temperature', '°C'],
  ['humidity', 'Humidity', '%'],
  ['rainfall', 'Current precipitation', 'mm'],
  ['recentRainfall', 'Rainfall in the past 24 hours', 'mm'],
  ['expectedRainfall', 'Expected rainfall in the next 24 hours', 'mm'],
  ['rainProbability', 'Maximum hourly rain probability in the next 24 hours', '%']
];

export function weatherPageMode({ loading, error, selectedFarm, selectedFarmId }) {
  if (loading) return 'loading';
  if (error) return 'farm-error';
  if (!selectedFarm || !selectedFarmId) return 'no-farm';
  return 'ready';
}

export function visibleWeatherResult(result, selectedFarmId) {
  return result?.farmId === selectedFarmId ? result : null;
}

export function weatherMetrics(weather) {
  if (!weather || typeof weather !== 'object') return [];
  return metricDefinitions
    .filter(([key]) => weather[key] !== null && weather[key] !== undefined && weather[key] !== '')
    .map(([key, label, unit]) => ({ key, label, value: weather[key], unit }));
}

export function weatherFreshness(freshness) {
  const status = ['RECENT', 'STALE', 'UNKNOWN'].includes(freshness?.status) ? freshness.status : 'UNKNOWN';
  const ageMinutes = Number.isFinite(freshness?.ageMinutes) ? freshness.ageMinutes : null;
  const thresholdHours = Number.isFinite(freshness?.thresholdHours) ? freshness.thresholdHours : null;
  let description = 'Freshness could not be established from the backend response.';
  if (status === 'RECENT') description = ageMinutes === null ? 'The backend marked this weather RECENT.' : `Updated ${formatAge(ageMinutes)} ago.`;
  if (status === 'STALE') description = thresholdHours === null ? 'The backend marked this weather STALE.' : `Older than the configured freshness window of ${thresholdHours} hours.`;
  return { status, ageMinutes, thresholdHours, description };
}

function formatAge(minutes) {
  if (minutes < 60) return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (!remainingMinutes) return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  return `${hours} ${hours === 1 ? 'hour' : 'hours'} ${remainingMinutes} ${remainingMinutes === 1 ? 'minute' : 'minutes'}`;
}

export function weatherSourceLabel(source) {
  if (typeof source !== 'string' || !source.trim()) return null;
  return source.trim().toLowerCase() === 'open-meteo' ? 'Open-Meteo provider data' : source.trim();
}

export function weatherTimestamp(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleString();
}

export function hasWeatherCoordinates(location) {
  const latitude = location?.latitude;
  const longitude = location?.longitude;
  return Number.isFinite(latitude) && latitude >= -90 && latitude <= 90
    && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180;
}

export function canRefreshWeather(location, isBusy = false) {
  return !isBusy && hasWeatherCoordinates(location);
}

export function weatherErrorMessage(error) {
  const code = error?.code;
  const message = error?.message && error.message !== 'An unexpected error occurred.' && error.message !== 'Request data is invalid.' ? error.message : null;
  if (error?.status === 401 || code === 'UNAUTHENTICATED') return message || 'Authentication is required. Sign in again to view Farm weather.';
  if (error?.status === 404 || code === 'FARM_NOT_FOUND') return message || 'Farm not found.';
  if (code === 'INSUFFICIENT_LOCATION_DATA') return message || 'Farm latitude and longitude are required before refreshing weather. Edit this Farm to add valid coordinates.';
  if (code === 'INVALID_LATITUDE') return message || 'Farm latitude must be between -90 and 90. Edit the Farm location before refreshing.';
  if (code === 'INVALID_LONGITUDE') return message || 'Farm longitude must be between -180 and 180. Edit the Farm location before refreshing.';
  if (code === 'WEATHER_PROVIDER_TIMEOUT' || code === 'WEATHER_PROVIDER_UNAVAILABLE') return message || 'The weather provider could not be reached. Your previously saved weather remains available.';
  if (code === 'WEATHER_PROVIDER_HTTP_ERROR' || (error?.status === 503 && code !== 'AUTH_NOT_CONFIGURED')) return message || 'The weather provider returned an unsuccessful response. Your previously saved weather remains available.';
  if (code === 'INVALID_WEATHER_RESPONSE' || code === 'MISSING_WEATHER_VARIABLE') return message || 'The weather provider returned incomplete or invalid weather data.';
  if (error?.status === 503 || code === 'AUTH_NOT_CONFIGURED') return message || 'The AgriSense service is temporarily unavailable.';
  return message || error?.message || 'Farm weather could not be loaded. Please try again.';
}

export function createWeatherRequestTracker(initialFarmId = null) {
  let farmId = initialFarmId;
  let sequence = 0;
  let inFlight = null;
  return {
    setFarmId(nextFarmId) {
      if (nextFarmId !== farmId) {
        farmId = nextFarmId;
        sequence += 1;
        inFlight = null;
      }
    },
    begin(requestedFarmId, kind) {
      if (!requestedFarmId || requestedFarmId !== farmId || inFlight) return null;
      sequence += 1;
      inFlight = { id: sequence, farmId: requestedFarmId, kind };
      return sequence;
    },
    isCurrent(requestId, requestedFarmId) {
      return requestId === sequence && requestedFarmId === farmId && inFlight?.id === requestId;
    },
    finish(requestId, requestedFarmId) {
      if (!this.isCurrent(requestId, requestedFarmId)) return false;
      inFlight = null;
      return true;
    },
    activeKind() { return inFlight?.kind || null; }
  };
}
