const nodeAssert = require('node:assert/strict');
let checks = 0;
const assert = (...args) => { checks++; return nodeAssert(...args); };
for (const method of ['equal', 'deepEqual', 'match']) {
  assert[method] = (...args) => { checks++; return nodeAssert[method](...args); };
}
const jwt = require('jsonwebtoken');
const { connectDB, disconnectDB } = require('../config/db');
const User = require('../db/models/User');
const Farm = require('../db/models/Farm');
const aiService = require('../services/aiService');
const cropService = require('../services/farmCropRecommendationService');
const irrigationService = require('../services/farmIrrigationService');
const fertilizerService = require('../services/farmFertilizerService');
const diseaseRiskService = require('../services/farmDiseaseRiskService');
const marketService = require('../services/farmMarketService');
const rankingService = require('../services/farmCropRankingService');
const evaluationService = require('../services/farmEvaluationService');
const farmWeatherService = require('../services/farmWeatherService');

process.env.JWT_SECRET ||= 'test-only-secret-generated-for-agrisense-m21';
const app = require('../server');

async function request(base, method, path, body, token) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  return { status: response.status, body: await response.json() };
}

async function main() {
  assert(process.env.MONGODB_URI, 'Atlas configuration is required for this integration test.');
  assert(await connectDB(), 'MongoDB Atlas connection failed.');
  const initialUsers = await User.countDocuments();
  const initialFarms = await Farm.countDocuments();
  const createdUserIds = [];
  const createdFarmIds = [];
  let server;
  const originalDetectDisease = aiService.detectDisease;
  const originalPredictCrop = aiService.predictCrop;
  const originalFarmServiceMethods = [
    [cropService, 'getCropRecommendation'], [irrigationService, 'getIrrigationRecommendation'],
    [fertilizerService, 'getFertilizerRecommendation'], [diseaseRiskService, 'getDiseaseRiskAssessment'],
    [marketService, 'getMarketIntelligence'], [rankingService, 'getCropRanking'],
    [evaluationService, 'evaluateFarm'], [farmWeatherService, 'refreshWeather']
  ].map(([service, method]) => [service, method, service[method]]);
  try {
    await User.init();
    assert((await User.collection.indexes()).some(index => index.key.email === 1 && index.unique === true), 'email must have a unique database index');
    server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const deniedOrigin = await fetch(`${base}/api/auth/me`, { headers: { origin: 'https://untrusted.example' } });
    assert.equal(deniedOrigin.status, 403, 'unconfigured browser origins must be denied');
    assert.equal((await deniedOrigin.json()).error.code, 'CORS_ORIGIN_DENIED');
    const largeBody = await fetch(`${base}/api/auth/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'x@example.test', password: 'x'.repeat(110_000) })
    });
    assert.equal(largeBody.status, 413, 'JSON request body limit must be enforced');
    assert.equal((await largeBody.json()).error.code, 'PAYLOAD_TOO_LARGE');
    const registerA = await request(base, 'POST', '/api/auth/register', { name: 'M21 Test A', email: `m21-a-${suffix}@example.test`, password: 'test-password-21' });
    assert.equal(registerA.status, 201);
    assert.deepEqual(Object.keys(registerA.body.user).sort(), ['email', 'id', 'name']);
    const registerB = await request(base, 'POST', '/api/auth/register', { name: 'M21 Test B', email: `m21-b-${suffix}@example.test`, password: 'test-password-21' });
    assert.equal(registerB.status, 201);
    const userA = await User.findById(registerA.body.user.id).select('+passwordHash');
    const userB = await User.findById(registerB.body.user.id).select('+passwordHash');
    createdUserIds.push(userA._id, userB._id);
    assert.match(userA.passwordHash, /^scrypt\$/);
    assert.equal(JSON.stringify(userA.toJSON()).includes('passwordHash'), false);
    assert.equal((await request(base, 'POST', '/api/auth/register', { name: 'Again', email: userA.email.toUpperCase(), password: 'test-password-21' })).status, 409);
    assert.equal((await request(base, 'POST', '/api/auth/register', { name: 'Bad', email: 'bad-email', password: 'test-password-21' })).status, 400);
    assert.equal((await request(base, 'POST', '/api/auth/register', { name: 'Weak', email: `weak-${suffix}@example.test`, password: 'short' })).status, 400);
    assert.equal((await request(base, 'POST', '/api/auth/register', { email: `missing-${suffix}@example.test`, password: 'test-password-21' })).status, 400);
    assert.equal((await request(base, 'POST', '/api/auth/login', { email: userA.email, password: 'test-password-21' })).status, 200);
    assert.equal((await request(base, 'POST', '/api/auth/login', { email: userA.email, password: 'wrong-password' })).status, 401);
    assert.equal((await request(base, 'POST', '/api/auth/login', { email: `missing-${suffix}@example.test`, password: 'test-password-21' })).status, 401);
    assert.equal((await request(base, 'POST', '/api/auth/login', { email: userA.email })).status, 400);
    assert.equal((await request(base, 'GET', '/api/auth/me')).status, 401);
    assert.equal((await request(base, 'GET', '/api/auth/me', undefined, 'bad')).status, 401);
    assert.equal((await fetch(`${base}/api/auth/me`, { headers: { authorization: 'Basic abcd' } })).status, 401);
    assert.equal((await request(base, 'GET', '/api/auth/me', undefined, jwt.sign({ sub: userA._id.toString(), iss: 'agrisense-api', aud: 'agrisense-client', exp: Math.floor(Date.now() / 1000) - 10, iat: Math.floor(Date.now() / 1000) - 4000 }, process.env.JWT_SECRET))).status, 401);
    assert.equal((await request(base, 'GET', '/api/auth/me', undefined, jwt.sign({ sub: userA._id.toString() }, 'wrong-secret'))).status, 401);
    assert.equal((await request(base, 'GET', '/api/auth/me', undefined, registerA.body.token)).status, 200);

    const farmPayload = { name: 'M21 Test Farm A', location: { state: 'Karnataka', district: 'Kolar' }, crop: { name: 'Tomato' } };
    const createA = await request(base, 'POST', '/api/farms', { ...farmPayload, ownerId: userB._id }, registerA.body.token);
    assert.equal(createA.status, 400, 'client ownerId must not be accepted');
    const farmAResponse = await request(base, 'POST', '/api/farms', farmPayload, registerA.body.token);
    assert.equal(farmAResponse.status, 201);
    const farmAId = farmAResponse.body.farm._id;
    createdFarmIds.push(farmAId);
    assert.equal(farmAResponse.body.farm.ownerId.toString(), userA._id.toString());
    const farmBResponse = await request(base, 'POST', '/api/farms', { ...farmPayload, name: 'M21 Test Farm B' }, registerB.body.token);
    assert.equal(farmBResponse.status, 201);
    const farmBId = farmBResponse.body.farm._id;
    createdFarmIds.push(farmBId);
    assert.equal((await request(base, 'GET', '/api/farms', undefined, registerA.body.token)).body.farms.length, 1);
    assert.equal((await request(base, 'GET', '/api/farms', undefined, registerA.body.token)).body.farms[0]._id, farmAId);
    assert.equal((await request(base, 'GET', '/api/farms', undefined, registerB.body.token)).body.farms[0]._id, farmBResponse.body.farm._id);
    assert.equal((await request(base, 'GET', `/api/farms/${farmAId}`, undefined, registerA.body.token)).status, 200);
    assert.equal((await request(base, 'PATCH', `/api/farms/${farmAId}`, { name: 'M21 Updated Farm A', ownerId: userB._id }, registerA.body.token)).status, 400);
    assert.equal((await request(base, 'PATCH', `/api/farms/${farmAId}`, { name: 'M21 Updated Farm A' }, registerA.body.token)).status, 200);
    assert.equal((await request(base, 'PUT', `/api/farms/${farmAId}`, { name: 'M21 Put Farm A' }, registerA.body.token)).status, 200);
    assert.equal((await request(base, 'GET', `/api/farms/${farmAId}/shared-state`, undefined, registerA.body.token)).status, 200);
    assert.equal((await request(base, 'GET', `/api/farms/${farmAId}/weather`, undefined, registerA.body.token)).status, 200);
    const invalidWeights = await request(base, 'GET', `/api/farms/${farmAId}/crop-ranking?agronomic_weight=Infinity&market_weight=0`, undefined, registerA.body.token);
    assert.equal(invalidWeights.status, 400, 'non-finite crop-ranking weights must be rejected');
    assert.equal(invalidWeights.body.error.code, 'INVALID_INPUT');
    for (const [service, method] of originalFarmServiceMethods) {
      service[method] = async (...args) => ({ success: true, farmId: String(args[0]), sharedFarmState: args[1] || null });
    }
    for (const suffix of ['crop-recommendation', 'irrigation', 'fertilizer', 'disease-risk', 'market', 'crop-ranking', 'evaluation']) {
      assert.equal((await request(base, 'GET', `/api/farms/${farmAId}/${suffix}`, undefined, registerA.body.token)).status, 200, `owner GET ${suffix}`);
    }
    assert.equal((await request(base, 'POST', `/api/farms/${farmAId}/weather/refresh`, {}, registerA.body.token)).status, 200, 'owner weather refresh');

    const protectedPaths = [
      `/api/farms/${farmAId}`, `/api/farms/${farmAId}/shared-state`, `/api/farms/${farmAId}/weather`,
      `/api/farms/${farmAId}/weather/refresh`, `/api/farms/${farmAId}/crop-recommendation`,
      `/api/farms/${farmAId}/irrigation`, `/api/farms/${farmAId}/fertilizer`,
      `/api/farms/${farmAId}/disease-risk`, `/api/farms/${farmAId}/market`,
      `/api/farms/${farmAId}/crop-ranking`, `/api/farms/${farmAId}/evaluation`
    ];
    for (const path of protectedPaths) assert.equal((await request(base, 'GET', path, undefined, registerB.body.token)).status, 404, `cross-user GET ${path}`);
    for (const [method, body] of [['PATCH', { name: 'attacker' }], ['PUT', { name: 'attacker' }], ['DELETE', undefined]]) {
      assert.equal((await request(base, method, `/api/farms/${farmAId}`, body, registerB.body.token)).status, 404, `cross-user ${method} farm`);
    }
    assert.equal((await request(base, 'POST', `/api/farms/${farmAId}/weather/refresh`, {}, registerB.body.token)).status, 404, 'cross-user weather refresh');
    assert.equal((await request(base, 'POST', '/api/farms', farmPayload)).status, 401);
    assert.equal((await request(base, 'GET', `/api/farms/${farmAId}/weather`)).status, 401);

    aiService.detectDisease = async () => ({ result: { predicted_disease: 'Healthy', confidence: 0.98 } });
    assert.equal((await request(base, 'POST', '/api/ai/disease-detection', { image_path: ['not', 'a', 'path'] })).status, 400,
      'disease image path must be a bounded string');
    assert.equal((await request(base, 'POST', '/api/ai/disease-detection', { image_path: `x${'x'.repeat(1024)}` })).status, 400,
      'oversized disease image paths must be rejected');
    assert.equal((await request(base, 'POST', '/api/ai/disease-detection', { image_path: 'test-image.jpg' })).status, 200, 'standalone disease detection remains public');
    const diseaseOther = await request(base, 'POST', '/api/ai/disease-detection', { image_path: 'test-image.jpg', farmId: farmAId }, registerB.body.token);
    assert.equal(diseaseOther.status, 404);
    assert.equal((await request(base, 'POST', '/api/ai/disease-detection', { image_path: 'test-image.jpg', farmId: farmAId })).status, 401);
    assert.equal((await request(base, 'POST', '/api/ai/predict', { task: 'disease_detection', input: { image_path: 'test-image.jpg', farmId: farmAId } }, registerB.body.token)).status, 404);
    const diseaseOwn = await request(base, 'POST', '/api/ai/disease-detection', { image_path: 'test-image.jpg', farmId: farmAId }, registerA.body.token);
    assert.equal(diseaseOwn.status, 200);
    assert.equal((await Farm.findById(farmAId)).diseaseContext.disease, 'Healthy');
    aiService.predictCrop = async () => ({ result: { predicted_crop: 'test' } });
    assert.equal((await request(base, 'POST', '/api/ai/crop-recommendation', { input: {} })).status, 200, 'standalone AI endpoint remains public');
    aiService.predictCrop = async () => { throw { error: { code: 'PYTHON_SPAWN_ERROR', message: 'C:\\private\\python.exe: secret' } }; };
    const sanitizedAiError = await request(base, 'POST', '/api/ai/crop-recommendation', { input: {} });
    assert.equal(sanitizedAiError.status, 503, 'AI process failures must map to dependency unavailable');
    assert.equal(sanitizedAiError.body.error.message, 'An unexpected error occurred in AI service.', 'AI process details must not reach clients');

    const deletedUserToken = jwt.sign({}, process.env.JWT_SECRET, { algorithm: 'HS256', subject: userB._id.toString(), issuer: 'agrisense-api', audience: 'agrisense-client', expiresIn: '1h' });
    await User.deleteOne({ _id: userB._id });
    assert.equal((await request(base, 'GET', '/api/auth/me', undefined, deletedUserToken)).status, 401);
    assert.equal((await request(base, 'DELETE', `/api/farms/${farmAId}`, undefined, registerA.body.token)).status, 200);
    createdFarmIds.splice(createdFarmIds.indexOf(farmAId), 1);
    console.log(`Auth and multi-tenancy integration: ${checks} checks passed.`);
    console.log(`Atlas counts before/after cleanup: users ${initialUsers}/${await User.countDocuments()} (created 2, one explicitly deleted); farms ${initialFarms}/${await Farm.countDocuments()}.`);
  } finally {
    aiService.detectDisease = originalDetectDisease;
    aiService.predictCrop = originalPredictCrop;
    for (const [service, method, original] of originalFarmServiceMethods) service[method] = original;
    if (server) await new Promise(resolve => server.close(resolve));
    if (createdFarmIds.length) await Farm.deleteMany({ _id: { $in: createdFarmIds } });
    if (createdUserIds.length) await User.deleteMany({ _id: { $in: createdUserIds } });
    const finalUsers = await User.countDocuments();
    const finalFarms = await Farm.countDocuments();
    console.log(`Atlas cleanup verified: users ${initialUsers} → ${finalUsers}; farms ${initialFarms} → ${finalFarms}.`);
    await disconnectDB();
  }
}

main().catch(error => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
