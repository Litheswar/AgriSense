import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createFertilizerRequestTracker,
  fertilizerErrorMessage,
  fertilizerPageMode,
  labelFertilizerField,
  missingFertilizerFields,
  visibleFertilizerResult
} from '../src/lib/fertilizerPresentation.js';

test('page mode covers loading, Farm load error, no selected Farm, and ready state', () => {
  const farm = { _id: 'farm-a', name: 'North Field' };
  assert.equal(fertilizerPageMode({ loading: true, selectedFarm: null, selectedFarmId: '' }), 'loading');
  assert.equal(fertilizerPageMode({ loading: false, error: 'offline', selectedFarm: farm, selectedFarmId: 'farm-a' }), 'farm-error');
  assert.equal(fertilizerPageMode({ loading: false, selectedFarm: null, selectedFarmId: '' }), 'no-farm');
  assert.equal(fertilizerPageMode({ loading: false, selectedFarm: farm, selectedFarmId: 'farm-a' }), 'ready');
});

test('recommendation visibility is scoped to its Farm and preserves backend values', () => {
  const response = {
    success: true,
    farmId: 'farm-a',
    farmName: 'North Field',
    recommendation: {
      crop: 'Tomato',
      growth_stage: 'flowering',
      nutrient_status: { N: 'low', P: 'adequate', K: 'high' },
      ph_status: 'suitable',
      priority_nutrients: ['N'],
      recommendation: 'Consider supplementing the following priority nutrients: N.',
      caution: null,
      reasoning: ['N is classified as low according to configured prototype thresholds.']
    }
  };
  assert.equal(visibleFertilizerResult(response, 'farm-b'), null);
  assert.equal(visibleFertilizerResult(response, 'farm-a'), response);
  assert.deepEqual(visibleFertilizerResult(response, 'farm-a').recommendation, response.recommendation);
});

test('missing backend keys have farmer-facing labels and unknown keys stay visible', () => {
  const error = { payload: { error: { missingFields: ['N', 'ph', 'crop', 'disease_status', 'extra_key'] } } };
  assert.deepEqual(missingFertilizerFields(error), ['N', 'ph', 'crop', 'disease_status', 'extra_key']);
  assert.equal(labelFertilizerField('N'), 'Soil nitrogen (N)');
  assert.equal(labelFertilizerField('disease_status'), 'Disease status');
  assert.equal(labelFertilizerField('extra_key'), 'extra_key');
  assert.deepEqual(missingFertilizerFields({}), []);
});

test('API failures receive useful auth, Farm, availability, and generic messages', () => {
  assert.equal(fertilizerErrorMessage({ status: 404 }), 'This farm could not be found or is no longer available to your account.');
  assert.match(fertilizerErrorMessage({ status: 401 }), /session may have expired/);
  assert.match(fertilizerErrorMessage({ status: 503 }), /temporarily unavailable/);
  assert.match(fertilizerErrorMessage({ code: 'TIMEOUT' }), /temporarily unavailable/);
  assert.equal(fertilizerErrorMessage({ message: 'Request failed' }), 'Request failed');
});

test('request tracker rejects duplicates and invalidates a pending Farm response on switch', () => {
  const tracker = createFertilizerRequestTracker('farm-a');
  const firstRequest = tracker.begin('farm-a');
  assert.equal(typeof firstRequest, 'number');
  assert.equal(tracker.begin('farm-a'), null);
  assert.equal(tracker.isCurrent(firstRequest, 'farm-a'), true);

  tracker.setFarmId('farm-b');
  assert.equal(tracker.isCurrent(firstRequest, 'farm-a'), false);
  assert.equal(tracker.finish(firstRequest, 'farm-a'), false);
  const secondRequest = tracker.begin('farm-b');
  assert.equal(tracker.isCurrent(secondRequest, 'farm-b'), true);
  assert.equal(tracker.finish(secondRequest, 'farm-b'), true);
});
