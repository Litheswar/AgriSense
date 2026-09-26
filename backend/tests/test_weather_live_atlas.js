/** Live, intentionally mutating verification. Uses a stored Atlas Farm location and persists one weather refresh. */
const assert = require('assert');
const http = require('http');
const Farm = require('../db/models/Farm');
const app = require('../server');
const { connectDB, disconnectDB } = require('../config/db');

function request(server, method, path) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port: server.address().port, method, path }, res => {
      let body = ''; res.on('data', chunk => body += chunk); res.on('end', () => { try { resolve({ status: res.statusCode, body: JSON.parse(body) }); } catch (e) { reject(e); } });
    }); req.on('error', reject); req.end();
  });
}
async function run() {
  let server;
  try {
    assert(await connectDB(), 'MongoDB Atlas connection unavailable');
    const farm = await Farm.findOne({ 'location.latitude': { $type: 'number', $gte: -90, $lte: 90 }, 'location.longitude': { $type: 'number', $gte: -180, $lte: 180 }, 'crop.name': { $type: 'string' }, 'crop.growthStage': { $type: 'string' }, 'fieldConditions.soilMoisture': { $type: 'number' } });
    assert(farm, 'No existing Atlas Farm has coordinates and the crop/field data required for both downstream engines');
    const farmId = farm._id.toString(); const before = farm.toObject();
    server = app.listen(0);
    const refresh = await request(server, 'POST', `/api/farms/${farmId}/weather/refresh`);
    assert.equal(refresh.status, 200, JSON.stringify(refresh.body.error));
    assert.equal(refresh.body.weather.source, 'open-meteo');
    for (const key of ['temperature', 'humidity', 'rainfall', 'recentRainfall', 'rainProbability', 'expectedRainfall', 'recordedAt']) assert.notEqual(refresh.body.weather[key], null, `missing ${key}`);
    assert.equal(refresh.body.sharedFarmState.weather.source, 'open-meteo');
    const after = await Farm.findById(farmId).lean();
    for (const key of ['name', 'location', 'soil', 'crop', 'fieldConditions', 'diseaseContext', 'marketContext']) assert.deepStrictEqual(after[key], before[key], `${key} changed`);
    const read = await request(server, 'GET', `/api/farms/${farmId}/weather`); assert.equal(read.status, 200); assert.equal(read.body.weather.source, 'open-meteo');
    const state = await request(server, 'GET', `/api/farms/${farmId}/shared-state`); assert.equal(state.status, 200); assert.equal(state.body.sharedFarmState.weather.source, 'open-meteo');
    const irrigation = await request(server, 'GET', `/api/farms/${farmId}/irrigation`); assert.equal(irrigation.status, 200, JSON.stringify(irrigation.body.error)); assert.equal(irrigation.body.engineInput.temperature, refresh.body.weather.temperature); assert.equal(irrigation.body.engineInput.expected_rainfall, refresh.body.weather.expectedRainfall);
    const disease = await request(server, 'GET', `/api/farms/${farmId}/disease-risk`); assert.equal(disease.status, 200, JSON.stringify(disease.body.error)); assert.equal(disease.body.engineInput.temperature, refresh.body.weather.temperature); assert.equal(disease.body.engineInput.recent_rainfall, refresh.body.weather.recentRainfall);
    console.log('LIVE ATLAS + OPEN-METEO: PASS');
    console.log('Provider: Open-Meteo; persisted one Farm.weather refresh; unrelated Farm fields unchanged.');
    console.log(`Weather (C, %, mm): temperature=${refresh.body.weather.temperature}, humidity=${refresh.body.weather.humidity}, currentRain=${refresh.body.weather.rainfall}, recent24h=${refresh.body.weather.recentRainfall}, next24h=${refresh.body.weather.expectedRainfall}, maxHourlyRainProbability=${refresh.body.weather.rainProbability}`);
    console.log('Read-back: weather endpoint and Shared Farm State PASS; irrigation PASS; disease risk PASS.');
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    await disconnectDB();
  }
}
run().catch(error => { console.error(`LIVE VERIFICATION FAILED: ${error.message}`); process.exitCode = 1; });
