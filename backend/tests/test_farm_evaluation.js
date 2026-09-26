/** Milestone 18K composite orchestration and HTTP contract checks. */
const http = require('http');
const app = require('../server');
const farmService = require('../services/farmService');
const sharedStateService = require('../services/sharedFarmStateService');
const crop = require('../services/farmCropRecommendationService');
const irrigation = require('../services/farmIrrigationService');
const fertilizer = require('../services/farmFertilizerService');
const diseaseRisk = require('../services/farmDiseaseRiskService');
const market = require('../services/farmMarketService');
const ranking = require('../services/farmCropRankingService');
const evaluation = require('../services/farmEvaluationService');

const methods = [
  [sharedStateService, 'getSharedFarmState'],
  [crop, 'getCropRecommendation'], [irrigation, 'getIrrigationRecommendation'],
  [fertilizer, 'getFertilizerRecommendation'], [diseaseRisk, 'getDiseaseRiskAssessment'],
  [market, 'getMarketIntelligence'], [ranking, 'getCropRanking']
];
const originals = methods.map(([object, key]) => object[key]);
let passed = 0;
let failed = 0;
function assert(ok, message) { if (!ok) throw new Error(message); }
function test(name, fn) {
  return Promise.resolve().then(fn).then(() => { passed++; console.log(`  [PASS] ${name}`); })
    .catch(error => { failed++; console.error(`  [FAIL] ${name}: ${error.message}`); });
}
function request(server, path) {
  return new Promise((resolve, reject) => {
    http.get({ hostname: '127.0.0.1', port: server.address().port, path }, response => {
      let body = ''; response.on('data', chunk => body += chunk);
      response.on('end', () => resolve({ status: response.statusCode, body: JSON.parse(body) }));
    }).on('error', reject);
  });
}

async function run() {
  console.log('\nAGRISENSE — COMPOSITE FARM EVALUATION SUITE (MILESTONE 18K)');
  const priorMode = farmService.isMemoryMode;
  farmService.setMemoryMode(true);
  let farm;
  let server;
  try {
    farm = await farmService.createFarm({
      name: '18K evaluation test farm',
      location: { state: 'Karnataka', district: 'Kolar' },
      soil: { nitrogen: 80, phosphorus: 40, potassium: 40, ph: 6.5 },
      crop: { name: 'Tomato', growthStage: 'vegetative' },
      weather: { temperature: 26, humidity: 60, rainfall: 12, recentRainfall: 5, rainProbability: 10, expectedRainfall: 0 },
      fieldConditions: { soilMoisture: 25 },
      diseaseContext: { detected: true, disease: 'Early blight', confidence: 0.91 },
      marketContext: { market: 'Kolar', state: 'Karnataka' }
    });
    const farmId = farm._id.toString();
    const canonical = farm.toSharedFarmState();
    let fetchCount = 0;
    sharedStateService.getSharedFarmState = async id => {
      fetchCount++;
      assert(id === farmId, 'canonical state fetched for wrong farm');
      return canonical;
    };
    const recommendation = { predicted_crop: 'tomato', confidence: 0.9, top_3: [{ crop: 'tomato', probability: 0.9 }] };
    crop.getCropRecommendation = async (id, state) => ({ success: true, farmId: id, sharedFarmState: state, recommendation });
    irrigation.getIrrigationRecommendation = async (id, state) => ({ success: true, farmId: id, sharedFarmState: state, recommendation: { irrigation_required: true } });
    fertilizer.getFertilizerRecommendation = async (id, state) => ({ success: true, farmId: id, sharedFarmState: state, recommendation: { caution: state.diseaseContext.disease } });
    diseaseRisk.getDiseaseRiskAssessment = async (id, state) => ({ success: true, farmId: id, sharedFarmState: state, recommendation: { risk_level: 'Medium' } });
    market.getMarketIntelligence = async (id, state) => ({ success: true, farmId: id, sharedFarmState: state, recommendation: { data_available: true, market_score: 75 } });
    ranking.getCropRanking = async (id, options) => {
      assert(options.sharedFarmState === canonical, 'ranking did not receive canonical state');
      assert(options.cropRecommendationOutput === recommendation, 'ranking did not consume crop recommendation output');
      return { success: true, farmId: id, agronomicPrediction: options.cropRecommendationOutput, recommendation: { ranked_crops: [] } };
    };

    await test('one canonical Shared Farm State feeds every existing result', async () => {
      const before = JSON.stringify(farm.toObject());
      const result = await evaluation.evaluateFarm(farmId);
      assert(fetchCount === 1, `expected one Farm lookup, got ${fetchCount}`);
      assert(result.status === 'SUCCESS', 'complete evaluation should succeed');
      for (const key of ['cropRecommendation', 'irrigation', 'fertilizer', 'diseaseRisk', 'market', 'cropRanking']) {
        assert(result.recommendations[key].status === 'SUCCESS', `${key} missing`);
      }
      assert(result.farmContext.diseaseContext.disease === 'Early blight', 'persisted disease context missing');
      assert(JSON.stringify(farm.toObject()) === before, 'evaluation mutated Farm document');
    });

    await test('component failures return honest partial results', async () => {
      irrigation.getIrrigationRecommendation = async () => { const e = new Error('weather fields absent'); e.code = 'INSUFFICIENT_FARM_DATA'; e.missingFields = ['rain_probability']; throw e; };
      const result = await evaluation.evaluateFarm(farmId);
      assert(result.status === 'PARTIAL', 'expected PARTIAL overall status');
      assert(result.recommendations.irrigation.status === 'INSUFFICIENT_FARM_DATA', 'missing data status lost');
      assert(result.recommendations.cropRecommendation.status === 'SUCCESS', 'successful result lost');
      irrigation.getIrrigationRecommendation = async (id, state) => ({ success: true, farmId: id, sharedFarmState: state, recommendation: {} });
    });

    await test('failed crop inference marks ranking dependency unavailable', async () => {
      crop.getCropRecommendation = async () => { throw { error: { code: 'PYTHON_SPAWN_ERROR', message: 'unavailable' } }; };
      const result = await evaluation.evaluateFarm(farmId);
      assert(result.status === 'PARTIAL', 'expected partial result');
      assert(result.recommendations.cropRecommendation.status === 'INTERNAL_ERROR', 'Python failure classification wrong');
      assert(result.recommendations.cropRanking.status === 'INSUFFICIENT_DEPENDENCY', 'ranking dependency not reported');
      crop.getCropRecommendation = async (id, state) => ({ success: true, farmId: id, sharedFarmState: state, recommendation });
    });

    methods.forEach(([object, key], index) => { object[key] = originals[index]; });

    server = http.createServer(app);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    await test('GET /api/farms/:farmId/evaluation returns composite response', async () => {
      const before = JSON.stringify((await farmService.getFarmById(farmId)).toObject());
      const response = await request(server, `/api/farms/${farmId}/evaluation`);
      assert(response.status === 200 && response.body.farmId === farmId, 'endpoint response incorrect');
      assert(response.body.status === 'SUCCESS', 'complete real local evaluation should succeed');
      for (const key of ['cropRecommendation', 'irrigation', 'fertilizer', 'diseaseRisk', 'market', 'cropRanking']) {
        assert(response.body.recommendations[key].status === 'SUCCESS', `${key} did not complete through its real service`);
      }
      assert(JSON.stringify((await farmService.getFarmById(farmId)).toObject()) === before, 'HTTP evaluation modified Farm');
    });
    await test('invalid farm ID maps to existing HTTP 400 contract', async () => {
      const response = await request(server, '/api/farms/not-an-id/evaluation');
      assert(response.status === 400 && response.body.error.code === 'INVALID_FARM_ID', 'invalid id mapping incorrect');
    });
    await test('missing farm maps to existing HTTP 404 contract', async () => {
      const response = await request(server, '/api/farms/507f1f77bcf86cd799439011/evaluation');
      assert(response.status === 404 && response.body.error.code === 'FARM_NOT_FOUND', 'not found mapping incorrect');
    });
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    methods.forEach(([object, key], index) => { object[key] = originals[index]; });
    if (farm) await farmService.deleteFarm(farm._id.toString()).catch(() => {});
    farmService.setMemoryMode(priorMode);
  }
  console.log(`\nMILESTONE 18K SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  if (failed) process.exitCode = 1;
}
run().catch(error => { console.error(error); process.exitCode = 1; });
