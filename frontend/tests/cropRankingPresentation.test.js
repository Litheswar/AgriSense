import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createCropRankingRequestTracker,
  cropRankingErrorMessage,
  cropRankingErrorTitle,
  cropRankingFallbackMessage,
  cropRankingMarketProvenance,
  cropRankingPageMode,
  formatRankingScore,
  hasLocalFallbackMarketData,
  labelCropRankingField,
  missingCropRankingFields,
  rankingCandidates,
  rankingCandidateSignals,
  topRankedCrop,
  visibleCropRanking
} from '../src/lib/cropRankingPresentation.js';

const candidates = [
  { rank: 1, crop: 'Tomato', agronomic_signal: 0.7, market_signal: 0.75, combined_score: 0.715, market_data_available: true, market_source: 'local-fallback', market_record_date: '2026-09-10' },
  { rank: 2, crop: 'Maize', agronomic_signal: 0.62, market_signal: null, combined_score: 0.62, market_data_available: false, market_source: null }
];

test('page mode handles Farm loading, Farm-load error, no selected Farm, and ready state', () => {
  const farm = { _id: 'farm-a', name: 'North Field' };
  assert.equal(cropRankingPageMode({ loading: true }), 'loading');
  assert.equal(cropRankingPageMode({ error: 'offline', selectedFarm: farm, selectedFarmId: 'farm-a' }), 'farm-error');
  assert.equal(cropRankingPageMode({ selectedFarm: null, selectedFarmId: '' }), 'no-farm');
  assert.equal(cropRankingPageMode({ selectedFarm: farm, selectedFarmId: 'farm-a' }), 'ready');
});

test('successful ranking response preserves the backend candidate ordering', () => {
  const response = { farmId: 'farm-a', recommendation: { status: 'SUCCESS', ranked_crops: candidates } };
  assert.deepEqual(rankingCandidates(response.recommendation), candidates);
  assert.equal(visibleCropRanking(response, 'farm-a'), response);
  assert.equal(visibleCropRanking(response, 'farm-b'), null);
});

test('top-ranked crop is identified from the returned rank field', () => {
  assert.equal(topRankedCrop({ ranked_crops: candidates }), candidates[0]);
  assert.equal(topRankedCrop({ ranked_crops: [{ crop: 'Unranked' }] }), null);
});

test('ranking score formatting preserves the actual numeric score and labels absent scores', () => {
  assert.equal(formatRankingScore(0.715), '0.715');
  assert.equal(formatRankingScore(null), 'Not returned');
  assert.equal(formatRankingScore(Number.NaN), 'Not returned');
});

test('recommendation and market signals are labeled and displayed exactly as returned', () => {
  assert.deepEqual(rankingCandidateSignals(candidates[0]), [
    { key: 'agronomic_signal', label: 'Agronomic recommendation signal', value: 0.7 },
    { key: 'market_signal', label: 'Market signal', value: 0.75 },
    { key: 'combined_score', label: 'Combined ranking score', value: 0.715 }
  ]);
  assert.deepEqual(rankingCandidateSignals(candidates[1]), [
    { key: 'agronomic_signal', label: 'Agronomic recommendation signal', value: 0.62 },
    { key: 'combined_score', label: 'Combined ranking score', value: 0.62 }
  ]);
});

test('live Government market provenance is presented using the exact backend source', () => {
  assert.deepEqual(cropRankingMarketProvenance('data.gov.in (live)'), { kind: 'government-live', label: 'Live Government market data (data.gov.in)' });
});

test('local fallback provenance is labeled clearly and never called Government/live data', () => {
  const provenance = cropRankingMarketProvenance('local-fallback');
  assert.deepEqual(provenance, { kind: 'local-fallback', label: 'Local fallback market data' });
  assert.doesNotMatch(provenance.label, /Government|live Agmarknet|live market prices/i);
});

test('local fallback candidates receive the Government API verification caveat', () => {
  const recommendation = { ranked_crops: candidates, missing_market_data_policy: 'FALLBACK_AGRONOMIC_PRIMARY' };
  assert.equal(hasLocalFallbackMarketData(candidates), true);
  assert.equal(cropRankingFallbackMessage(recommendation), 'Market signal uses local fallback test data. Government market API verification is currently unavailable.');
});

test('live Government source does not receive the local fallback warning', () => {
  const recommendation = { ranked_crops: [{ ...candidates[0], market_source: 'data.gov.in (live)' }] };
  assert.equal(hasLocalFallbackMarketData(recommendation.ranked_crops), false);
  assert.equal(cropRankingFallbackMessage(recommendation), null);
});

test('agronomic-only fallback policy is explained without asserting a provider provenance', () => {
  const recommendation = { ranked_crops: [candidates[1]], missing_market_data_policy: 'FALLBACK_AGRONOMIC_PRIMARY' };
  assert.equal(hasLocalFallbackMarketData(recommendation.ranked_crops), false);
  assert.match(cropRankingFallbackMessage(recommendation), /agronomic signal alone/);
  assert.deepEqual(cropRankingMarketProvenance(null), { kind: 'unknown', label: 'Market source not returned' });
});

test('unknown market provider labels remain visible without being normalized into a claim', () => {
  assert.deepEqual(cropRankingMarketProvenance('Regional data feed'), { kind: 'other', label: 'Market source: Regional data feed' });
});

test('missing Farm data fields are preserved and receive labels', () => {
  const error = { payload: { error: { missingFields: ['N', 'ph', 'temperature', 'future_field'] } } };
  assert.deepEqual(missingCropRankingFields(error), ['N', 'ph', 'temperature', 'future_field']);
  assert.equal(labelCropRankingField('N'), 'Soil nitrogen (N)');
  assert.equal(labelCropRankingField('ph'), 'Soil pH');
  assert.equal(labelCropRankingField('future_field'), 'future_field');
  assert.deepEqual(missingCropRankingFields({}), []);
});

test('401 errors have authentication-specific title and message', () => {
  const error = { status: 401, code: 'UNAUTHENTICATED', message: 'Authentication is required.' };
  assert.equal(cropRankingErrorTitle(error), 'Sign in required');
  assert.equal(cropRankingErrorMessage(error), 'Authentication is required.');
});

test('404 Farm errors preserve the backend message', () => {
  const error = { status: 404, code: 'FARM_NOT_FOUND', message: 'Farm not found.' };
  assert.equal(cropRankingErrorTitle(error), 'Farm unavailable');
  assert.equal(cropRankingErrorMessage(error), 'Farm not found.');
});

test('400 insufficient-data errors retain backend missing-data messaging', () => {
  const error = { status: 400, code: 'INSUFFICIENT_FARM_DATA', message: 'Farm data is insufficient for this recommendation.' };
  assert.equal(cropRankingErrorMessage(error), 'Farm data is insufficient for this recommendation.');
  assert.deepEqual(missingCropRankingFields({ payload: { error: { missingFields: ['K'] } } }), ['K']);
});

test('400 invalid Farm ID errors preserve the backend response instead of requesting another resource', () => {
  const error = { status: 400, code: 'INVALID_FARM_ID', message: 'Invalid farm ID.' };
  assert.equal(cropRankingErrorMessage(error), 'Invalid farm ID.');
});

test('503 and timeout failures receive service-unavailable labels', () => {
  assert.equal(cropRankingErrorTitle({ status: 503 }), 'Ranking service unavailable');
  assert.match(cropRankingErrorMessage({ status: 503, message: 'Temporarily unavailable.' }), /Temporarily unavailable/);
  assert.equal(cropRankingErrorTitle({ code: 'TIMEOUT' }), 'Ranking service unavailable');
});

test('market and crop-recommendation dependency failures keep their specific explanation', () => {
  assert.equal(cropRankingErrorTitle({ code: 'MARKET_PROVIDER_UNAVAILABLE' }), 'A ranking dependency is unavailable');
  assert.equal(cropRankingErrorMessage({ code: 'MARKET_PROVIDER_UNAVAILABLE', message: 'Market is offline.' }), 'Market is offline.');
  assert.equal(cropRankingErrorTitle({ code: 'CROP_RECOMMENDATION_UNAVAILABLE' }), 'Crop Recommendation input unavailable');
  assert.match(cropRankingErrorMessage({ code: 'CROP_RECOMMENDATION_UNAVAILABLE' }), /successful Crop Recommendation/);
});

test('generic API failures preserve the API client message', () => {
  assert.equal(cropRankingErrorTitle({ status: 500 }), 'Crop ranking could not be loaded');
  assert.equal(cropRankingErrorMessage({ message: 'Request failed.' }), 'Request failed.');
  assert.match(cropRankingErrorMessage({}), /could not be loaded/);
});

test('request tracker prevents duplicate ranking requests for a Farm', () => {
  const tracker = createCropRankingRequestTracker('farm-a');
  const requestId = tracker.begin('farm-a');
  assert.equal(typeof requestId, 'number');
  assert.equal(tracker.begin('farm-a'), null);
  assert.equal(tracker.finish(requestId, 'farm-a'), true);
  assert.equal(tracker.begin('farm-a') !== null, true);
});

test('Farm switch invalidates a pending response and permits a request for the new Farm', () => {
  const tracker = createCropRankingRequestTracker('farm-a');
  const firstId = tracker.begin('farm-a');
  tracker.setFarmId('farm-b');
  assert.equal(tracker.isCurrent(firstId, 'farm-a'), false);
  assert.equal(tracker.finish(firstId, 'farm-a'), false);
  assert.equal(visibleCropRanking({ farmId: 'farm-a', recommendation: { ranked_crops: candidates } }, 'farm-b'), null);
  const secondId = tracker.begin('farm-b');
  assert.equal(tracker.isCurrent(secondId, 'farm-b'), true);
});

test('absent candidate and score values remain absent rather than receiving fabricated defaults', () => {
  const recommendation = { ranked_crops: [{ rank: 1, crop: 'Crop A', market_data_available: false, market_signal: null }] };
  assert.deepEqual(rankingCandidates(recommendation), recommendation.ranked_crops);
  assert.equal(formatRankingScore(recommendation.ranked_crops[0].combined_score), 'Not returned');
  assert.equal(topRankedCrop({}), null);
  assert.deepEqual(rankingCandidates({}), []);
});
