const assert = require('assert');
const { WeatherService } = require('../services/weatherService');

function providerResponse() {
  const now = new Date('2026-09-25T12:00:00Z');
  const times = []; const precipitation = []; const probabilities = [];
  for (let i = -24; i <= 24; i++) { times.push(new Date(now.getTime() + i * 3600000).toISOString().slice(0, 16)); precipitation.push(i < 0 ? 1 : (i > 0 ? 2 : 0.5)); probabilities.push(i > 0 ? 20 + (i % 5) : 0); }
  return { current: { time: '2026-09-25T12:00', temperature_2m: 27.5, relative_humidity_2m: 72, precipitation: 0.5 }, hourly: { time: times, precipitation, precipitation_probability: probabilities } };
}
async function run() {
  let count = 0; const svc = new WeatherService({ fetchImpl: async (url) => { count++; assert.equal(url.hostname, 'api.open-meteo.com'); assert.equal(url.searchParams.get('latitude'), '12.9'); assert.equal(url.searchParams.get('forecast_hours'), '24'); return { ok: true, json: async () => providerResponse() }; } });
  const result = await svc.getWeather(12.9, 77.5);
  assert.equal(count, 1); assert.equal(result.temperature, 27.5); assert.equal(result.humidity, 72); assert.equal(result.rainfall, .5); assert.equal(result.recentRainfall, 24.5); assert.equal(result.expectedRainfall, 48); assert.equal(result.rainProbability, 24); assert.equal(result.source, 'open-meteo');
  for (const [lat, lon, code] of [[null, 0, 'INSUFFICIENT_LOCATION_DATA'], [91, 0, 'INVALID_LATITUDE'], [0, 181, 'INVALID_LONGITUDE']]) await assert.rejects(() => svc.getWeather(lat, lon), e => e.code === code);
  const errorSvc = new WeatherService({ fetchImpl: async () => ({ ok: false, status: 503 }) }); await assert.rejects(() => errorSvc.getWeather(0, 0), e => e.code === 'WEATHER_PROVIDER_HTTP_ERROR');
  const malformed = new WeatherService({ fetchImpl: async () => ({ ok: true, json: async () => { throw Error('bad json'); } }) }); await assert.rejects(() => malformed.getWeather(0, 0), e => e.code === 'INVALID_WEATHER_RESPONSE');
  const missing = new WeatherService({ fetchImpl: async () => ({ ok: true, json: async () => ({}) }) }); await assert.rejects(() => missing.getWeather(0, 0), e => e.code === 'MISSING_WEATHER_VARIABLE');
  const network = new WeatherService({ fetchImpl: async () => { throw Error('offline'); } }); await assert.rejects(() => network.getWeather(0, 0), e => e.code === 'WEATHER_PROVIDER_UNAVAILABLE');
  const timeout = new WeatherService({ timeoutMs: 5, fetchImpl: (_url, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(Object.assign(new Error(), { name: 'AbortError' }))) ) }); await assert.rejects(() => timeout.getWeather(0, 0), e => e.code === 'WEATHER_PROVIDER_TIMEOUT');
  console.log('weather service: 10 checks passed');
}
run().catch(e => { console.error(e); process.exitCode = 1; });
