import test from 'node:test';
import assert from 'node:assert/strict';
import { dashboardDate, dashboardModules, dashboardTimestamp, dashboardValue, dashboardWeatherProvenance } from '../src/lib/dashboardPresentation.js';

test('dashboard links every completed decision-support module exactly once', () => {
  assert.deepEqual(dashboardModules.map(({ label }) => label), [
    'Crop Recommendation', 'Irrigation', 'Fertilizer', 'Disease Detection',
    'Disease Risk', 'Crop Ranking', 'Market Intelligence', 'Farm Evaluation'
  ]);
  assert.equal(new Set(dashboardModules.map(({ path }) => path)).size, 8);
  assert.ok(dashboardModules.every(({ path }) => path.startsWith('/app/')));
});

test('Farm snapshot values preserve actual numbers including zero and do not invent missing data', () => {
  assert.equal(dashboardValue(0, '%'), '0%');
  assert.equal(dashboardValue(23.75), '23.75');
  assert.equal(dashboardValue(null), 'Not recorded');
  assert.equal(dashboardValue(Number.NaN), 'Not recorded');
});

test('weather source and timestamps show only returned Farm provenance', () => {
  assert.deepEqual(dashboardWeatherProvenance({ source: 'Open-Meteo', recordedAt: '2026-09-30T10:00:00.000Z', fetchedAt: '2026-09-30T10:01:00.000Z' }), {
    source: 'Open-Meteo',
    recordedAt: new Date('2026-09-30T10:00:00.000Z').toLocaleString(),
    fetchedAt: new Date('2026-09-30T10:01:00.000Z').toLocaleString()
  });
  assert.deepEqual(dashboardWeatherProvenance({}), { source: null, recordedAt: null, fetchedAt: null });
  assert.equal(dashboardWeatherProvenance({ source: ' ', recordedAt: 'not-a-date' }).recordedAt, null);
});

test('dashboard timestamps safely omit absent or invalid values', () => {
  assert.equal(dashboardTimestamp(null), null);
  assert.equal(dashboardTimestamp('invalid-date'), null);
  assert.equal(dashboardDate('invalid-date'), null);
  assert.ok(dashboardDate('2026-09-30T10:00:00.000Z'));
});
