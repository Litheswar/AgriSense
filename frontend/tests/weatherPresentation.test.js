import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canRefreshWeather,
  createWeatherRequestTracker,
  hasWeatherCoordinates,
  visibleWeatherResult,
  weatherErrorMessage,
  weatherFreshness,
  weatherMetrics,
  weatherPageMode,
  weatherSourceLabel,
  weatherTimestamp
} from '../src/lib/weatherPresentation.js';

const farm = { _id: 'farm-a', name: 'North Field' };

test('page mode covers Farm loading, Farm loading errors, missing selection, and ready state', () => {
  assert.equal(weatherPageMode({ loading: true }), 'loading');
  assert.equal(weatherPageMode({ error: 'offline', selectedFarm: farm, selectedFarmId: 'farm-a' }), 'farm-error');
  assert.equal(weatherPageMode({ selectedFarm: null, selectedFarmId: '' }), 'no-farm');
  assert.equal(weatherPageMode({ selectedFarm: farm, selectedFarmId: 'farm-a' }), 'ready');
});

test('successful stored response is Farm scoped and exposes backend weather only', () => {
  const response = { success: true, farmId: 'farm-a', weather: { temperature: 23.6, humidity: 71, rainfall: 0, recentRainfall: 2.4, expectedRainfall: 5.1, rainProbability: 60, source: 'open-meteo' }, freshness: { status: 'RECENT', ageMinutes: 12, thresholdHours: 3 } };
  assert.equal(visibleWeatherResult(response, 'farm-a'), response);
  assert.equal(visibleWeatherResult(response, 'farm-b'), null);
  assert.deepEqual(weatherMetrics(response.weather).map(({ key, value }) => [key, value]), [
    ['temperature', 23.6], ['humidity', 71], ['rainfall', 0], ['recentRainfall', 2.4], ['expectedRainfall', 5.1], ['rainProbability', 60]
  ]);
});

test('temperature is displayed in Celsius without rounding the backend value', () => {
  assert.deepEqual(weatherMetrics({ temperature: 23.67 })[0], { key: 'temperature', label: 'Temperature', value: 23.67, unit: '°C' });
});

test('humidity is displayed with the percent unit', () => {
  assert.deepEqual(weatherMetrics({ humidity: 71 })[0], { key: 'humidity', label: 'Humidity', value: 71, unit: '%' });
});

test('current precipitation is displayed in millimeters', () => {
  assert.deepEqual(weatherMetrics({ rainfall: 0.5 })[0], { key: 'rainfall', label: 'Current precipitation', value: 0.5, unit: 'mm' });
});

test('recent rainfall is labeled as the past 24 hours and displayed in millimeters', () => {
  assert.deepEqual(weatherMetrics({ recentRainfall: 2.4 })[0], { key: 'recentRainfall', label: 'Rainfall in the past 24 hours', value: 2.4, unit: 'mm' });
});

test('expected rainfall is labeled as the next 24-hour provider summary', () => {
  assert.deepEqual(weatherMetrics({ expectedRainfall: 5.1 })[0], { key: 'expectedRainfall', label: 'Expected rainfall in the next 24 hours', value: 5.1, unit: 'mm' });
});

test('rain probability is identified as maximum hourly probability for the next 24 hours', () => {
  assert.deepEqual(weatherMetrics({ rainProbability: 60 })[0], { key: 'rainProbability', label: 'Maximum hourly rain probability in the next 24 hours', value: 60, unit: '%' });
});

test('missing and null weather values are omitted, while a real zero is preserved', () => {
  assert.deepEqual(weatherMetrics({ temperature: null, humidity: 0, rainfall: undefined, recentRainfall: '' }), [
    { key: 'humidity', label: 'Humidity', value: 0, unit: '%' }
  ]);
  assert.deepEqual(weatherMetrics(null), []);
});

test('RECENT freshness uses the backend status and returned age', () => {
  assert.deepEqual(weatherFreshness({ status: 'RECENT', ageMinutes: 12, thresholdHours: 3 }), { status: 'RECENT', ageMinutes: 12, thresholdHours: 3, description: 'Updated 12 minutes ago.' });
  assert.match(weatherFreshness({ status: 'RECENT', ageMinutes: 90, thresholdHours: 3 }).description, /1 hour 30 minutes/);
});

test('STALE freshness uses backend threshold and preserves stale weather', () => {
  assert.deepEqual(weatherFreshness({ status: 'STALE', ageMinutes: 181, thresholdHours: 3 }), { status: 'STALE', ageMinutes: 181, thresholdHours: 3, description: 'Older than the configured freshness window of 3 hours.' });
});

test('UNKNOWN freshness does not calculate a competing client-side freshness rule', () => {
  assert.equal(weatherFreshness({ status: 'UNKNOWN', ageMinutes: null, thresholdHours: 3 }).description, 'Freshness could not be established from the backend response.');
  assert.equal(weatherFreshness({ status: 'made-up', ageMinutes: 0 }).status, 'UNKNOWN');
});

test('source provenance distinguishes Open-Meteo provider data from absent provenance', () => {
  assert.equal(weatherSourceLabel('open-meteo'), 'Open-Meteo provider data');
  assert.equal(weatherSourceLabel('farm-station'), 'farm-station');
  assert.equal(weatherSourceLabel(null), null);
});

test('recorded and fetched timestamps remain distinct and invalid timestamps are omitted', () => {
  assert.match(weatherTimestamp('2026-10-04T10:00:00.000Z'), /2026/);
  assert.equal(weatherTimestamp('not-a-date'), null);
  assert.equal(weatherTimestamp(null), null);
});

test('coordinate validation follows the backend supported latitude and longitude ranges', () => {
  assert.equal(hasWeatherCoordinates({ latitude: 12.9, longitude: 77.5 }), true);
  assert.equal(hasWeatherCoordinates({ latitude: -90, longitude: 180 }), true);
  assert.equal(hasWeatherCoordinates({ latitude: null, longitude: 77.5 }), false);
  assert.equal(hasWeatherCoordinates({ latitude: 91, longitude: 77.5 }), false);
  assert.equal(hasWeatherCoordinates({ latitude: 12.9, longitude: '77.5' }), false);
});

test('refresh is unavailable when coordinates are missing/invalid or a request is in progress', () => {
  assert.equal(canRefreshWeather({ latitude: 12.9, longitude: 77.5 }), true);
  assert.equal(canRefreshWeather({ latitude: null, longitude: 77.5 }), false);
  assert.equal(canRefreshWeather({ latitude: 12.9, longitude: 77.5 }, true), false);
});

test('401 authentication errors preserve backend details', () => {
  assert.equal(weatherErrorMessage({ status: 401, code: 'UNAUTHENTICATED', message: 'Authentication is required.' }), 'Authentication is required.');
});

test('404 Farm errors preserve backend details', () => {
  assert.equal(weatherErrorMessage({ status: 404, code: 'FARM_NOT_FOUND', message: 'Farm not found.' }), 'Farm not found.');
});

test('missing and invalid coordinate errors explain how to fix Farm location', () => {
  assert.match(weatherErrorMessage({ code: 'INSUFFICIENT_LOCATION_DATA' }), /latitude and longitude/);
  assert.match(weatherErrorMessage({ code: 'INVALID_LATITUDE' }), /must be between -90 and 90/);
});

test('provider failures and timeouts are described as provider failures', () => {
  for (const code of ['WEATHER_PROVIDER_UNAVAILABLE', 'WEATHER_PROVIDER_TIMEOUT']) {
    assert.match(weatherErrorMessage({ code }), /weather provider could not be reached/);
  }
  assert.match(weatherErrorMessage({ code: 'WEATHER_PROVIDER_HTTP_ERROR' }), /provider returned an unsuccessful response/);
  assert.match(weatherErrorMessage({ status: 503, code: 'WEATHER_PROVIDER_UNAVAILABLE' }), /weather provider could not be reached/);
});

test('malformed and incomplete provider responses retain their specific backend codes', () => {
  assert.match(weatherErrorMessage({ code: 'INVALID_WEATHER_RESPONSE' }), /incomplete or invalid/);
  assert.match(weatherErrorMessage({ code: 'MISSING_WEATHER_VARIABLE' }), /incomplete or invalid/);
});

test('generic errors preserve API client messages', () => {
  assert.equal(weatherErrorMessage({ message: 'Could not connect to AgriSense.' }), 'Could not connect to AgriSense.');
  assert.equal(weatherErrorMessage({}), 'Farm weather could not be loaded. Please try again.');
});

test('refresh request exposes its loading kind and prevents duplicate refreshes', () => {
  const tracker = createWeatherRequestTracker('farm-a');
  const refreshId = tracker.begin('farm-a', 'refresh');
  assert.equal(typeof refreshId, 'number');
  assert.equal(tracker.activeKind(), 'refresh');
  assert.equal(tracker.begin('farm-a', 'refresh'), null);
  assert.equal(tracker.begin('farm-a', 'read'), null);
  assert.equal(tracker.finish(refreshId, 'farm-a'), true);
  assert.equal(tracker.activeKind(), null);
});

test('selected Farm switch invalidates pending requests and hides the previous weather', () => {
  const tracker = createWeatherRequestTracker('farm-a');
  const firstId = tracker.begin('farm-a', 'refresh');
  tracker.setFarmId('farm-b');
  assert.equal(tracker.isCurrent(firstId, 'farm-a'), false);
  assert.equal(tracker.finish(firstId, 'farm-a'), false);
  assert.equal(visibleWeatherResult({ farmId: 'farm-a', weather: { temperature: 99 } }, 'farm-b'), null);
  const secondId = tracker.begin('farm-b', 'read');
  assert.equal(tracker.isCurrent(secondId, 'farm-b'), true);
});

test('refresh failures keep prior weather eligible to display and preserve the error', () => {
  const stored = { farmId: 'farm-a', weather: { temperature: 20 }, freshness: { status: 'STALE', ageMinutes: 200, thresholdHours: 3 } };
  const error = { code: 'WEATHER_PROVIDER_TIMEOUT' };
  assert.equal(visibleWeatherResult(stored, 'farm-a'), stored);
  assert.match(weatherErrorMessage(error), /provider could not be reached/);
});
