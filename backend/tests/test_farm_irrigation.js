/**
 * AgriSense — Shared Farm State ↔ Irrigation Recommendation Integration Suite (Milestone 18E).
 *
 * Verifies:
 * 1. End-to-end integration: Farm ID -> Shared Farm State -> Irrigation Service -> Rule Engine -> Advisory.
 * 2. Exact feature mapping integrity (crop, growth_stage, soil_moisture, temperature, humidity, rain_probability, expected_rainfall).
 * 3. Low soil moisture + high environmental demand scenario (Urgency: High).
 * 4. Adequate soil moisture scenario (Urgency: Low, Irrigation Required: false).
 * 5. Impending rain scenario (rain_probability 85%, expected_rainfall 15mm => Irrigation Required: false).
 * 6. Validation error on missing soil moisture (INSUFFICIENT_FARM_DATA, no defaults).
 * 7. Validation error on missing crop name.
 * 8. Validation error on missing weather expected rainfall.
 * 9. Malformed farm ID error handling (INVALID_FARM_ID).
 * 10. Non-existent farm ID error handling (FARM_NOT_FOUND).
 * 11. Live MongoDB Atlas connection & engine execution verification.
 * 12. Express HTTP REST endpoint GET /api/farms/:farmId/irrigation.
 * 13. Coexistence and non-regression of direct POST /api/ai/irrigation endpoint.
 */

const http = require('http');
const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const app = require('../server');
const farmService = require('../services/farmService');
const sharedFarmStateService = require('../services/sharedFarmStateService');
const farmIrrigationService = require('../services/farmIrrigationService');
const aiService = require('../services/aiService');
const { connectDB, disconnectDB } = require('../config/db');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

function makeHttpRequest(server, method, reqPath, body = null) {
  return new Promise((resolve, reject) => {
    const address = server.address();
    const port = address.port;
    const bodyStr = body ? JSON.stringify(body) : null;

    const options = {
      hostname: '127.0.0.1',
      port: port,
      path: reqPath,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {})
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, body: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, rawBody: data });
        }
      });
    });

    req.on('error', (err) => { reject(err); });

    if (bodyStr) {
      req.write(bodyStr);
    }
    req.end();
  });
}

async function runSuite() {
  console.log('='.repeat(80));
  console.log('AGRISENSE — FARM ↔ IRRIGATION RECOMMENDATION INTEGRATION SUITE (MILESTONE 18E)');
  console.log('='.repeat(80));

  const isAtlasConnected = await connectDB();
  console.log(`[Database Connection] Status: ${isAtlasConnected ? 'CONNECTED TO ATLAS' : 'MEMORY FALLBACK ACTIVE'}`);

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  let validFarm = null;

  try {
    // --- Test 1: Valid Farm -> Irrigation Pipeline ---
    try {
      const farmPayload = {
        name: 'Irrigation Test Farm 18E',
        location: { state: 'Karnataka', district: 'Kolar', village: 'Mulbagal' },
        crop: { name: 'Tomato', growthStage: 'Flowering' },
        fieldConditions: { soilMoisture: 25.0 },
        weather: { temperature: 28.0, humidity: 55.0, rainProbability: 20.0, expectedRainfall: 0.0 }
      };

      validFarm = await farmService.createFarm(farmPayload);
      const farmId = validFarm._id.toString();

      const result = await farmIrrigationService.getIrrigationRecommendation(farmId);

      assert(result.success === true, 'Response missing success: true');
      assert(result.farmId === farmId, `farmId mismatch: expected ${farmId}, got ${result.farmId}`);
      assert(result.recommendation, 'Result missing recommendation object');
      assert(result.recommendation.irrigation_required === true, 'Expected irrigation_required: true');
      assert(result.recommendation.urgency === 'medium', `Expected urgency 'medium', got '${result.recommendation.urgency}'`);
      assert(typeof result.recommendation.reason === 'string', 'reason is not a string');

      console.log(`  [PASS] Test 1: Valid Farm -> Shared Farm State -> Irrigation Engine (Required: ${result.recommendation.irrigation_required}, Urgency: ${result.recommendation.urgency}).`);
      passed++;
    } catch (e) {
      console.log(`  [FAIL] Test 1: ${e.message}`);
      failed++;
    }

    // --- Test 2: Verify Exact Model Input Mapping ---
    try {
      assert(validFarm !== null, 'Prerequisite farm not created');
      const farmId = validFarm._id.toString();
      const sharedState = await sharedFarmStateService.getSharedFarmState(farmId);
      const mappedInput = farmIrrigationService.extractIrrigationInput(sharedState);

      assert(mappedInput.crop === 'Tomato', `crop mapping failed: expected Tomato, got ${mappedInput.crop}`);
      assert(mappedInput.growth_stage === 'Flowering', `growth_stage mapping failed: expected Flowering, got ${mappedInput.growth_stage}`);
      assert(mappedInput.soil_moisture === 25.0, `soil_moisture mapping failed: expected 25.0, got ${mappedInput.soil_moisture}`);
      assert(mappedInput.temperature === 28.0, `temperature mapping failed: expected 28.0, got ${mappedInput.temperature}`);
      assert(mappedInput.humidity === 55.0, `humidity mapping failed: expected 55.0, got ${mappedInput.humidity}`);
      assert(mappedInput.rain_probability === 20.0, `rain_probability mapping failed: expected 20.0, got ${mappedInput.rain_probability}`);
      assert(mappedInput.expected_rainfall === 0.0, `expected_rainfall mapping failed: expected 0.0, got ${mappedInput.expected_rainfall}`);

      console.log('  [PASS] Test 2: Exact irrigation input feature mapping verified [crop, growth_stage, soil_moisture, temperature, humidity, rain_probability, expected_rainfall].');
      passed++;
    } catch (e) {
      console.log(`  [FAIL] Test 2: ${e.message}`);
      failed++;
    }

    // --- Test 3: Low Soil Moisture + High Environmental Demand Scenario (Urgency: High) ---
    try {
      const highDemandFarm = await farmService.createFarm({
        name: 'High Demand Wheat Farm',
        location: { state: 'Punjab', district: 'Ludhiana' },
        crop: { name: 'Wheat', growthStage: 'Booting' },
        fieldConditions: { soilMoisture: 20.0 },
        weather: { temperature: 38.0, humidity: 30.0, rainProbability: 0.0, expectedRainfall: 0.0 }
      });
      const highDemandId = highDemandFarm._id.toString();

      const result = await farmIrrigationService.getIrrigationRecommendation(highDemandId);
      await farmService.deleteFarm(highDemandId);

      assert(result.recommendation.irrigation_required === true, 'Expected irrigation_required: true');
      assert(result.recommendation.urgency === 'high', `Expected urgency 'high', got '${result.recommendation.urgency}'`);

      console.log('  [PASS] Test 3: Low soil moisture + high environmental demand correctly evaluated (Urgency: High).');
      passed++;
    } catch (e) {
      console.log(`  [FAIL] Test 3: ${e.message}`);
      failed++;
    }

    // --- Test 4: Adequate Soil Moisture Scenario ---
    try {
      const adequateFarm = await farmService.createFarm({
        name: 'Adequate Moisture Potato Farm',
        location: { state: 'Uttar Pradesh', district: 'Agra' },
        crop: { name: 'Potato', growthStage: 'Tuber Initiation' },
        fieldConditions: { soilMoisture: 50.0 },
        weather: { temperature: 22.0, humidity: 65.0, rainProbability: 10.0, expectedRainfall: 0.0 }
      });
      const adequateId = adequateFarm._id.toString();

      const result = await farmIrrigationService.getIrrigationRecommendation(adequateId);
      await farmService.deleteFarm(adequateId);

      assert(result.recommendation.irrigation_required === false, 'Expected irrigation_required: false');
      assert(result.recommendation.urgency === 'low', `Expected urgency 'low', got '${result.recommendation.urgency}'`);

      console.log('  [PASS] Test 4: Adequate soil moisture correctly evaluated (Irrigation Required: False, Urgency: Low).');
      passed++;
    } catch (e) {
      console.log(`  [FAIL] Test 4: ${e.message}`);
      failed++;
    }

    // --- Test 5: Rain-related Scenario (Substantial Expected Rain Inhibits Irrigation) ---
    try {
      const rainFarm = await farmService.createFarm({
        name: 'Rain Impending Corn Farm',
        location: { state: 'Bihar', district: 'Muzaffarpur' },
        crop: { name: 'Corn (maize)', growthStage: 'Vegetative' },
        fieldConditions: { soilMoisture: 28.0 },
        weather: { temperature: 25.0, humidity: 80.0, rainProbability: 85.0, expectedRainfall: 15.0, recentRainfall: 50.0 }
      });
      const rainId = rainFarm._id.toString();

      const result = await farmIrrigationService.getIrrigationRecommendation(rainId);
      await farmService.deleteFarm(rainId);

      assert(result.engineInput.rain_probability === 85.0, 'rain_probability mismatch');
      assert(result.engineInput.expected_rainfall === 15.0, 'expected_rainfall mismatch');
      assert(result.recommendation.irrigation_required === false, 'Expected irrigation_required: false when rain expected');
      assert(result.recommendation.reason.includes('rain'), 'Reason does not mention expected rain');

      console.log('  [PASS] Test 5: Substantial expected rainfall correctly reaching engine and delaying irrigation.');
      passed++;
    } catch (e) {
      console.log(`  [FAIL] Test 5: ${e.message}`);
      failed++;
    }

    // --- Test 6: Missing Soil Moisture ---
    try {
      const incompleteFarm = await farmService.createFarm({
        name: 'Missing Moisture Farm',
        location: { state: 'Haryana', district: 'Karnal' },
        crop: { name: 'Tomato', growthStage: 'Flowering' },
        weather: { temperature: 28.0, humidity: 55.0, rainProbability: 0.0, expectedRainfall: 0.0 }
      });
      const incompleteId = incompleteFarm._id.toString();

      let caughtErr = null;
      try {
        await farmIrrigationService.getIrrigationRecommendation(incompleteId);
      } catch (err) {
        caughtErr = err;
      }

      await farmService.deleteFarm(incompleteId);

      assert(caughtErr !== null, 'Expected validation error for missing soil moisture');
      assert(caughtErr.code === 'INSUFFICIENT_FARM_DATA', `Expected INSUFFICIENT_FARM_DATA, got ${caughtErr.code}`);
      assert(caughtErr.missingFields && caughtErr.missingFields.includes('soil_moisture'), 'missingFields missing soil_moisture');

      console.log('  [PASS] Test 6: Missing fieldConditions.soilMoisture correctly rejected with INSUFFICIENT_FARM_DATA.');
      passed++;
    } catch (e) {
      console.log(`  [FAIL] Test 6: ${e.message}`);
      failed++;
    }

    // --- Test 7: Missing Crop Name ---
    try {
      const incompleteFarm = await farmService.createFarm({
        name: 'Missing Crop Name Farm',
        location: { state: 'Tamil Nadu', district: 'Salem' },
        fieldConditions: { soilMoisture: 30.0 },
        weather: { temperature: 30.0, humidity: 60.0, rainProbability: 0.0, expectedRainfall: 0.0 }
      });
      const incompleteId = incompleteFarm._id.toString();

      let caughtErr = null;
      try {
        await farmIrrigationService.getIrrigationRecommendation(incompleteId);
      } catch (err) {
        caughtErr = err;
      }

      await farmService.deleteFarm(incompleteId);

      assert(caughtErr !== null, 'Expected validation error for missing crop');
      assert(caughtErr.code === 'INSUFFICIENT_FARM_DATA', `Expected INSUFFICIENT_FARM_DATA, got ${caughtErr.code}`);

      console.log('  [PASS] Test 7: Missing crop name correctly rejected with INSUFFICIENT_FARM_DATA.');
      passed++;
    } catch (e) {
      console.log(`  [FAIL] Test 7: ${e.message}`);
      failed++;
    }

    // --- Test 8: Missing Weather Input ---
    try {
      const incompleteFarm = await farmService.createFarm({
        name: 'Missing Weather Farm',
        location: { state: 'Maharashtra', district: 'Pune' },
        crop: { name: 'Sugarcane', growthStage: 'Vegetative' },
        fieldConditions: { soilMoisture: 35.0 },
        weather: { temperature: 28.0, humidity: 55.0 } // Missing rainProbability & expectedRainfall
      });
      const incompleteId = incompleteFarm._id.toString();

      let caughtErr = null;
      try {
        await farmIrrigationService.getIrrigationRecommendation(incompleteId);
      } catch (err) {
        caughtErr = err;
      }

      await farmService.deleteFarm(incompleteId);

      assert(caughtErr !== null, 'Expected validation error for missing weather parameters');
      assert(caughtErr.code === 'INSUFFICIENT_FARM_DATA', `Expected INSUFFICIENT_FARM_DATA, got ${caughtErr.code}`);

      console.log('  [PASS] Test 8: Missing weather parameters correctly rejected with INSUFFICIENT_FARM_DATA.');
      passed++;
    } catch (e) {
      console.log(`  [FAIL] Test 8: ${e.message}`);
      failed++;
    }

    // --- Test 9: Invalid Farm ID ---
    try {
      const invalidId = 'malformed-farm-id-999';
      let caughtErr = null;
      try {
        await farmIrrigationService.getIrrigationRecommendation(invalidId);
      } catch (err) {
        caughtErr = err;
      }

      assert(caughtErr !== null, 'Expected error for malformed farmId');
      assert(caughtErr.code === 'INVALID_FARM_ID', `Expected INVALID_FARM_ID, got ${caughtErr.code}`);

      console.log('  [PASS] Test 9: Malformed farmId correctly threw INVALID_FARM_ID.');
      passed++;
    } catch (e) {
      console.log(`  [FAIL] Test 9: ${e.message}`);
      failed++;
    }

    // --- Test 10: Farm Not Found ---
    try {
      const nonExistentId = new mongoose.Types.ObjectId().toString();
      let caughtErr = null;
      try {
        await farmIrrigationService.getIrrigationRecommendation(nonExistentId);
      } catch (err) {
        caughtErr = err;
      }

      assert(caughtErr !== null, 'Expected error for non-existent farmId');
      assert(caughtErr.code === 'FARM_NOT_FOUND', `Expected FARM_NOT_FOUND, got ${caughtErr.code}`);

      console.log('  [PASS] Test 10: Non-existent farmId correctly threw FARM_NOT_FOUND.');
      passed++;
    } catch (e) {
      console.log(`  [FAIL] Test 10: ${e.message}`);
      failed++;
    }

    // --- Test 11: Real Atlas Integration ---
    if (isAtlasConnected) {
      try {
        const atlasFarmData = {
          name: 'Real Atlas Irrigation Farm 18E',
          location: { state: 'Telangana', district: 'Warangal', village: 'Ghanpur' },
          crop: { name: 'Cotton', growthStage: 'Vegetative' },
          fieldConditions: { soilMoisture: 22.0 },
          weather: { temperature: 36.0, humidity: 45.0, rainProbability: 10.0, expectedRainfall: 0.0 }
        };

        const atlasFarm = await farmService.createFarm(atlasFarmData);
        const atlasFarmId = atlasFarm._id.toString();

        const atlasResult = await farmIrrigationService.getIrrigationRecommendation(atlasFarmId);

        assert(atlasResult.success === true, 'Atlas request failed');
        assert(atlasResult.recommendation.irrigation_required === true, 'Atlas expected irrigation_required: true');

        await farmService.deleteFarm(atlasFarmId);

        console.log(`  [PASS] Test 11 (REAL ATLAS): Real Atlas Farm -> Shared Farm State -> Irrigation Engine executed successfully (Irrigation Required: ${atlasResult.recommendation.irrigation_required}).`);
        passed++;
      } catch (e) {
        console.log(`  [FAIL] Test 11 (REAL ATLAS): ${e.message}`);
        failed++;
      }
    } else {
      console.log('  [SKIP] Test 11 (REAL ATLAS): Skipped live Atlas test (database operating in memory fallback).');
    }

    // --- Test 12: HTTP REST Endpoint GET /api/farms/:farmId/irrigation ---
    try {
      assert(validFarm !== null, 'Prerequisite farm not created');
      const farmId = validFarm._id.toString();

      const res = await makeHttpRequest(server, 'GET', `/api/farms/${farmId}/irrigation`);

      assert(res.status === 200, `Expected HTTP 200, got ${res.status}`);
      assert(res.body.success === true, 'HTTP response missing success: true');
      assert(res.body.farmId === farmId, `HTTP response farmId mismatch: expected ${farmId}, got ${res.body.farmId}`);
      assert(res.body.recommendation.irrigation_required === true, 'HTTP response expected irrigation_required: true');

      console.log(`  [PASS] Test 12: HTTP GET /api/farms/${farmId}/irrigation verified.`);
      passed++;
    } catch (e) {
      console.log(`  [FAIL] Test 12: ${e.message}`);
      failed++;
    }

    // --- Test 13: Direct Endpoint Coexistence (POST /api/ai/irrigation) ---
    try {
      const directRes = await makeHttpRequest(server, 'POST', '/api/ai/irrigation', {
        crop: 'Tomato',
        growth_stage: 'Flowering',
        soil_moisture: 25.0,
        temperature: 28.0,
        humidity: 55.0,
        rain_probability: 20.0,
        expected_rainfall: 0.0
      });

      assert(directRes.status === 200, `Expected HTTP status 200, got ${directRes.status}`);
      assert(directRes.body.success === true, 'Direct endpoint missing success: true');
      assert(directRes.body.result.irrigation_required === true, 'Direct endpoint expected irrigation_required: true');

      console.log('  [PASS] Test 13: Direct endpoint POST /api/ai/irrigation continues to function unchanged.');
      passed++;
    } catch (e) {
      console.log(`  [FAIL] Test 13: ${e.message}`);
      failed++;
    }

    // Cleanup
    if (validFarm && validFarm._id) {
      try {
        await farmService.deleteFarm(validFarm._id.toString());
      } catch (e) {}
    }

  } finally {
    server.close();
    await disconnectDB();
  }

  console.log('\n' + '='.repeat(80));
  console.log(`FARM IRRIGATION INTEGRATION SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('='.repeat(80));

  if (failed > 0) {
    process.exit(1);
  }
}

if (require.main === module) {
  runSuite().catch((err) => {
    console.error('Fatal suite error:', err);
    process.exit(1);
  });
}

module.exports = runSuite;
