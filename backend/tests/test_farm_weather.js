const assert = require('assert');
const farmService = require('../services/farmService');
const { FarmWeatherService } = require('../services/farmWeatherService');
const weather = require('../services/weatherService');
const irrigation = require('../services/farmIrrigationService');
const disease = require('../services/farmDiseaseRiskService');

async function run() {
  const oldMode = farmService.isMemoryMode; farmService.setMemoryMode(true); farmService.clearMemoryStore();
  try {
    const farm = await farmService.createFarm({ name: 'Weather integration test', location: { state: 'Karnataka', district: 'Kolar', latitude: 12.9, longitude: 77.5 }, soil: { nitrogen: 81 }, crop: { name: 'Tomato', growthStage: 'vegetative' }, fieldConditions: { soilMoisture: 25 }, weather: { temperature: 20 }, diseaseContext: { detected: true, disease: 'Test disease' }, marketContext: { market: 'Kolar' } });
    const before = farm.toObject(); let calls = 0;
    const svc = new FarmWeatherService({ getWeather: async (lat, lon) => { calls++; assert.equal(lat, 12.9); assert.equal(lon, 77.5); return { temperature: 28, humidity: 71, rainfall: 1, recentRainfall: 6, rainProbability: 45, expectedRainfall: 4, recordedAt: new Date(), fetchedAt: new Date(), source: 'open-meteo' }; } });
    const refreshed = await svc.refreshWeather(farm._id.toString()); assert.equal(calls, 1); assert.equal(refreshed.sharedFarmState.weather.temperature, 28); assert.equal(refreshed.sharedFarmState.weather.source, 'open-meteo');
    const after = farm.toObject(); for (const key of ['name', 'location', 'soil', 'crop', 'fieldConditions', 'diseaseContext', 'marketContext']) assert.deepStrictEqual(after[key], before[key], `${key} changed during weather refresh`);
    const inputIrrigation = irrigation.extractIrrigationInput(refreshed.sharedFarmState); assert.equal(inputIrrigation.temperature, 28); assert.equal(inputIrrigation.expected_rainfall, 4);
    const inputDisease = disease.extractDiseaseRiskInput(refreshed.sharedFarmState); assert.equal(inputDisease.recent_rainfall, 6); assert.equal(inputDisease.rainfall, 1);
    await assert.rejects(() => svc.refreshWeather('not-an-id'), e => e.code === 'INVALID_FARM_ID');
    const noLocation = await farmService.createFarm({ name: 'No coordinates', location: { state: 'Karnataka', district: 'Kolar' } });
    await assert.rejects(() => weather.getWeather(noLocation.location.latitude, noLocation.location.longitude), e => e.code === 'INSUFFICIENT_LOCATION_DATA');
    console.log('farm weather integration: 6 checks passed');
  } finally { farmService.clearMemoryStore(); farmService.setMemoryMode(oldMode); }
}
run().catch(e => { console.error(e); process.exitCode = 1; });
