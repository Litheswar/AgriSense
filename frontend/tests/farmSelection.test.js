import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcileSelectedFarmId } from '../src/lib/farmSelection.js';

const farms = [{ _id: 'farm-a' }, { _id: 'farm-b' }];

test('preserves a stored selection while the Farm list is still loading', () => {
  assert.equal(reconcileSelectedFarmId({ farms: [], selectedFarmId: 'farm-b', loading: true, error: '' }), 'farm-b');
});

test('preserves the selected ID during Farm list failures for a later retry', () => {
  assert.equal(reconcileSelectedFarmId({ farms: [], selectedFarmId: 'farm-b', loading: false, error: 'offline' }), 'farm-b');
});

test('retains a stored selection when it belongs to the successfully loaded Farm list', () => {
  assert.equal(reconcileSelectedFarmId({ farms, selectedFarmId: 'farm-b', loading: false, error: '' }), 'farm-b');
});

test('chooses the first available Farm when the stored selection is not in the current list', () => {
  assert.equal(reconcileSelectedFarmId({ farms, selectedFarmId: 'deleted-farm', loading: false, error: '' }), 'farm-a');
});

test('clears a selection only after a successful empty Farm list', () => {
  assert.equal(reconcileSelectedFarmId({ farms: [], selectedFarmId: 'farm-b', loading: false, error: '' }), '');
});

test('does not fabricate a selection when no Farm is available', () => {
  assert.equal(reconcileSelectedFarmId({ farms: null, selectedFarmId: '', loading: false, error: '' }), '');
});
