import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDiseaseRiskRequestTracker,
  diseaseRiskAssessmentPresentation,
  diseaseRiskErrorMessage,
  diseaseRiskPageMode,
  labelDiseaseRiskField,
  missingDiseaseRiskFields,
  visibleDiseaseRiskResult
} from '../src/lib/diseaseRiskPresentation.js';

test('page mode covers loading, Farm error, no selected Farm, and ready state', () => {
  const farm = { _id: 'farm-a', name: 'North Field' };
  assert.equal(diseaseRiskPageMode({ loading: true }), 'loading');
  assert.equal(diseaseRiskPageMode({ loading: false, error: 'offline', selectedFarm: farm, selectedFarmId: 'farm-a' }), 'farm-error');
  assert.equal(diseaseRiskPageMode({ loading: false, selectedFarm: null, selectedFarmId: '' }), 'no-farm');
  assert.equal(diseaseRiskPageMode({ loading: false, selectedFarm: farm, selectedFarmId: 'farm-a' }), 'ready');
});

test('assessment visibility is scoped to its Farm and leaves returned engine data intact', () => {
  const response = { success: true, farmId: 'farm-a', recommendation: { risk_level: 'Medium', risk_score: 0.42, risk_score_note: 'Prototype composite index, not a calibrated disease probability.', signals: { humidity: 0.2 }, reasoning: ['Returned by engine'], disclaimer: 'Risk does not confirm disease.' } };
  assert.equal(visibleDiseaseRiskResult(response, 'farm-b'), null);
  assert.equal(visibleDiseaseRiskResult(response, 'farm-a'), response);
  assert.deepEqual(visibleDiseaseRiskResult(response, 'farm-a').recommendation, response.recommendation);
});

test('assessment presentation exposes only backend risk, conditions, signals, reasoning, and optional guidance', () => {
  const response = {
    farmId: 'farm-a',
    engineInput: { crop: 'Tomato', growth_stage: 'flowering', temperature: 24, humidity: 88, rainfall: 2, recent_rainfall: 12 },
    recommendation: {
      risk_level: 'High', risk_score: 0.75, risk_score_note: 'Prototype composite index; not a calibrated probability.',
      signals: { humidity: 0.3, temperature: 0.2 },
      reasoning: ['Humidity contributes an elevated signal.'],
      recommendation: 'Monitor conditions.',
      disclaimer: 'Risk does not confirm disease.'
    }
  };
  assert.deepEqual(diseaseRiskAssessmentPresentation(response), {
    riskLevel: 'High', riskScore: 0.75, riskScoreNote: 'Prototype composite index; not a calibrated probability.',
    crop: 'Tomato', growthStage: 'flowering',
    environmentalConditions: { temperature: 24, humidity: 88, rainfall: 2, recent_rainfall: 12 },
    signals: { humidity: 0.3, temperature: 0.2 }, reasoning: ['Humidity contributes an elevated signal.'],
    guidance: 'Monitor conditions.', disclaimer: 'Risk does not confirm disease.'
  });
});

test('assessment presentation does not invent missing risk scores, weather, signals, or recommendations', () => {
  const presentation = diseaseRiskAssessmentPresentation({
    engineInput: { temperature: null, humidity: 0 },
    recommendation: { risk_level: 'Low', reasoning: [] }
  });
  assert.equal(presentation.riskLevel, 'Low');
  assert.equal(presentation.riskScore, null);
  assert.deepEqual(presentation.environmentalConditions, { humidity: 0 });
  assert.deepEqual(presentation.signals, {});
  assert.equal(presentation.guidance, null);
  assert.equal(presentation.disclaimer, null);
});

test('missing backend fields receive labels and unrecognized fields remain visible', () => {
  const error = { payload: { error: { missingFields: ['crop', 'recent_rainfall', 'unknown'] } } };
  assert.deepEqual(missingDiseaseRiskFields(error), ['crop', 'recent_rainfall', 'unknown']);
  assert.equal(labelDiseaseRiskField('crop'), 'Crop name');
  assert.equal(labelDiseaseRiskField('recent_rainfall'), 'Recent rainfall');
  assert.equal(labelDiseaseRiskField('unknown'), 'unknown');
  assert.deepEqual(missingDiseaseRiskFields({}), []);
});

test('API errors explain Farm, authentication, availability, and generic failures', () => {
  assert.match(diseaseRiskErrorMessage({ status: 404 }), /Farm could not be found/);
  assert.match(diseaseRiskErrorMessage({ status: 401 }), /session may have expired/);
  assert.match(diseaseRiskErrorMessage({ status: 503 }), /temporarily unavailable/);
  assert.match(diseaseRiskErrorMessage({ code: 'TIMEOUT' }), /temporarily unavailable/);
  assert.equal(diseaseRiskErrorMessage({ message: 'Request failed' }), 'Request failed');
});

test('request tracker prevents duplicate requests and invalidates stale Farm responses', () => {
  const tracker = createDiseaseRiskRequestTracker('farm-a');
  const first = tracker.begin('farm-a');
  assert.equal(typeof first, 'number');
  assert.equal(tracker.begin('farm-a'), null);
  tracker.setFarmId('farm-b');
  assert.equal(tracker.isCurrent(first, 'farm-a'), false);
  assert.equal(tracker.finish(first, 'farm-a'), false);
  const second = tracker.begin('farm-b');
  assert.equal(tracker.isCurrent(second, 'farm-b'), true);
  assert.equal(tracker.finish(second, 'farm-b'), true);
});
