import test from 'node:test';
import assert from 'node:assert/strict';
import { coordinateFieldsToDecimal, decimalToDms, validateDmsCoordinate } from '../src/lib/coordinates.js';
import { farmValuesToPayload, validateFarmValues } from '../src/lib/farmForm.js';

const dms = (degrees, minutes, seconds, direction) => ({ degrees: String(degrees), minutes: String(minutes), seconds: String(seconds), direction });

test('converts DMS to decimal accurately and applies all hemispheres', () => {
  assert.equal(validateDmsCoordinate(dms(13, 4, 30, 'N'), 'latitude').value, 13.075);
  assert.equal(validateDmsCoordinate(dms(13, 4, 30, 'S'), 'latitude').value, -13.075);
  assert.equal(validateDmsCoordinate(dms(80, 16, 12, 'E'), 'longitude').value, 80.27);
  assert.equal(validateDmsCoordinate(dms(80, 16, 12, 'W'), 'longitude').value, -80.27);
});

test('round-trips decimal coordinates into DMS parts', () => {
  assert.deepEqual(decimalToDms(13.075, 'latitude'), { degrees: '13', minutes: '4', seconds: '30', direction: 'N' });
  assert.deepEqual(decimalToDms(-80.27, 'longitude'), { degrees: '80', minutes: '16', seconds: '12', direction: 'W' });
});

test('accepts decimal degree coordinates including valid boundaries', () => {
  const values = { name: 'Farm', state: 'TN', district: 'Salem', village: '', crop: '', latitude: '90', longitude: '-180', nitrogen: '', phosphorus: '', potassium: '', ph: '', soilMoisture: '' };
  assert.deepEqual(validateFarmValues(values), {});
  const payload = farmValuesToPayload(values);
  assert.equal(payload.location.latitude, 90);
  assert.equal(payload.location.longitude, -180);
});

test('converts DMS form values to canonical decimal payload coordinates', () => {
  const payload = farmValuesToPayload({
    name: 'Farm', state: 'TN', district: 'Salem', village: '', crop: '', nitrogen: '', phosphorus: '', potassium: '', ph: '', soilMoisture: '', coordinateFormat: 'dms',
    latDegrees: '13', latMinutes: '4', latSeconds: '30', latDirection: 'N',
    lonDegrees: '80', lonMinutes: '16', lonSeconds: '12', lonDirection: 'E'
  });
  assert.equal(payload.location.latitude, 13.075);
  assert.equal(payload.location.longitude, 80.27);
});

test('accepts exact DMS latitude and longitude boundaries only at zero minutes and seconds', () => {
  assert.equal(validateDmsCoordinate(dms(90, 0, 0, 'N'), 'latitude').value, 90);
  assert.equal(validateDmsCoordinate(dms(180, 0, 0, 'W'), 'longitude').value, -180);
  assert.match(validateDmsCoordinate(dms(90, 0, 0.1, 'N'), 'latitude').error, /0 minutes and 0 seconds/);
  assert.match(validateDmsCoordinate(dms(180, 1, 0, 'E'), 'longitude').error, /0 minutes and 0 seconds/);
});

test('rejects invalid degrees, minutes, seconds, directions, and incomplete DMS tuples', () => {
  assert.match(validateDmsCoordinate(dms(91, 0, 0, 'N'), 'latitude').error, /degrees/);
  assert.match(validateDmsCoordinate(dms(13, 70, 0, 'N'), 'latitude').error, /minutes/);
  assert.match(validateDmsCoordinate(dms(13, 0, 65, 'N'), 'latitude').error, /seconds/);
  assert.match(validateDmsCoordinate(dms(13, 0, 60, 'N'), 'latitude').error, /seconds/);
  assert.match(validateDmsCoordinate(dms(13, 0, 0, 'E'), 'latitude').error, /direction/);
  assert.match(validateDmsCoordinate({ ...dms(13, 0, 0, 'N'), seconds: '' }, 'latitude').error, /requires degrees/);
  assert.equal(coordinateFieldsToDecimal({ latDegrees: '', latMinutes: '', latSeconds: '', latDirection: 'N' }, 'lat', 'latitude').value, null);
});

test('rejects partial decimal coordinate pairs while allowing both blank', () => {
  const base = { name: 'Farm', state: 'TN', district: 'Salem', latitude: '', longitude: '' };
  assert.deepEqual(validateFarmValues(base), {});
  assert.match(validateFarmValues({ ...base, latitude: '12' }).latitude, /both latitude and longitude/);
  assert.match(validateFarmValues({ ...base, longitude: '181', latitude: '12' }).longitude, /between -180 and 180/);
});
