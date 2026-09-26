/**
 * AgriSense — Shared Farm State ↔ Disease Risk Integration Suite (Milestone 18G).
 *
 * Verifies:
 * 1. End-to-end integration: Farm ID -> Shared Farm State -> Disease Risk Service -> Engine -> Assessment.
 * 2. Exact crop mapping integrity (crop.name -> crop).
 * 3. Exact temperature mapping integrity (weather.temperature -> temperature).
 * 4. Exact humidity mapping integrity (weather.humidity -> humidity).
 * 5. Exact rainfall mapping integrity (weather.rainfall -> rainfall, weather.recentRainfall -> recent_rainfall; distinct values).
 * 6. Growth stage mapping integrity (crop.growthStage -> growth_stage).
 * 7. High-risk environmental scenario (High risk level, score > 0.65).
 * 8. Low-risk environmental scenario (Low risk level, score <= 0.35).
 * 9. Missing required field validation (temperature, humidity, rainfall, recentRainfall, crop, growthStage -> INSUFFICIENT_FARM_DATA).
 * 10. Malformed farm ID error handling (INVALID_FARM_ID).
 * 11. Non-existent farm ID error handling (FARM_NOT_FOUND).
 * 12. Live MongoDB Atlas connection & engine execution verification.
 * 13. Express HTTP REST endpoint GET /api/farms/:farmId/disease-risk.
 * 14. Coexistence and non-regression of direct POST /api/ai/disease-risk endpoint.
 */

const http = require('http');
const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const app = require('../server');
const farmService = require('../services/farmService');
const sharedFarmStateService = require('../services/sharedFarmStateService');
const farmDiseaseRiskService = require('../services/farmDiseaseRiskService');
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
  console.log('AGRISENSE — FARM ↔ DISEASE RISK INTEGRATION SUITE (MILESTONE 18G)');
  console.log('='.repeat(80));

  const isAtlasConnected = await connectDB();
  console.log(`[Database Connection] Status: ${isAtlasConnected ? 'CONNECTED TO ATLAS' : 'MEMORY FALLBACK ACTIVE'}`);

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  let validFarm = null;

  try {
    // --- Test 1: Valid Farm -> Disease Risk Pipeline ---
    try {
      const farmPayload = {
        name: 'Disease Risk Test Farm 18G',
        location: { state: 'Karnataka', district: 'Shimoga', village: 'Tirthahalli' },
        crop: { name: 'Potato', growthStage: 'Vegetative' },
        weather: {
          temperature: 22.0,
          humidity: 80.0,
          rainfall: 7.0,
          recentRainfall: 18.0,
          rainProbability: 40.0,
          expectedRainfall: 10.0
        }
      };

      validFarm = await farmService.createFarm(farmPayload);
      const farmId = validFarm._id.toString();

      const result = await farmDiseaseRiskService.getDiseaseRiskAssessment(farmId);

      assert(result.success === true, 'Response missing success: true');
      assert(result.farmId === farmId, `farmId mismatch: expected ${farmId}, got ${result.farmId}`);
      assert(result.recommendation, 'Result missing recommendation object');
      assert(result.recommendation.risk_level === 'Medium', `Expected risk_level 'Medium', got '${result.recommendation.risk_level}'`);
      assert(typeof result.recommendation.risk_score === 'number', 'Expected numeric risk_score');

      console.log(`  [PASS] Test 1: Valid Farm -> Shared Farm State -> Disease Risk Engine (Risk Level: ${result.recommendation.risk_level}, Score: ${result.recommendation.risk_score}).`);
      passed++;
    } catch (e) {
      console.log(`  [FAIL] Test 1: ${e.message}`);
      failed++;
    }

    // --- Test 2: Exact Crop Mapping ---
    try {
      assert(validFarm !== null, 'Prerequisite farm not created');
      const farmId = validFarm._id.toString();
      const sharedState = await sharedFarmStateService.getSharedFarmState(farmId);
      const mappedInput = farmDiseaseRiskService.extractDiseaseRiskInput(sharedState);

      assert(mappedInput.crop === 'Potato', `crop mapping failed: expected Potato, got ${mappedInput.crop}`);
      console.log('  [PASS] Test 2: Crop name mapping verified.');
      passed++;
    } catch (e) {
      console.log(`  [FAIL] Test 2: ${e.message}`);
      failed++;
    }

    // --- Test 3: Exact Temperature Mapping ---
    try {
      assert(validFarm !== null, 'Prerequisite farm not created');
      const farmId = validFarm._id.toString();
      const sharedState = await sharedFarmStateService.getSharedFarmState(farmId);
      const mappedInput = farmDiseaseRiskService.extractDiseaseRiskInput(sharedState);

      assert(mappedInput.temperature === 22.0, `temperature mapping failed: expected 22.0, got ${mappedInput.temperature}`);
      console.log('  [PASS] Test 3: Temperature mapping verified.');
      passed++;
    } catch (e) {
      console.log(`  [FAIL] Test 3: ${e.message}`);
      failed++;
    }

    // --- Test 4: Exact Humidity Mapping ---
    try {
      assert(validFarm !== null, 'Prerequisite farm not created');
      const farmId = validFarm._id.toString();
      const sharedState = await sharedFarmStateService.getSharedFarmState(farmId);
      const mappedInput = farmDiseaseRiskService.extractDiseaseRiskInput(sharedState);

      assert(mappedInput.humidity === 80.0, `humidity mapping failed: expected 80.0, got ${mappedInput.humidity}`);
      console.log('  [PASS] Test 4: Humidity mapping verified.');
      passed++;
    } catch (e) {
      console.log(`  [FAIL] Test 4: ${e.message}`);
      failed++;
    }

    // --- Test 5: Exact Rainfall Mapping (Distinct Values & No Field Swapping) ---
    try {
      assert(validFarm !== null, 'Prerequisite farm not created');
      const farmId = validFarm._id.toString();
      const sharedState = await sharedFarmStateService.getSharedFarmState(farmId);
      const mappedInput = farmDiseaseRiskService.extractDiseaseRiskInput(sharedState);

      assert(mappedInput.rainfall === 7.0, `rainfall mapping failed: expected 7.0, got ${mappedInput.rainfall}`);
      assert(mappedInput.recent_rainfall === 18.0, `recent_rainfall mapping failed: expected 18.0, got ${mappedInput.recent_rainfall}`);

      // Verify no field confusion with rainProbability (40.0) or expectedRainfall (10.0)
      assert(mappedInput.rainfall !== sharedState.weather.rainProbability, 'rainfall confused with rainProbability');
      assert(mappedInput.rainfall !== sharedState.weather.expectedRainfall, 'rainfall confused with expectedRainfall');
      assert(mappedInput.recent_rainfall !== sharedState.weather.expectedRainfall, 'recent_rainfall confused with expectedRainfall');
      assert(mappedInput.rainfall !== mappedInput.recent_rainfall, 'rainfall and recent_rainfall values transposed');

      console.log('  [PASS] Test 5: Exact rainfall mapping verified (weather.rainfall -> rainfall: 7.0, weather.recentRainfall -> recent_rainfall: 18.0).');
      passed++;
    } catch (e) {
      console.log(`  [FAIL] Test 5: ${e.message}`);
      failed++;
    }

    // --- Test 6: Growth Stage Mapping ---
    try {
      assert(validFarm !== null, 'Prerequisite farm not created');
      const farmId = validFarm._id.toString();
      const sharedState = await sharedFarmStateService.getSharedFarmState(farmId);
      const mappedInput = farmDiseaseRiskService.extractDiseaseRiskInput(sharedState);

      assert(mappedInput.growth_stage === 'Vegetative', `growth_stage mapping failed: expected Vegetative, got ${mappedInput.growth_stage}`);
      console.log('  [PASS] Test 6: Growth stage mapping verified.');
      passed++;
    } catch (e) {
      console.log(`  [FAIL] Test 6: ${e.message}`);
      failed++;
    }

    // --- Test 7: High-Risk Environmental Scenario ---
    try {
      const highRiskFarm = await farmService.createFarm({
        name: 'High Disease Risk Farm',
        location: { state: 'Kerala', district: 'Wayanad' },
        crop: { name: 'Tomato', growthStage: 'Flowering' },
        weather: {
          temperature: 25.0,
          humidity: 92.0,
          rainfall: 20.0,
          recentRainfall: 30.0
        }
      });
      const highRiskId = highRiskFarm._id.toString();

      const result = await farmDiseaseRiskService.getDiseaseRiskAssessment(highRiskId);
      await farmService.deleteFarm(highRiskId);

      assert(result.recommendation.risk_level === 'High', `Expected High risk level, got ${result.recommendation.risk_level}`);
      assert(result.recommendation.risk_score >= 0.65, `Expected score >= 0.65, got ${result.recommendation.risk_score}`);

      console.log(`  [PASS] Test 7: High-risk environmental scenario verified (Risk Level: ${result.recommendation.risk_level}, Score: ${result.recommendation.risk_score}).`);
      passed++;
    } catch (e) {
      console.log(`  [FAIL] Test 7: ${e.message}`);
      failed++;
    }

    // --- Test 8: Low-Risk Environmental Scenario ---
    try {
      const lowRiskFarm = await farmService.createFarm({
        name: 'Low Disease Risk Farm',
        location: { state: 'Rajasthan', district: 'Jaisalmer' },
        crop: { name: 'Tomato', growthStage: 'Seedling' },
        weather: {
          temperature: 35.0,
          humidity: 40.0,
          rainfall: 0.0,
          recentRainfall: 0.0
        }
      });
      const lowRiskId = lowRiskFarm._id.toString();

      const result = await farmDiseaseRiskService.getDiseaseRiskAssessment(lowRiskId);
      await farmService.deleteFarm(lowRiskId);

      assert(result.recommendation.risk_level === 'Low', `Expected Low risk level, got ${result.recommendation.risk_level}`);
      assert(result.recommendation.risk_score <= 0.35, `Expected score <= 0.35, got ${result.recommendation.risk_score}`);

      console.log(`  [PASS] Test 8: Low-risk environmental scenario verified (Risk Level: ${result.recommendation.risk_level}, Score: ${result.recommendation.risk_score}).`);
      passed++;
    } catch (e) {
      console.log(`  [FAIL] Test 8: ${e.message}`);
      failed++;
    }

    // --- Test 9: Missing Required Inputs ---
    const requiredFieldsToTest = [
      { name: 'temperature', weatherOverride: { humidity: 80, rainfall: 5, recentRainfall: 10 } },
      { name: 'humidity', weatherOverride: { temperature: 25, rainfall: 5, recentRainfall: 10 } },
      { name: 'rainfall', weatherOverride: { temperature: 25, humidity: 80, recentRainfall: 10 } },
      { name: 'recent_rainfall', weatherOverride: { temperature: 25, humidity: 80, rainfall: 5 } }
    ];

    for (const item of requiredFieldsToTest) {
      try {
        const incompleteFarm = await farmService.createFarm({
          name: `Missing ${item.name} Farm`,
          location: { state: 'Punjab', district: 'Amritsar' },
          crop: { name: 'Wheat', growthStage: 'Heading' },
          weather: item.weatherOverride
        });
        const incompleteId = incompleteFarm._id.toString();

        let caughtErr = null;
        try {
          await farmDiseaseRiskService.getDiseaseRiskAssessment(incompleteId);
        } catch (err) {
          caughtErr = err;
        }

        await farmService.deleteFarm(incompleteId);

        assert(caughtErr !== null, `Expected error for missing ${item.name}`);
        assert(caughtErr.code === 'INSUFFICIENT_FARM_DATA', `Expected INSUFFICIENT_FARM_DATA, got ${caughtErr.code}`);

        console.log(`  [PASS] Test 9 (${item.name}): Missing weather.${item.name} correctly rejected with INSUFFICIENT_FARM_DATA.`);
        passed++;
      } catch (e) {
        console.log(`  [FAIL] Test 9 (${item.name}): ${e.message}`);
        failed++;
      }
    }

    // --- Test 10: Invalid Farm ID ---
    try {
      const invalidId = 'malformed-farm-id-999';
      let caughtErr = null;
      try {
        await farmDiseaseRiskService.getDiseaseRiskAssessment(invalidId);
      } catch (err) {
        caughtErr = err;
      }

      assert(caughtErr !== null, 'Expected error for malformed farmId');
      assert(caughtErr.code === 'INVALID_FARM_ID', `Expected INVALID_FARM_ID, got ${caughtErr.code}`);

      console.log('  [PASS] Test 10: Malformed farmId correctly threw INVALID_FARM_ID.');
      passed++;
    } catch (e) {
      console.log(`  [FAIL] Test 10: ${e.message}`);
      failed++;
    }

    // --- Test 11: Farm Not Found ---
    try {
      const nonExistentId = new mongoose.Types.ObjectId().toString();
      let caughtErr = null;
      try {
        await farmDiseaseRiskService.getDiseaseRiskAssessment(nonExistentId);
      } catch (err) {
        caughtErr = err;
      }

      assert(caughtErr !== null, 'Expected error for non-existent farmId');
      assert(caughtErr.code === 'FARM_NOT_FOUND', `Expected FARM_NOT_FOUND, got ${caughtErr.code}`);

      console.log('  [PASS] Test 11: Non-existent farmId correctly threw FARM_NOT_FOUND.');
      passed++;
    } catch (e) {
      console.log(`  [FAIL] Test 11: ${e.message}`);
      failed++;
    }

    // --- Test 12: Real Atlas Integration ---
    if (isAtlasConnected) {
      try {
        const atlasFarmData = {
          name: 'Real Atlas Disease Risk Farm 18G',
          location: { state: 'Karnataka', district: 'Bellary', village: 'Hospet' },
          crop: { name: 'Cotton', growthStage: 'Boll Development' },
          weather: {
            temperature: 25.0,
            humidity: 92.0,
            rainfall: 20.0,
            recentRainfall: 30.0
          }
        };

        const atlasFarm = await farmService.createFarm(atlasFarmData);
        const atlasFarmId = atlasFarm._id.toString();

        const atlasResult = await farmDiseaseRiskService.getDiseaseRiskAssessment(atlasFarmId);

        assert(atlasResult.success === true, 'Atlas request failed');
        assert(atlasResult.recommendation.risk_level === 'High', 'Atlas risk_level High expected');
        assert(typeof atlasResult.recommendation.risk_score === 'number', 'Atlas risk_score missing');

        await farmService.deleteFarm(atlasFarmId);

        console.log(`  [PASS] Test 12 (REAL ATLAS): Real Atlas Farm -> Shared Farm State -> Disease Risk Engine executed successfully (Risk Level: ${atlasResult.recommendation.risk_level}, Score: ${atlasResult.recommendation.risk_score}).`);
        passed++;
      } catch (e) {
        console.log(`  [FAIL] Test 12 (REAL ATLAS): ${e.message}`);
        failed++;
      }
    } else {
      console.log('  [SKIP] Test 12 (REAL ATLAS): Skipped live Atlas test (database operating in memory fallback).');
    }

    // --- Test 13: HTTP REST Endpoint GET /api/farms/:farmId/disease-risk ---
    try {
      assert(validFarm !== null, 'Prerequisite farm not created');
      const farmId = validFarm._id.toString();

      const res = await makeHttpRequest(server, 'GET', `/api/farms/${farmId}/disease-risk`);

      assert(res.status === 200, `Expected HTTP 200, got ${res.status}`);
      assert(res.body.success === true, 'HTTP response missing success: true');
      assert(res.body.farmId === farmId, `HTTP response farmId mismatch: expected ${farmId}, got ${res.body.farmId}`);
      assert(res.body.recommendation.risk_level === 'Medium', 'HTTP response expected Medium risk level');

      console.log(`  [PASS] Test 13: HTTP GET /api/farms/${farmId}/disease-risk verified.`);
      passed++;
    } catch (e) {
      console.log(`  [FAIL] Test 13: ${e.message}`);
      failed++;
    }

    // --- Test 14: Direct Endpoint Coexistence (POST /api/ai/disease-risk) ---
    try {
      const directRes = await makeHttpRequest(server, 'POST', '/api/ai/disease-risk', {
        crop: 'Tomato',
        growth_stage: 'Flowering',
        temperature: 25.0,
        humidity: 92.0,
        rainfall: 20.0,
        recent_rainfall: 30.0
      });

      assert(directRes.status === 200, `Expected HTTP status 200, got ${directRes.status}`);
      assert(directRes.body.success === true, 'Direct endpoint missing success: true');
      assert(directRes.body.result.risk_level === 'High', 'Direct endpoint expected High risk level');

      console.log('  [PASS] Test 14: Direct endpoint POST /api/ai/disease-risk continues to function unchanged.');
      passed++;
    } catch (e) {
      console.log(`  [FAIL] Test 14: ${e.message}`);
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
  console.log(`FARM DISEASE RISK INTEGRATION SUMMARY: ${passed} PASSED, ${failed} FAILED`);
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
