/** Deterministic local market verification against a temporary owned Atlas Farm. This test cannot call data.gov.in. */
process.env.JWT_SECRET ||= 'test-only-secret-generated-for-agrisense-m21';
process.env.DATA_GOV_IN_API_KEY = '';

const assert = require('assert');
const http = require('http');
const { connectDB, disconnectDB } = require('../config/db');
const Farm = require('../db/models/Farm');
const User = require('../db/models/User');
const { hashPassword } = require('../services/passwordService');
const { issueToken } = require('../services/authTokenService');
const app = require('../server');
const farmCropRankingService = require('../services/farmCropRankingService');

function request(server, path, token) {
  return new Promise((resolve, reject) => {
    http.get({ hostname: '127.0.0.1', port: server.address().port, path, headers: { authorization: `Bearer ${token}` } }, res => {
      let body = ''; res.on('data', chunk => body += chunk);
      res.on('end', () => { try { resolve({ status: res.statusCode, body: JSON.parse(body) }); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}

function snapshot(farm) {
  return {
    name: farm.name, location: farm.location, soil: farm.soil, crop: farm.crop,
    fieldConditions: farm.fieldConditions, weather: farm.weather,
    diseaseContext: farm.diseaseContext, marketContext: farm.marketContext
  };
}

async function run() {
  let connected = false; let server; let farm; let user; let token;
  let countBefore; let usersBefore;
  try {
    connected = await connectDB();
    assert(connected, 'MongoDB Atlas connection unavailable');
    countBefore = await Farm.countDocuments();
    usersBefore = await User.countDocuments();
    user = await User.create({ name: 'Local Market Test User', email: `local-market-${Date.now()}@example.test`, passwordHash: await hashPassword(`fixture-${Date.now()}`) });
    token = issueToken(user._id);
    farm = await Farm.create({
      ownerId: user._id, name: 'Local market fixture farm',
      location: { state: 'Karnataka', district: 'Kolar' },
      soil: { nitrogen: 80, phosphorus: 40, potassium: 40, ph: 6.5 },
      crop: { name: 'Tomato', growthStage: 'vegetative' },
      fieldConditions: { soilMoisture: 25 },
      weather: { temperature: 26, humidity: 65, rainfall: 2, recentRainfall: 6, rainProbability: 20, expectedRainfall: 3 },
      diseaseContext: { detected: false }, marketContext: { market: 'Kolar', state: 'Karnataka', district: 'Kolar' }
    });
    const farmId = farm._id.toString();
    const before = snapshot(farm.toObject());
    server = app.listen(0);

    const market = await request(server, `/api/farms/${farmId}/market`, token);
    assert.equal(market.status, 200, market.body.error && market.body.error.message);
    const normalized = market.body.recommendation;
    assert(normalized && normalized.status === 'SUCCESS' && normalized.data_available, 'Local fixture market lookup was unavailable');
    assert.equal(normalized.raw_source, 'local-fallback');
    assert(Number.isFinite(normalized.current_price) && normalized.current_price >= 0);
    assert.equal(normalized.price_range.unit, 'INR/Quintal');
    assert(normalized.price_range.min_price <= normalized.price_range.modal_price && normalized.price_range.modal_price <= normalized.price_range.max_price);

    const state = await request(server, `/api/farms/${farmId}/shared-state`, token);
    assert.equal(state.status, 200);
    assert.deepStrictEqual(state.body.sharedFarmState.marketContext, before.marketContext);

    const ranking = await farmCropRankingService.getCropRanking(farmId, {
      cropRecommendationOutput: {
        predicted_crop: farm.crop.name, confidence: 0.9,
        top_3: [{ crop: farm.crop.name, probability: 0.9 }]
      }
    });
    const ranked = ranking.recommendation && ranking.recommendation.ranked_crops;
    assert(Array.isArray(ranked) && ranked[0].market_data_available, 'Crop Ranking did not use matching local market data');
    assert(Number.isFinite(ranked[0].market_signal));

    const evaluation = await request(server, `/api/farms/${farmId}/evaluation`, token);
    assert.equal(evaluation.status, 200, evaluation.body.error && evaluation.body.error.message);
    const recommendations = evaluation.body.recommendations;
    assert(recommendations && recommendations.market && recommendations.market.status === 'SUCCESS');
    assert.equal(recommendations.market.data.recommendation.raw_source, 'local-fallback');
    assert(recommendations.cropRanking && recommendations.cropRanking.status === 'SUCCESS');

    const after = await Farm.findById(farmId).lean();
    assert.deepStrictEqual(snapshot(after), before, 'Read-only market, ranking, or evaluation flow mutated the Farm');
    assert.equal(await Farm.countDocuments(), countBefore + 1, 'Unexpected Farm count change during owned fixture test');
    console.log('PASS: local-fallback Farm Market endpoint, normalized record, and INR/Quintal prices.');
    console.log('PASS: persisted Farm.marketContext reached Shared Farm State unchanged.');
    console.log('PASS: Crop Ranking consumed a local market signal; Composite Evaluation returned local market and ranking components.');
    console.log('PASS: no Government API key was passed; persisted fixture farm remained read-only.');
  } catch (error) {
    console.error(`FAIL: local Atlas market verification failed: ${error.message}`);
    process.exitCode = 1;
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    if (farm) await Farm.deleteOne({ _id: farm._id, ownerId: user._id });
    if (user) await User.deleteOne({ _id: user._id });
    if (connected) {
      const farmsAfter = await Farm.countDocuments();
      const usersAfter = await User.countDocuments();
      await disconnectDB();
      connected = false;
      assert.equal(farmsAfter, countBefore, 'Atlas Farm count did not return to its starting value');
      assert.equal(usersAfter, usersBefore, 'Atlas User count did not return to its starting value');
      console.log(`Atlas cleanup verified: users ${usersBefore}; farms ${countBefore}.`);
    }
  }
}

run().catch(error => { console.error(`FAIL: local Atlas market verification failed: ${error.message}`); process.exitCode = 1; });
