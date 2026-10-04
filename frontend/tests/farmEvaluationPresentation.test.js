import test from 'node:test';
import assert from 'node:assert/strict';
import {
  componentError, componentRecommendation, componentStatus, componentWarnings,
  confidenceLabel, createFarmEvaluationRequestTracker, cropCandidates,
  evaluationComponents, evaluationErrorMessage, evaluationErrorTitle,
  evaluationMissingFields, farmEvaluationPageMode, evaluationStatus,
  formatEvaluationValue, marketProvenance, rankedCropCandidates,
  visibleFarmEvaluation
} from '../src/lib/farmEvaluationPresentation.js';

const recommendations = {
  cropRecommendation: { status: 'SUCCESS', data: { recommendation: { predicted_crop: 'Tomato', confidence: 0.9, top_3: [{ crop: 'Tomato', probability: 0.9 }] } } },
  irrigation: { status: 'SUCCESS', data: { recommendation: { irrigation_required: true, urgency: 'High', reason: 'Returned reason', factors: { soil: 'dry' } } } },
  fertilizer: { status: 'SUCCESS', data: { recommendation: { nutrient_status: { N: 'low' }, ph_status: 'adequate', priority_nutrients: ['N'], recommendation: 'Returned recommendation', reasoning: ['Returned reasoning'], caution: 'Returned caution' } } },
  diseaseRisk: { status: 'SUCCESS', data: { recommendation: { risk_level: 'Medium', risk_score: 0.5, signals: { humidity: 0.2 }, reasoning: ['Returned risk reason'], risk_score_note: 'Prototype index', disclaimer: 'Environmental conditions do not confirm disease.' } } },
  market: { status: 'SUCCESS', data: { recommendation: { status: 'SUCCESS', data_available: true, crop: 'Tomato', market: 'Kolar', current_price: 2300, latest_date: '2026-09-10', price_range: { min_price: 2100, modal_price: 2300, max_price: 2500, unit: 'INR/Quintal' }, trend: 'Increasing', price_change_percent: 8, history_points: 3, raw_source: 'local-fallback', disclaimer: 'Prototype market score.' } } },
  cropRanking: { status: 'SUCCESS', data: { recommendation: { ranked_crops: [{ rank: 1, crop: 'Tomato', combined_score: 0.8, market_source: 'local-fallback' }] } } }
};
const evaluation = { success: true, status: 'SUCCESS', farmId: 'farm-a', farmName: 'North Field', farmContext: { crop: { name: 'Tomato' }, lastUpdated: '2026-09-10T00:00:00.000Z' }, recommendations };

test('Farm selection modes cover loading, load error, no Farms, no selection, and ready', () => {
  const farm = { _id: 'farm-a' };
  assert.equal(farmEvaluationPageMode({ loading: true }), 'loading');
  assert.equal(farmEvaluationPageMode({ error: 'offline', selectedFarm: farm, selectedFarmId: 'farm-a' }), 'farm-error');
  assert.equal(farmEvaluationPageMode({ selectedFarm: null, selectedFarmId: '' }), 'no-farm');
  assert.equal(farmEvaluationPageMode({ selectedFarm: farm, selectedFarmId: '' }), 'no-farm');
  assert.equal(farmEvaluationPageMode({ selectedFarm: farm, selectedFarmId: 'farm-a' }), 'ready');
});

test('successful evaluation response is displayed only for its selected Farm', () => {
  assert.equal(visibleFarmEvaluation(evaluation, 'farm-a'), evaluation);
  assert.equal(visibleFarmEvaluation(evaluation, 'farm-b'), null);
  assert.equal(visibleFarmEvaluation(null, 'farm-a'), null);
});

test('backend overall evaluation status is labeled without synthesizing a score', () => {
  assert.deepEqual(evaluationStatus('SUCCESS'), { kind: 'success', label: 'Complete' });
  assert.deepEqual(evaluationStatus('PARTIAL'), { kind: 'partial', label: 'Partial evaluation' });
  assert.deepEqual(evaluationStatus(undefined), { kind: 'unknown', label: 'Status not returned' });
  assert.equal(Object.hasOwn(evaluation, 'overallScore'), false);
});

test('all returned backend component summaries are exposed in stable order', () => {
  assert.deepEqual(evaluationComponents(evaluation).map(({ key }) => key), ['cropRecommendation', 'irrigation', 'fertilizer', 'diseaseRisk', 'market', 'cropRanking']);
  assert.deepEqual(evaluationComponents({ recommendations: { irrigation: recommendations.irrigation, futureComponent: {} } }).map(({ key }) => key), ['irrigation']);
  assert.deepEqual(evaluationComponents({ recommendations: null }), []);
});

test('crop recommendation preserves the returned prediction, confidence, and candidates', () => {
  const recommendation = componentRecommendation(recommendations.cropRecommendation);
  assert.equal(recommendation.predicted_crop, 'Tomato');
  assert.equal(confidenceLabel(recommendation.confidence), '90.0%');
  assert.deepEqual(cropCandidates(recommendation), recommendation.top_3);
  assert.deepEqual(cropCandidates({ top_3: null }), []);
});

test('irrigation component keeps decision, urgency, factors, and explanation values', () => {
  const recommendation = componentRecommendation(recommendations.irrigation);
  assert.equal(recommendation.irrigation_required, true);
  assert.equal(recommendation.urgency, 'High');
  assert.equal(recommendation.reason, 'Returned reason');
  assert.deepEqual(recommendation.factors, { soil: 'dry' });
});

test('fertilizer component keeps classifications, priorities, reasoning, and disease caution', () => {
  const recommendation = componentRecommendation(recommendations.fertilizer);
  assert.deepEqual(recommendation.nutrient_status, { N: 'low' });
  assert.deepEqual(recommendation.priority_nutrients, ['N']);
  assert.deepEqual(recommendation.reasoning, ['Returned reasoning']);
  assert.equal(recommendation.caution, 'Returned caution');
});

test('disease risk component preserves risk score, signals, reasoning, and caveats', () => {
  const recommendation = componentRecommendation(recommendations.diseaseRisk);
  assert.equal(recommendation.risk_level, 'Medium');
  assert.equal(recommendation.risk_score, 0.5);
  assert.deepEqual(recommendation.signals, { humidity: 0.2 });
  assert.equal(recommendation.risk_score_note, 'Prototype index');
  assert.equal(recommendation.disclaimer, 'Environmental conditions do not confirm disease.');
});

test('market summary keeps backend price, market, date, trend, and status', () => {
  const recommendation = componentRecommendation(recommendations.market);
  assert.equal(recommendation.current_price, 2300);
  assert.equal(recommendation.latest_date, '2026-09-10');
  assert.equal(recommendation.trend, 'Increasing');
  assert.equal(recommendation.status, 'SUCCESS');
});

test('local fallback market source is clearly identified with a warning', () => {
  assert.deepEqual(marketProvenance('local-fallback'), { kind: 'local', label: 'Local fallback data' });
  assert.match(componentWarnings({ key: 'market' }, componentRecommendation(recommendations.market)).join(' '), /local fallback.*not live Government/i);
});

test('live, unknown, and other market provenance are not conflated', () => {
  assert.deepEqual(marketProvenance('data.gov.in (live)'), { kind: 'live', label: 'Live data.gov.in' });
  assert.deepEqual(marketProvenance(null), { kind: 'unknown', label: 'Source not returned' });
  assert.deepEqual(marketProvenance('Regional feed'), { kind: 'other', label: 'Source: Regional feed' });
});

test('crop ranking candidates preserve ranking values and per-candidate provenance', () => {
  const recommendation = componentRecommendation(recommendations.cropRanking);
  assert.equal(rankedCropCandidates(recommendation)[0].crop, 'Tomato');
  assert.equal(rankedCropCandidates(recommendation)[0].market_source, 'local-fallback');
  assert.deepEqual(rankedCropCandidates({ ranked_crops: null }), []);
});

test('module disclaimers, score caveats, and disease cautions remain visible', () => {
  assert.deepEqual(componentWarnings({ key: 'diseaseRisk' }, componentRecommendation(recommendations.diseaseRisk)), ['Environmental conditions do not confirm disease.', 'Prototype index']);
  assert.deepEqual(componentWarnings({ key: 'fertilizer' }, componentRecommendation(recommendations.fertilizer)), ['Returned caution']);
  assert.ok(componentWarnings({ key: 'cropRanking' }, componentRecommendation({ status: 'SUCCESS', data: { recommendation: { disclaimer: 'Ranking is a prototype.' } } })).includes('Ranking is a prototype.'));
});

test('missing backend values stay absent instead of receiving display defaults', () => {
  assert.equal(formatEvaluationValue(null), null);
  assert.equal(formatEvaluationValue(undefined), null);
  assert.equal(formatEvaluationValue(Number.NaN), null);
  assert.equal(confidenceLabel(undefined), null);
  assert.deepEqual(cropCandidates({}), []);
  assert.deepEqual(rankedCropCandidates({}), []);
});

test('booleans and finite values use readable labels without changing the returned decision', () => {
  assert.equal(formatEvaluationValue(true), 'Yes');
  assert.equal(formatEvaluationValue(false), 'No');
  assert.equal(formatEvaluationValue(0), '0');
  assert.equal(formatEvaluationValue('Returned text'), 'Returned text');
});

test('component status labels distinguish success, unavailable, insufficient data, and dependency failure', () => {
  assert.equal(componentStatus('SUCCESS').label, 'Available');
  assert.equal(componentStatus('UNAVAILABLE').label, 'Data unavailable');
  assert.equal(componentStatus('INSUFFICIENT_FARM_DATA').label, 'Farm data needed');
  assert.equal(componentStatus('INSUFFICIENT_DEPENDENCY').label, 'Required result unavailable');
});

test('component errors preserve safe messages and the actual missing fields', () => {
  const failure = componentError({ error: { code: 'INSUFFICIENT_FARM_DATA', message: 'Farm data is insufficient.', missingFields: ['rain_probability'] } });
  assert.deepEqual(failure, { code: 'INSUFFICIENT_FARM_DATA', message: 'Farm data is insufficient.', missingFields: ['rain_probability'] });
  assert.equal(componentError({}), null);
  assert.deepEqual(componentError({ error: {} }).missingFields, []);
});

test('top-level missingFields are retained for the Edit Farm flow', () => {
  const error = { payload: { error: { missingFields: ['N', 'temperature'] } } };
  assert.deepEqual(evaluationMissingFields(error), ['N', 'temperature']);
  assert.deepEqual(evaluationMissingFields({}), []);
});

test('401 authentication errors receive a sign-in-specific message', () => {
  assert.equal(evaluationErrorTitle({ status: 401 }), 'Sign in required');
  assert.equal(evaluationErrorMessage({ status: 401, message: 'Session expired.' }), 'Session expired.');
});

test('400 invalid Farm ID errors receive request-specific messaging', () => {
  assert.equal(evaluationErrorTitle({ status: 400, code: 'INVALID_FARM_ID' }), 'Farm evaluation request is invalid');
  assert.equal(evaluationErrorMessage({ message: 'Invalid farm ID.' }), 'Invalid farm ID.');
});

test('404 missing Farm errors are handled', () => {
  assert.equal(evaluationErrorTitle({ status: 404, code: 'FARM_NOT_FOUND' }), 'Farm unavailable');
});

test('503 provider errors receive service-unavailable messaging', () => {
  assert.equal(evaluationErrorTitle({ status: 503 }), 'Evaluation service unavailable');
  assert.equal(evaluationErrorTitle({ code: 'PROVIDER_UNAVAILABLE' }), 'Evaluation service unavailable');
});

test('generic API errors preserve client messages and safely fill absent messages', () => {
  assert.equal(evaluationErrorTitle({ status: 500 }), 'Farm evaluation could not be loaded');
  assert.equal(evaluationErrorMessage({ message: 'Request failed.' }), 'Request failed.');
  assert.match(evaluationErrorMessage({}), /Please try again/);
});

test('insufficient Farm data errors keep actionable copy', () => {
  assert.equal(evaluationErrorTitle({ status: 400, code: 'INSUFFICIENT_FARM_DATA' }), 'Farm information is incomplete');
  assert.match(evaluationErrorMessage({ code: 'INSUFFICIENT_FARM_DATA' }), /required Farm information/);
});

test('Farm switching invalidates old result requests', () => {
  const tracker = createFarmEvaluationRequestTracker('farm-a');
  const first = tracker.begin('farm-a');
  tracker.setFarmId('farm-b');
  assert.equal(tracker.isCurrent(first, 'farm-a'), false);
  assert.equal(tracker.finish(first, 'farm-a'), false);
  assert.equal(visibleFarmEvaluation(evaluation, 'farm-b'), null);
});

test('request tracker prevents duplicate evaluation requests for the selected Farm', () => {
  const tracker = createFarmEvaluationRequestTracker('farm-a');
  const requestId = tracker.begin('farm-a');
  assert.equal(typeof requestId, 'number');
  assert.equal(tracker.begin('farm-a'), null);
  assert.equal(tracker.finish(requestId, 'farm-a'), true);
  assert.notEqual(tracker.begin('farm-a'), null);
});

test('request tracker rejects missing or non-selected Farm IDs', () => {
  const tracker = createFarmEvaluationRequestTracker('farm-a');
  assert.equal(tracker.begin(undefined), null);
  assert.equal(tracker.begin('farm-b'), null);
});
