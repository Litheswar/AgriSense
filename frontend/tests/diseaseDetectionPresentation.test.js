import test from 'node:test';
import assert from 'node:assert/strict';
import {
  diseaseDetectionErrorMessage,
  diseaseDetectionErrorTitle,
  diseaseOutcomeMode,
  formatDiseaseConfidence,
  validateDiseaseUpload
} from '../src/lib/diseaseDetectionPresentation.js';

const file = (name, type, size = 1024) => ({ name, type, size });

test('upload validation accepts one supported JPEG or PNG file', () => {
  const jpeg = file('leaf.jpg', 'image/jpeg');
  const png = file('leaf.PNG', 'image/png');
  assert.deepEqual(validateDiseaseUpload([jpeg]), { valid: true, file: jpeg });
  assert.deepEqual(validateDiseaseUpload([png]), { valid: true, file: png });
});

test('upload validation reports no file, empty file, multiple files, and size errors', () => {
  assert.equal(validateDiseaseUpload([]).code, 'MISSING_IMAGE');
  assert.equal(validateDiseaseUpload([file('empty.png', 'image/png', 0)]).code, 'EMPTY_FILE');
  assert.equal(validateDiseaseUpload([file('a.jpg', 'image/jpeg'), file('b.jpg', 'image/jpeg')]).code, 'TOO_MANY_FILES');
  assert.equal(validateDiseaseUpload([file('large.jpg', 'image/jpeg', 5 * 1024 * 1024 + 1)]).code, 'IMAGE_TOO_LARGE');
});

test('upload validation checks both filename extension and declared MIME type', () => {
  assert.equal(validateDiseaseUpload([file('leaf.gif', 'image/gif')]).code, 'UNSUPPORTED_MEDIA_TYPE');
  assert.equal(validateDiseaseUpload([file('leaf.jpg', 'image/png')]).code, 'UNSUPPORTED_MEDIA_TYPE');
  assert.equal(validateDiseaseUpload([file('leaf.png', 'image/jpeg')]).code, 'UNSUPPORTED_MEDIA_TYPE');
});

test('Farm-linked results are hidden for a different selection while standalone results remain distinct', () => {
  const farmOutcome = { linked: true, farmId: 'farm-a' };
  const standaloneOutcome = { linked: false, farmId: null };
  assert.equal(diseaseOutcomeMode(null, 'farm-a'), 'none');
  assert.equal(diseaseOutcomeMode(farmOutcome, 'farm-a'), 'farm-result');
  assert.equal(diseaseOutcomeMode(farmOutcome, 'farm-b'), 'stale-farm-result');
  assert.equal(diseaseOutcomeMode(standaloneOutcome, 'farm-b'), 'standalone-result');
});

test('confidence formatting keeps backend values readable and handles missing values', () => {
  assert.equal(formatDiseaseConfidence(0.88), '88%');
  assert.equal(formatDiseaseConfidence(0.876), '87.6%');
  assert.equal(formatDiseaseConfidence(null), 'Unavailable');
});

test('upload API errors map to actionable safe messages and titles', () => {
  assert.match(diseaseDetectionErrorMessage({ code: 'IMAGE_TOO_LARGE' }), /5 MB or smaller/);
  assert.match(diseaseDetectionErrorMessage({ code: 'UNSUPPORTED_FILE_CONTENT' }), /contents/);
  assert.match(diseaseDetectionErrorMessage({ code: 'FARM_NOT_FOUND' }), /no longer available/);
  assert.equal(diseaseDetectionErrorTitle({ status: 401 }), 'Sign in required to save to a Farm');
  assert.equal(diseaseDetectionErrorTitle({ status: 503 }), 'Detection service unavailable');
  assert.equal(diseaseDetectionErrorMessage({ message: 'Network error' }), 'Network error');
});
