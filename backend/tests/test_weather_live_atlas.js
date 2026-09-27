/** Live, intentionally mutating verification. Uses a temporary owned Atlas Farm and persists one weather refresh. */
process.env.JWT_SECRET ||= 'test-only-secret-generated-for-agrisense-m21';
const assert = require('assert');
const http = require('http');
const Farm = require('../db/models/Farm');
const User = require('../db/models/User');
const { hashPassword } = require('../services/passwordService');
const { issueToken } = require('../services/authTokenService');
const app = require('../server');
const { connectDB, disconnectDB } = require('../config/db');

function request(server, method, path, token) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port: server.address().port, method, path, headers: { authorization: `Bearer ${token}` } }, res => {
      let body = ''; res.on('data', chunk => body += chunk); res.on('end', () => { try { resolve({ status: res.statusCode, body: JSON.parse(body) }); } catch (e) { reject(e); } });
    }); req.on('error', reject); req.end();
  });
}
async function run() {
  let server; let connected = false; let user; let farm; let token; let farmCount; let userCount;
  try {
    connected = await connectDB();
    assert(connected, 'MongoDB Atlas connection unavailable');
    farmCount = await Farm.countDocuments();
    userCount = await User.countDocuments();
    user = await User.create({ name: 'Weather Live Test User', email: `weather-live-${Date.now()}@example.test`, passwordHash: await hashPassword(`fixture-${Date.now()}`) });
    token = issueToken(user._id);
    farm = await Farm.create({
      ownerId: user._id,
      name: 'Temporary live weather verification farm',
      location: { state: 'Karnataka', district: 'Kolar', latitude: 12.9, longitude: 77.5 },
      soil: { nitrogen: 80, phosphorus: 40, potassium: 40, ph: 6.5 },
      crop: { name: 'Tomato', growthStage: 'vegetative' },
      fieldConditions: { soilMoisture: 25 },
      weather: { temperature: 24, humidity: 60, rainfall: 0, recentRainfall: 0, rainProbability: 0, expectedRainfall: 0 },
      diseaseContext: { detected: false }, marketContext: { market: 'Kolar', state: 'Karnataka', district: 'Kolar' }
    });
    const farmId = farm._id.toString(); const before = farm.toObject();
    server = app.listen(0);
    const refresh = await request(server, 'POST', `/api/farms/${farmId}/weather/refresh`, token);
    assert.equal(refresh.status, 200, JSON.stringify(refresh.body.error));
    assert.equal(refresh.body.weather.source, 'open-meteo');
    for (const key of ['temperature', 'humidity', 'rainfall', 'recentRainfall', 'rainProbability', 'expectedRainfall', 'recordedAt']) assert.notEqual(refresh.body.weather[key], null, `missing ${key}`);
    assert.equal(refresh.body.sharedFarmState.weather.source, 'open-meteo');
    const after = await Farm.findById(farmId).lean();
    for (const key of ['name', 'location', 'soil', 'crop', 'fieldConditions', 'diseaseContext', 'marketContext']) assert.deepStrictEqual(after[key], before[key], `${key} changed`);
    const read = await request(server, 'GET', `/api/farms/${farmId}/weather`, token); assert.equal(read.status, 200); assert.equal(read.body.weather.source, 'open-meteo');
    const state = await request(server, 'GET', `/api/farms/${farmId}/shared-state`, token); assert.equal(state.status, 200); assert.equal(state.body.sharedFarmState.weather.source, 'open-meteo');
    const irrigation = await request(server, 'GET', `/api/farms/${farmId}/irrigation`, token); assert.equal(irrigation.status, 200, JSON.stringify(irrigation.body.error)); assert.equal(irrigation.body.engineInput.temperature, refresh.body.weather.temperature); assert.equal(irrigation.body.engineInput.expected_rainfall, refresh.body.weather.expectedRainfall);
    const disease = await request(server, 'GET', `/api/farms/${farmId}/disease-risk`, token); assert.equal(disease.status, 200, JSON.stringify(disease.body.error)); assert.equal(disease.body.engineInput.temperature, refresh.body.weather.temperature); assert.equal(disease.body.engineInput.recent_rainfall, refresh.body.weather.recentRainfall);
    console.log('LIVE ATLAS + OPEN-METEO: PASS');
    console.log('Provider: Open-Meteo; persisted one Farm.weather refresh; unrelated Farm fields unchanged.');
    console.log(`Weather (C, %, mm): temperature=${refresh.body.weather.temperature}, humidity=${refresh.body.weather.humidity}, currentRain=${refresh.body.weather.rainfall}, recent24h=${refresh.body.weather.recentRainfall}, next24h=${refresh.body.weather.expectedRainfall}, maxHourlyRainProbability=${refresh.body.weather.rainProbability}`);
    console.log('Read-back: weather endpoint and Shared Farm State PASS; irrigation PASS; disease risk PASS.');
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    if (farm && user) await Farm.deleteOne({ _id: farm._id, ownerId: user._id });
    if (user) await User.deleteOne({ _id: user._id });
    if (connected) {
      const [farmsAfter, usersAfter] = await Promise.all([Farm.countDocuments(), User.countDocuments()]);
      await disconnectDB();
      assert.equal(farmsAfter, farmCount, 'Farm count changed during live weather verification');
      assert.equal(usersAfter, userCount, 'User count changed during live weather verification');
    }
  }
}
run().catch(error => { console.error(`LIVE VERIFICATION FAILED: ${error.message}`); process.exitCode = 1; });
