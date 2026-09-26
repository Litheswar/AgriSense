/** Open-Meteo client and normalizer. This service has no Farm or decision-engine responsibilities. */
const ENDPOINT = 'https://api.open-meteo.com/v1/forecast';

function fail(code, message) { const error = new Error(message); error.code = code; return error; }
function number(value, name, min = -Infinity, max = Infinity) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw fail('INVALID_WEATHER_RESPONSE', `Open-Meteo returned an invalid ${name}.`);
  }
  return value;
}
function date(value) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) throw fail('INVALID_WEATHER_RESPONSE', 'Open-Meteo returned an invalid timestamp.');
  return new Date(/(?:Z|[+-]\d\d:\d\d)$/.test(value) ? value : `${value}Z`);
}

class WeatherService {
  constructor({ fetchImpl = global.fetch, timeoutMs = 8000 } = {}) { this.fetchImpl = fetchImpl; this.timeoutMs = timeoutMs; }
  async getWeather(latitude, longitude) {
    if (latitude === null || latitude === undefined || longitude === null || longitude === undefined) throw fail('INSUFFICIENT_LOCATION_DATA', 'Farm latitude and longitude are required for live weather.');
    if (typeof latitude !== 'number' || !Number.isFinite(latitude) || latitude < -90 || latitude > 90) throw fail('INVALID_LATITUDE', 'Farm latitude must be between -90 and 90.');
    if (typeof longitude !== 'number' || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) throw fail('INVALID_LONGITUDE', 'Farm longitude must be between -180 and 180.');
    const url = new URL(ENDPOINT);
    Object.entries({ latitude, longitude, current: 'temperature_2m,relative_humidity_2m,precipitation', hourly: 'precipitation,precipitation_probability', past_hours: 24, forecast_hours: 24, timezone: 'GMT', temperature_unit: 'celsius', precipitation_unit: 'mm' }).forEach(([k, v]) => url.searchParams.set(k, v));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response;
    try { response = await this.fetchImpl(url, { signal: controller.signal }); }
    catch (e) { clearTimeout(timer); throw fail(e.name === 'AbortError' ? 'WEATHER_PROVIDER_TIMEOUT' : 'WEATHER_PROVIDER_UNAVAILABLE', e.name === 'AbortError' ? 'Open-Meteo request timed out.' : 'Open-Meteo could not be reached.'); }
    if (!response || !response.ok) { clearTimeout(timer); throw fail('WEATHER_PROVIDER_HTTP_ERROR', `Open-Meteo returned HTTP ${response && response.status ? response.status : 'error'}.`); }
    let data;
    try { data = await response.json(); } catch (e) { clearTimeout(timer); throw fail(e && e.name === 'AbortError' ? 'WEATHER_PROVIDER_TIMEOUT' : 'INVALID_WEATHER_RESPONSE', e && e.name === 'AbortError' ? 'Open-Meteo request timed out.' : 'Open-Meteo returned malformed JSON.'); }
    clearTimeout(timer);
    if (!data || !data.current || !data.hourly || !Array.isArray(data.hourly.time) || !Array.isArray(data.hourly.precipitation) || !Array.isArray(data.hourly.precipitation_probability)) throw fail('MISSING_WEATHER_VARIABLE', 'Open-Meteo response is missing required current or hourly weather variables.');
    const currentAt = date(data.current.time);
    const temperature = number(data.current.temperature_2m, 'temperature', -50, 60);
    const humidity = number(data.current.relative_humidity_2m, 'relative humidity', 0, 100);
    const rainfall = number(data.current.precipitation, 'current precipitation', 0);
    if (data.hourly.time.length !== data.hourly.precipitation.length || data.hourly.time.length !== data.hourly.precipitation_probability.length) throw fail('INVALID_WEATHER_RESPONSE', 'Open-Meteo hourly arrays have inconsistent lengths.');
    let recentRainfall = 0; let expectedRainfall = 0; let rainProbability = 0; let pastCount = 0; let futureCount = 0;
    const pastStart = currentAt.getTime() - 24 * 3600000; const futureEnd = currentAt.getTime() + 24 * 3600000;
    data.hourly.time.forEach((stamp, i) => {
      const at = date(stamp).getTime();
      const amount = number(data.hourly.precipitation[i], 'hourly precipitation', 0);
      const probability = number(data.hourly.precipitation_probability[i], 'precipitation probability', 0, 100);
      if (at >= pastStart && at <= currentAt.getTime()) { recentRainfall += amount; pastCount++; }
      if (at > currentAt.getTime() && at <= futureEnd) { expectedRainfall += amount; rainProbability = Math.max(rainProbability, probability); futureCount++; }
    });
    if (!pastCount || !futureCount) throw fail('MISSING_WEATHER_VARIABLE', 'Open-Meteo response lacks recent or next-24-hour hourly data.');
    return { temperature, humidity, rainfall, recentRainfall, rainProbability, expectedRainfall, recordedAt: currentAt, source: 'open-meteo', fetchedAt: new Date() };
  }
}
module.exports = new WeatherService();
module.exports.WeatherService = WeatherService;
