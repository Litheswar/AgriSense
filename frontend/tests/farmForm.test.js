import test from 'node:test';
import assert from 'node:assert/strict';
import { farmToFormValues, farmValuesToPayload, validateFarmValues } from '../src/lib/farmForm.js';

const valid = { name: 'North Field', state: 'Tamil Nadu', district: 'Salem', village: '', latitude: '', longitude: '', crop: 'Rice', nitrogen: '', phosphorus: '', potassium: '', ph: '7', soilMoisture: '35' };

test('validates required farm name and location', () => {
  assert.deepEqual(validateFarmValues(valid), {});
  assert.equal(validateFarmValues({ ...valid, name: ' ' }).name, 'Enter a farm name.');
  assert.equal(validateFarmValues({ ...valid, state: '' }).state, 'Enter a state.');
});

test('validates schema numeric limits', () => {
  assert.ok(validateFarmValues({ ...valid, latitude: '91' }).latitude);
  assert.ok(validateFarmValues({ ...valid, longitude: '-181' }).longitude);
  assert.ok(validateFarmValues({ ...valid, nitrogen: '-1' }).nitrogen);
  assert.ok(validateFarmValues({ ...valid, ph: '14.1' }).ph);
  assert.ok(validateFarmValues({ ...valid, soilMoisture: '101' }).soilMoisture);
});

test('serializes farmer-editable values without ownership or server metadata', () => {
  const payload = farmValuesToPayload(valid);
  assert.equal(payload.name, 'North Field');
  assert.equal(payload.soil.ph, 7);
  assert.equal(payload.fieldConditions.soilMoisture, 35);
  assert.equal(payload.location.latitude, null);
  assert.equal('ownerId' in payload, false);
  assert.equal('_id' in payload, false);
  assert.equal('updatedAt' in payload, false);
});

test('maps a server farm into editable values', () => {
  const values = farmToFormValues({ name: 'North Field', location: { state: 'TN', district: 'Salem', latitude: 11 }, soil: { ph: 6.5 }, crop: { name: 'Rice' } });
  assert.equal(values.name, 'North Field');
  assert.equal(values.latitude, 11);
  assert.equal(values.ph, 6.5);
  assert.equal(values.longitude, '');
});
