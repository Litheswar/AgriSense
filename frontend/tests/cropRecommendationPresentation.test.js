import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createRecommendationRequestTracker,
  cropRecommendationPageMode,
  formatModelProbability,
  labelMissingField,
  missingRecommendationFields,
  recommendationErrorMessage,
  visibleCropRecommendation
} from '../src/lib/cropRecommendationPresentation.js';

const farm = { _id: 'farm-a', name: 'North Field' };
const response = {
  success: true,
  farmId: 'farm-a',
  farmName: 'North Field',
  recommendation: {
    predicted_crop: 'rice',
    confidence: 0.8765,
    top_3: [
      { crop: 'rice', probability: 0.8765 },
      { crop: 'maize', probability: 0.082 },
      { crop: 'chickpea', probability: 0.0415 }
    ]
  }
};

test('page mode handles no farm without presenting a ready state', () => {
  assert.equal(cropRecommendationPageMode({ loading: true }), 'loading');
  assert.equal(cropRecommendationPageMode({ loading: false, error: 'API unavailable' }), 'farm-error');
  assert.equal(cropRecommendationPageMode({ loading: false, selectedFarm: null, selectedFarmId: '' }), 'no-farm');
  assert.equal(cropRecommendationPageMode({ loading: false, selectedFarm: farm, selectedFarmId: 'farm-a' }), 'ready');
});

test('successful response exposes the returned crop, confidence, and exactly the returned candidates', () => {
  const result = visibleCropRecommendation(response, 'farm-a');
  assert.equal(result.recommendation.predicted_crop, 'rice');
  assert.equal(formatModelProbability(result.recommendation.confidence), '87.7%');
  assert.deepEqual(result.recommendation.top_3.map((item) => item.crop), ['rice', 'maize', 'chickpea']);
  assert.equal(result.recommendation.top_3.length, 3);
});

test('probability formatting preserves non-finite values as unavailable', () => {
  assert.equal(formatModelProbability(undefined), 'Unavailable');
  assert.equal(formatModelProbability(Number.NaN), 'Unavailable');
});

test('missing-data errors preserve the backend field list and provide known labels', () => {
  const error = { payload: { error: { code: 'INSUFFICIENT_FARM_DATA', missingFields: ['N', 'ph', 'rainfall'] } } };
  assert.deepEqual(missingRecommendationFields(error), ['N', 'ph', 'rainfall']);
  assert.deepEqual(missingRecommendationFields({}), []);
  assert.equal(labelMissingField('N'), 'Soil nitrogen (N)');
  assert.equal(labelMissingField('rainfall'), 'Recorded rainfall');
  assert.equal(labelMissingField('future-field'), 'future-field');
});

test('API errors use useful 404 and 503 messages and retain safe backend messages', () => {
  assert.match(recommendationErrorMessage({ status: 404 }), /could not be found/i);
  assert.match(recommendationErrorMessage({ status: 503 }), /temporarily unavailable/i);
  assert.equal(recommendationErrorMessage({ status: 400, message: 'Farm data is insufficient.' }), 'Farm data is insufficient.');
});

test('request tracker blocks duplicate requests and invalidates a response after switching farms', () => {
  const tracker = createRecommendationRequestTracker('farm-a');
  const requestA = tracker.begin('farm-a');
  assert.ok(requestA);
  assert.equal(tracker.begin('farm-a'), null);
  assert.equal(tracker.isCurrent(requestA, 'farm-a'), true);

  tracker.setFarmId('farm-b');
  assert.equal(tracker.isCurrent(requestA, 'farm-a'), false);
  assert.equal(tracker.finish(requestA, 'farm-a'), false);
  const requestB = tracker.begin('farm-b');
  assert.ok(requestB);
  assert.equal(tracker.finish(requestB, 'farm-b'), true);
});

test('a previous farm result is hidden after selection changes', () => {
  assert.equal(visibleCropRecommendation(response, 'farm-a'), response);
  assert.equal(visibleCropRecommendation(response, 'farm-b'), null);
});
