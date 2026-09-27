/** Live Government market verification using an existing Atlas Farm; never uses local fallback. */
process.env.JWT_SECRET ||= 'test-only-secret-generated-for-agrisense-m21';
const assert = require('assert');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { connectDB, disconnectDB } = require('../config/db'); // loads ignored backend/.env without logging values
const Farm = require('../db/models/Farm');
const User = require('../db/models/User');
const { hashPassword } = require('../services/passwordService');
const { issueToken } = require('../services/authTokenService');
const app = require('../server');

function loadMarketKeyFromEnvFile() {
  if (process.env.DATA_GOV_IN_API_KEY && process.env.DATA_GOV_IN_API_KEY.trim()) return;
  const envPath = path.resolve(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return;
  const line = fs.readFileSync(envPath, 'utf8').split(/\r?\n/).find(item => /^\s*DATA_GOV_IN_API_KEY\s*=/.test(item));
  if (!line) return;
  const value = line.slice(line.indexOf('=') + 1).trim().replace(/^(['"])(.*)\1$/, '$2');
  if (value) process.env.DATA_GOV_IN_API_KEY = value;
}
function isPlaceholder(value) {
  return !value || /your[_ -]?key|replace|example|<.*>/i.test(value);
}

function request(server, method, route, token) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port: server.address().port, method, path: route, headers: { authorization: `Bearer ${token}` } }, res => {
      let body = ''; res.on('data', chunk => body += chunk);
      res.on('end', () => { try { resolve({ status: res.statusCode, body: JSON.parse(body) }); } catch (e) { reject(e); } });
    });
    req.on('error', reject); req.end();
  });
}

function farmSnapshot(doc) {
  return {
    name: doc.name, location: doc.location, crop: doc.crop, marketContext: doc.marketContext,
    soil: doc.soil, weather: doc.weather, diseaseContext: doc.diseaseContext,
    fieldConditions: doc.fieldConditions
  };
}

async function run() {
  loadMarketKeyFromEnvFile();
  const liveGate = process.env.MILESTONE20_GOVERNMENT_API_STATUS === 'OPERATIONAL';
  if (!liveGate) {
    console.log('BLOCKED / NOT RUN: data.gov.in is reported unavailable for this milestone. No Government API request was made. Re-run only after the portal is operational.');
    process.exitCode = 2;
    return;
  }
  if (isPlaceholder(process.env.DATA_GOV_IN_API_KEY && process.env.DATA_GOV_IN_API_KEY.trim())) {
    console.log('BLOCKED / NOT RUN: DATA_GOV_IN_API_KEY is missing or still a placeholder. No provider request was made; local fallback was not used.');
    process.exitCode = 2;
    return;
  }

  let server;
  let connected = false;
  let temporaryFarm = null;
  let temporaryUser = null;
  let token = null;
  let farmCountBefore;
  let userCountBefore;
  try {
    connected = await connectDB();
    assert(connected, 'MongoDB Atlas connection unavailable');
    farmCountBefore = await Farm.countDocuments();
    userCountBefore = await User.countDocuments();
    temporaryUser = await User.create({ name: 'Live Market Test User', email: `live-market-${Date.now()}@example.test`, passwordHash: await hashPassword(`fixture-${Date.now()}`) });
    token = issueToken(temporaryUser._id);
    temporaryFarm = await Farm.create({
        ownerId: temporaryUser._id,
        name: `M20 live market verification ${Date.now()}`,
        location: { state: 'Karnataka', district: 'Kolar' },
        soil: { nitrogen: 80, phosphorus: 40, potassium: 40, ph: 6.5 },
        crop: { name: 'Tomato', growthStage: 'vegetative' },
        fieldConditions: { soilMoisture: 25 },
        weather: { temperature: 26, humidity: 65, rainfall: 2, recentRainfall: 6, rainProbability: 20, expectedRainfall: 3 },
        diseaseContext: { detected: false },
        marketContext: { market: 'Kolar', state: 'Karnataka', district: 'Kolar' }
      });
    const farm = temporaryFarm;
    const farmId = farm._id.toString();
    const before = farmSnapshot(farm.toObject());
    server = app.listen(0);

    const market = await request(server, 'GET', `/api/farms/${farmId}/market`, token);
    assert.equal(market.status, 200, market.body.error && market.body.error.message);
    const result = market.body.recommendation;
    assert(result && result.status === 'SUCCESS' && result.data_available, 'Government API returned no usable market records');
    assert.equal(result.raw_source, 'data.gov.in (live)', 'Market result is not explicitly identified as live Government data');
    assert(Number.isFinite(result.current_price) && result.current_price >= 0, 'Invalid normalized current price');
    assert(result.price_range && Number.isFinite(result.price_range.min_price) && Number.isFinite(result.price_range.max_price) && Number.isFinite(result.price_range.modal_price), 'Missing normalized price fields');
    assert(result.price_range.min_price <= result.price_range.modal_price && result.price_range.modal_price <= result.price_range.max_price, 'Invalid price bounds');
    assert.equal(result.price_range.unit, 'INR/Quintal', 'Unexpected price unit');

    const shared = await request(server, 'GET', `/api/farms/${farmId}/shared-state`, token);
    assert.equal(shared.status, 200);
    assert.deepStrictEqual(shared.body.sharedFarmState.marketContext, before.marketContext, 'Shared state market context differs from persisted Farm lookup context');

    const ranking = await request(server, 'GET', `/api/farms/${farmId}/crop-ranking`, token);
    assert.equal(ranking.status, 200, ranking.body.error && ranking.body.error.message);
    const ranked = ranking.body.recommendation && ranking.body.recommendation.ranked_crops;
    assert(Array.isArray(ranked) && ranked.length, 'Crop Ranking returned no ranked candidates');
    assert(ranked.some(item => item.market_data_available && Number.isFinite(item.market_signal)), 'Ranking did not consume available market data');

    const evaluation = await request(server, 'GET', `/api/farms/${farmId}/evaluation`, token);
    assert.equal(evaluation.status, 200, evaluation.body.error && evaluation.body.error.message);
    assert(evaluation.body.recommendations && evaluation.body.recommendations.market && evaluation.body.recommendations.cropRanking, 'Composite Evaluation omitted market or ranking components');
    assert.equal(evaluation.body.farmContext.marketContext.market, before.marketContext.market);

    const after = await Farm.findById(farmId).lean();
    assert.deepStrictEqual(farmSnapshot(after), before, 'Read-only market flow changed Farm data');
    assert.equal(await Farm.countDocuments(), farmCountBefore + (temporaryFarm ? 1 : 0), 'Farm count changed unexpectedly during live verification');
    console.log('PASS: live data.gov.in response normalized through Market Engine; local fallback not used.');
    console.log(`Source: ${result.raw_source}; commodity=${result.crop}; market=${result.market}; price=${result.current_price} ${result.price_range.unit}; date=${result.latest_date}; records=${result.history_points}.`);
    console.log('PASS: Shared Farm State, Crop Ranking, Composite Evaluation, Atlas Farm isolation, and Farm count.');
  } catch (error) {
    console.error(`FAIL: live Atlas market verification failed: ${error.message}`);
    process.exitCode = 1;
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    if (temporaryFarm) await Farm.deleteOne({ _id: temporaryFarm._id });
    if (temporaryUser) await User.deleteOne({ _id: temporaryUser._id });
    if (connected && farmCountBefore !== undefined) {
      const finalFarmCount = await Farm.countDocuments();
      if (finalFarmCount !== farmCountBefore) {
        console.error(`FAIL: Atlas Farm count was not restored after verification (before=${farmCountBefore}, after=${finalFarmCount}).`);
        process.exitCode = 1;
      }
      const finalUserCount = await User.countDocuments();
      if (finalUserCount !== userCountBefore) {
        console.error(`FAIL: Atlas User count was not restored after verification (before=${userCountBefore}, after=${finalUserCount}).`);
        process.exitCode = 1;
      }
    }
    if (connected) await disconnectDB();
  }
}

run().catch(error => { console.error(`FAIL: live Atlas market verification failed: ${error.message}`); process.exitCode = 1; });
