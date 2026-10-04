import test from 'node:test';
import assert from 'node:assert/strict';
import { createMarketRequestTracker, marketErrorMessage, marketErrorTitle, marketPageMode, marketPriceRange, marketRecommendation, marketSource, visibleMarketResult } from '../src/lib/marketPresentation.js';

test('page mode handles Farm loading, error, missing selection, and ready state', () => {
  const farm = { _id: 'farm-a', name: 'North Field' };
  assert.equal(marketPageMode({ loading: true }), 'loading');
  assert.equal(marketPageMode({ error: 'offline', selectedFarm: farm, selectedFarmId: 'farm-a' }), 'farm-error');
  assert.equal(marketPageMode({ selectedFarm: null, selectedFarmId: '' }), 'no-farm');
  assert.equal(marketPageMode({ selectedFarm: farm, selectedFarmId: 'farm-a' }), 'ready');
});

test('market results are shown only for the currently selected Farm', () => {
  const result = { farmId: 'farm-a', recommendation: { crop: 'Tomato' } };
  assert.equal(visibleMarketResult(result, 'farm-a'), result);
  assert.equal(visibleMarketResult(result, 'farm-b'), null);
  assert.equal(marketRecommendation(result), result.recommendation);
  assert.equal(marketRecommendation(null), null);
});

test('provider provenance distinguishes local fallback, live Government source, and unknown labels', () => {
  assert.deepEqual(marketSource('local-fallback'), { kind: 'local', label: 'Local fallback data' });
  assert.deepEqual(marketSource('data.gov.in (live)'), { kind: 'live', label: 'Live data.gov.in' });
  assert.deepEqual(marketSource(null), { kind: 'unknown', label: 'Source not returned' });
  assert.deepEqual(marketSource('Regional feed'), { kind: 'other', label: 'Source: Regional feed' });
});

test('price range requires all actual finite backend price values', () => {
  const range = { min_price: 100, modal_price: 120, max_price: 150, unit: 'INR/Quintal' };
  assert.equal(marketPriceRange({ price_range: range }), range);
  assert.equal(marketPriceRange({ price_range: { ...range, max_price: null } }), null);
  assert.equal(marketPriceRange({ price_range: null }), null);
});

test('unavailable Farm crop and provider errors receive specific guidance', () => {
  assert.equal(marketErrorTitle({ code: 'INSUFFICIENT_FARM_DATA' }), 'Crop information is required');
  assert.match(marketErrorMessage({ code: 'INSUFFICIENT_FARM_DATA' }), /Add a crop name/);
  assert.equal(marketErrorTitle({ status: 503 }), 'Market service unavailable');
  assert.equal(marketErrorTitle({ status: 404 }), 'Farm unavailable');
  assert.equal(marketErrorMessage({ message: 'API offline' }), 'API offline');
});

test('request tracker suppresses duplicate requests and invalidates results after Farm switch', () => {
  const tracker = createMarketRequestTracker('farm-a');
  const first = tracker.begin('farm-a');
  assert.equal(tracker.begin('farm-a'), null);
  tracker.setFarmId('farm-b');
  assert.equal(tracker.isCurrent(first, 'farm-a'), false);
  assert.equal(tracker.finish(first, 'farm-a'), false);
  const second = tracker.begin('farm-b');
  assert.equal(tracker.isCurrent(second, 'farm-b'), true);
  assert.equal(tracker.finish(second, 'farm-b'), true);
});
