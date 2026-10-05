const assert = require('node:assert/strict');
const farmService = require('../services/farmService');
const farmController = require('../controllers/farmController');
const farmWeatherService = require('../services/farmWeatherService');
const farmCropRecommendationService = require('../services/farmCropRecommendationService');
const aiService = require('../services/aiService');
const Farm = require('../db/models/Farm');

const ownerId = '000000000000000000000001';
const providerWeather = () => ({
  temperature: 29.4, humidity: 72, rainfall: 0,
  recentRainfall: 1.2, rainProbability: 35, expectedRainfall: 2.4,
  recordedAt: new Date('2026-10-05T08:00:00Z'), fetchedAt: new Date('2026-10-05T08:01:00Z'), source: 'open-meteo'
});
function response() {
  return {
    statusCode: 200, body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}
async function createFarm(body) {
  const res = response();
  await farmController.createFarm({ body, user: { id: ownerId } }, res);
  return res;
}

async function run() {
  const wasMemoryMode = farmService.isMemoryMode;
  const previousProvider = farmWeatherService.provider;
  const previousPredictCrop = aiService.predictCrop;
  const previousExtract = farmCropRecommendationService.extractCropModelInput;
  farmService.setMemoryMode(true);
  farmService.clearMemoryStore();
  let providerCalls = 0;
  try {
    const manualWeather = await createFarm({
      name: 'Client weather must be rejected',
      location: { state: 'Tamil Nadu', district: 'Salem' },
      weather: { temperature: 999, humidity: 0, rainfall: 0 }
    });
    assert.equal(manualWeather.statusCode, 400);
    assert.equal(manualWeather.body.error.code, 'WEATHER_IS_PROVIDER_MANAGED');

    const partialCoordinates = new Farm({
      ownerId, name: 'Partial coordinate farm',
      location: { state: 'Tamil Nadu', district: 'Salem', latitude: 12.9 }
    });
    await assert.rejects(() => partialCoordinates.validate(), error => error.name === 'ValidationError' && Boolean(error.errors['location.longitude']));

    farmWeatherService.provider = { getWeather: async (latitude, longitude) => {
      providerCalls++;
      assert.equal(latitude, 12.9);
      assert.equal(longitude, -21);
      return providerWeather();
    } };

    const created = await createFarm({
      name: 'Weather source farm',
      location: { state: 'Tamil Nadu', district: 'Salem', latitude: 12.9, longitude: -21 },
      soil: { nitrogen: 12, phosphorus: 15, potassium: 25, ph: 8 }
    });
    assert.equal(created.statusCode, 201);
    assert.equal(created.body.weatherStatus, 'available');
    assert.equal(created.body.farm.weather.temperature, 29.4);
    assert.equal(created.body.farm.weather.humidity, 72);
    assert.equal(created.body.farm.weather.rainfall, 0);
    assert.equal(created.body.farm.weather.status, 'available');
    assert.equal(created.body.farm.weather.source, 'open-meteo');
    assert.equal(providerCalls, 1);

    const withoutCoordinates = await createFarm({ name: 'No coordinates', location: { state: 'Tamil Nadu', district: 'Salem' } });
    assert.equal(withoutCoordinates.statusCode, 201);
    assert.equal(withoutCoordinates.body.weatherStatus, 'unavailable');
    assert.equal(withoutCoordinates.body.farm.weather.temperature, null);
    assert.equal(providerCalls, 1, 'weather provider is not called when coordinates are absent');

    farmWeatherService.provider = { getWeather: async () => { throw Object.assign(new Error('temporary outage'), { code: 'WEATHER_PROVIDER_UNAVAILABLE' }); } };
    await assert.rejects(() => farmWeatherService.refreshWeather(created.body.farm._id), error => error.code === 'WEATHER_PROVIDER_UNAVAILABLE');
    const existingWeather = await farmWeatherService.getWeather(created.body.farm._id);
    assert.equal(existingWeather.weather.temperature, 29.4, 'failed refresh keeps the last successful weather snapshot');
    assert.equal(existingWeather.weather.status, 'available');
    assert.equal(existingWeather.weather.lastErrorCode, 'WEATHER_PROVIDER_UNAVAILABLE');

    farmWeatherService.provider = { getWeather: async (latitude, longitude) => {
      providerCalls++;
      assert.equal(latitude, 12.9);
      assert.equal(longitude, -21);
      return providerWeather();
    } };
    const legacy = withoutCoordinates.body.farm;
    const updateResponse = response();
    await farmController.updateFarm({
      params: { farmId: legacy._id },
      body: { location: { latitude: 12.9, longitude: -21 } },
      farm: await farmService.getFarmById(legacy._id)
    }, updateResponse);
    assert.equal(updateResponse.statusCode, 200);
    assert.equal(updateResponse.body.weatherStatus, 'available');
    assert.equal(updateResponse.body.farm.weather.temperature, 29.4);
    assert.equal(providerCalls, 2, 'adding coordinates on update triggers a weather fetch');

    const failedProvider = { getWeather: async () => { throw Object.assign(new Error('test provider offline'), { code: 'WEATHER_PROVIDER_UNAVAILABLE' }); } };
    farmWeatherService.provider = failedProvider;
    const unavailable = await createFarm({
      name: 'Weather unavailable farm',
      location: { state: 'Tamil Nadu', district: 'Salem', latitude: 12.9, longitude: -21 }
    });
    assert.equal(unavailable.statusCode, 201, 'provider failure does not prevent farm creation');
    assert.equal(unavailable.body.weatherStatus, 'unavailable');
    assert.equal(unavailable.body.weatherReasonCode, 'WEATHER_PROVIDER_UNAVAILABLE');
    assert.equal(unavailable.body.farm.weather.temperature, null);
    assert.equal(unavailable.body.farm.weather.rainfall, null);
    assert.equal(unavailable.body.farm.weather.lastErrorCode, 'WEATHER_PROVIDER_UNAVAILABLE');

    // Retry on Crop Recommendation obtains weather and forwards the unchanged 7-feature input.
    farmWeatherService.provider = { getWeather: async () => providerWeather() };
    const missingWeatherFarm = await farmService.createFarm({
      ownerId, name: 'Crop weather retry farm',
      location: { state: 'Tamil Nadu', district: 'Salem', latitude: 12.9, longitude: -21 },
      soil: { nitrogen: 12, phosphorus: 15, potassium: 25, ph: 8 }
    });
    const originalInput = farmCropRecommendationService.extractCropModelInput;
    const receivedInputs = [];
    farmCropRecommendationService.extractCropModelInput = function (state) {
      const input = originalInput.call(this, state);
      receivedInputs.push(input);
      return input;
    };
    aiService.predictCrop = async input => ({ result: { predicted_crop: 'Rice' } });
    const cropResponse = response();
    await farmController.getCropRecommendation({ params: { farmId: missingWeatherFarm._id.toString() }, farm: missingWeatherFarm }, cropResponse);
    assert.equal(cropResponse.statusCode, 200);
    assert.deepEqual(receivedInputs[0], { N: 12, P: 15, K: 25, temperature: 29.4, humidity: 72, ph: 8, rainfall: 0 });
    assert.equal(cropResponse.body.sharedFarmState.weather.source, 'open-meteo');

    farmWeatherService.provider = failedProvider;
    const unavailableCropFarm = await farmService.createFarm({
      ownerId, name: 'Crop weather unavailable farm',
      location: { state: 'Tamil Nadu', district: 'Salem', latitude: 12.9, longitude: -21 },
      soil: { nitrogen: 12, phosphorus: 15, potassium: 25, ph: 8 }
    });
    const unavailableCropResponse = response();
    await farmController.getCropRecommendation({ params: { farmId: unavailableCropFarm._id.toString() }, farm: unavailableCropFarm }, unavailableCropResponse);
    assert.equal(unavailableCropResponse.statusCode, 503);
    assert.equal(unavailableCropResponse.body.error.code, 'WEATHER_DATA_UNAVAILABLE');
    assert.equal(unavailableCropResponse.body.error.reasonCode, 'WEATHER_PROVIDER_UNAVAILABLE');

    console.log('farm weather end-to-end flow: passed');
  } finally {
    farmWeatherService.provider = previousProvider;
    aiService.predictCrop = previousPredictCrop;
    farmCropRecommendationService.extractCropModelInput = previousExtract;
    farmService.clearMemoryStore();
    farmService.setMemoryMode(wasMemoryMode);
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
