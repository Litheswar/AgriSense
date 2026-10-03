import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createIrrigationRequestTracker,
  irrigationErrorMessage,
  irrigationPageMode,
  labelIrrigationField,
  missingIrrigationFields,
  visibleIrrigationResult
} from '../src/lib/irrigationPresentation.js';

test('page mode handles farm loading, errors, and empty selection', () => {
  const farm = { _id: 'farm-1', name: 'North Field' };
  assert.equal(irrigationPageMode({ loading: true, selectedFarm: null, selectedFarmId: null }), 'loading');
  assert.equal(irrigationPageMode({ loading: false, error: 'offline', selectedFarm: farm, selectedFarmId: 'farm-1' }), 'farm-error');
  assert.equal(irrigationPageMode({ loading: false, selectedFarm: null, selectedFarmId: null }), 'no-farm');
  assert.equal(irrigationPageMode({ loading: false, selectedFarm: farm, selectedFarmId: 'farm-1' }), 'ready');
});

test('only shows a recommendation for the currently selected Farm', () => {
  const response = { farmId: 'farm-1', farmName: 'North Field', recommendation: { irrigation_required: true, urgency: 'high' } };
  assert.equal(visibleIrrigationResult(response, 'farm-2'), null);
  assert.deepEqual(visibleIrrigationResult(response, 'farm-1'), response);
});

test('maps backend missing fields and safely summarizes common failures', () => {
  const error = { payload: { error: { missingFields: ['soil_moisture', 'rain_probability', 'unexpected_key'] } } };
  assert.deepEqual(missingIrrigationFields(error), ['soil_moisture', 'rain_probability', 'unexpected_key']);
  assert.equal(labelIrrigationField('soil_moisture'), 'Soil moisture');
  assert.equal(labelIrrigationField('unexpected_key'), 'unexpected_key');
  assert.equal(irrigationErrorMessage({ status: 404 }), 'This farm could not be found or is no longer available to your account.');
  assert.match(irrigationErrorMessage({ status: 503 }), /temporarily unavailable/);
  assert.equal(irrigationErrorMessage({ message: 'Request failed' }), 'Request failed');
  assert.deepEqual(missingIrrigationFields({}), []);
});

test('request tracker blocks duplicates and ignores responses after Farm changes', () => {
  const tracker = createIrrigationRequestTracker('farm-1');
  const requestId = tracker.begin('farm-1');
  assert.equal(typeof requestId, 'number');
  assert.equal(tracker.begin('farm-1'), null);
  assert.equal(tracker.isCurrent(requestId, 'farm-1'), true);
  tracker.setFarmId('farm-2');
  assert.equal(tracker.isCurrent(requestId, 'farm-1'), false);
  assert.equal(tracker.finish(requestId, 'farm-1'), false);
  const nextRequestId = tracker.begin('farm-2');
  assert.equal(tracker.isCurrent(nextRequestId, 'farm-2'), true);
});
