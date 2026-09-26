/**
 * AgriSense — Farm Crop Recommendation Integration Verification Suite (Milestone 18D).
 *
 * Verifies:
 * 1. End-to-end integration: Farm ID -> Shared Farm State -> Crop Recommendation Service -> AI Inference -> Random Forest Model.
 * 2. Exact feature mapping integrity (N, P, K, temperature, humidity, ph, rainfall).
 * 3. Validation error on missing soil.N (INSUFFICIENT_FARM_DATA, no fabricated defaults).
 * 4. Validation error on missing weather.temperature.
 * 5. Validation error on missing weather.rainfall.
 * 6. Malformed farm ID error handling (INVALID_FARM_ID).
 * 7. Non-existent farm ID error handling (FARM_NOT_FOUND).
 * 8. Live MongoDB Atlas connection & inference verification.
 * 9. Express HTTP REST endpoint GET /api/farms/:farmId/crop-recommendation.
 * 10. Coexistence and non-regression of direct POST /api/ai/crop-recommendation endpoint.
 */

const http = require('http');
const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const app = require('../server');
const farmService = require('../services/farmService');
const sharedFarmStateService = require('../services/sharedFarmStateService');
const farmCropRecommendationService = require('../services/farmCropRecommendationService');
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
  console.log('AGRISENSE — FARM ↔ CROP RECOMMENDATION INTEGRATION SUITE (MILESTONE 18D)');
  console.log('='.repeat(80));

  const isAtlasConnected = await connectDB();
  console.log(`[Database Connection] Status: ${isAtlasConnected ? 'CONNECTED TO ATLAS' : 'MEMORY FALLBACK ACTIVE'}`);

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  let validFarm = null;

  try {
    // --- Test 1: Valid Farm -> Crop Recommendation Pipeline ---
    try {
      const farmPayload = {
        name: 'Rice Belt Farm 18D',
        location: { state: 'West Bengal', district: 'Burdwan', village: 'Memari' },
        soil: { nitrogen: 90, phosphorus: 42, potassium: 43, ph: 6.5 },
        weather: { temperature: 20.8, humidity: 82.0, rainfall: 202.9 }
      };

      validFarm = await farmService.createFarm(farmPayload);
      const farmId = validFarm._id.toString();

      const result = await farmCropRecommendationService.getCropRecommendation(farmId);

      assert(result.success === true, 'Response missing success: true');
      assert(result.farmId === farmId, `farmId mismatch: expected ${farmId}, got ${result.farmId}`);
      assert(result.recommendation, 'Result missing recommendation object');
      assert(typeof result.recommendation.predicted_crop === 'string', 'predicted_crop is not a string');
      assert(result.recommendation.predicted_crop === 'rice', `Expected predicted_crop 'rice', got '${result.recommendation.predicted_crop}'`);
      assert(typeof result.recommendation.confidence === 'number', 'confidence is not a number');
      assert(Array.isArray(result.recommendation.top_3), 'top_3 is not an array');

      console.log(`  [PASS] Test 1: Valid Farm -> Shared Farm State -> Crop Recommendation (Predicted: ${result.recommendation.predicted_crop}, Confidence: ${result.recommendation.confidence}).`);
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
      const mappedInput = farmCropRecommendationService.extractCropModelInput(sharedState);

      assert(mappedInput.N === 90, `N mapping failed: expected 90, got ${mappedInput.N}`);
      assert(mappedInput.P === 42, `P mapping failed: expected 42, got ${mappedInput.P}`);
      assert(mappedInput.K === 43, `K mapping failed: expected 43, got ${mappedInput.K}`);
      assert(mappedInput.temperature === 20.8, `temperature mapping failed: expected 20.8, got ${mappedInput.temperature}`);
      assert(mappedInput.humidity === 82.0, `humidity mapping failed: expected 82.0, got ${mappedInput.humidity}`);
      assert(mappedInput.ph === 6.5, `ph mapping failed: expected 6.5, got ${mappedInput.ph}`);
      assert(mappedInput.rainfall === 202.9, `rainfall mapping failed: expected 202.9, got ${mappedInput.rainfall}`);

      // Verify no field transposition/reordering bugs
      assert(mappedInput.humidity !== mappedInput.temperature, 'humidity/temperature values confounded');
      assert(mappedInput.rainfall !== mappedInput.humidity, 'rainfall/humidity values confounded');

      console.log('  [PASS] Test 2: Exact model feature input mapping verified [N, P, K, temperature, humidity, ph, rainfall].');
      passed++;
    } catch (e) {
      console.log(`  [FAIL] Test 2: ${e.message}`);
      failed++;
    }

    // --- Test 3: Missing Soil N (Validation Error, No Defaults) ---
    try {
      const incompleteFarm = await farmService.createFarm({
        name: 'Incomplete N Farm',
        location: { state: 'Punjab', district: 'Ludhiana' },
        soil: { phosphorus: 40, potassium: 50, ph: 6.8 }, // Missing nitrogen (N)
        weather: { temperature: 25.0, humidity: 65.0, rainfall: 100.0 }
      });
      const incompleteId = incompleteFarm._id.toString();

      let caughtErr = null;
      try {
        await farmCropRecommendationService.getCropRecommendation(incompleteId);
      } catch (err) {
        caughtErr = err;
      }

      await farmService.deleteFarm(incompleteId);

      assert(caughtErr !== null, 'Expected validation error for missing N, but request succeeded');
      assert(caughtErr.code === 'INSUFFICIENT_FARM_DATA', `Expected code 'INSUFFICIENT_FARM_DATA', got '${caughtErr.code}'`);
      assert(caughtErr.missingFields && caughtErr.missingFields.includes('N'), 'missingFields does not include N');
      console.log(`  [PASS] Test 3: Missing soil.N correctly rejected with INSUFFICIENT_FARM_DATA.`);
      passed++;
    } catch (e) {
      console.log(`  [FAIL] Test 3: ${e.message}`);
      failed++;
    }

    // --- Test 4: Missing Weather Temperature ---
    try {
      const incompleteFarm = await farmService.createFarm({
        name: 'Incomplete Temp Farm',
        location: { state: 'Haryana', district: 'Karnal' },
        soil: { nitrogen: 80, phosphorus: 40, potassium: 40, ph: 6.5 },
        weather: { humidity: 70.0, rainfall: 120.0 } // Missing temperature
      });
      const incompleteId = incompleteFarm._id.toString();

      let caughtErr = null;
      try {
        await farmCropRecommendationService.getCropRecommendation(incompleteId);
      } catch (err) {
        caughtErr = err;
      }

      await farmService.deleteFarm(incompleteId);

      assert(caughtErr !== null, 'Expected validation error for missing temperature');
      assert(caughtErr.code === 'INSUFFICIENT_FARM_DATA', `Expected INSUFFICIENT_FARM_DATA, got ${caughtErr.code}`);
      assert(caughtErr.missingFields && caughtErr.missingFields.includes('temperature'), 'missingFields missing temperature');
      console.log('  [PASS] Test 4: Missing weather.temperature correctly rejected with INSUFFICIENT_FARM_DATA.');
      passed++;
    } catch (e) {
      console.log(`  [FAIL] Test 4: ${e.message}`);
      failed++;
    }

    // --- Test 5: Missing Weather Rainfall ---
    try {
      const incompleteFarm = await farmService.createFarm({
        name: 'Incomplete Rainfall Farm',
        location: { state: 'Gujarat', district: 'Anand' },
        soil: { nitrogen: 75, phosphorus: 35, potassium: 45, ph: 7.0 },
        weather: { temperature: 28.0, humidity: 60.0 } // Missing rainfall
      });
      const incompleteId = incompleteFarm._id.toString();

      let caughtErr = null;
      try {
        await farmCropRecommendationService.getCropRecommendation(incompleteId);
      } catch (err) {
        caughtErr = err;
      }

      await farmService.deleteFarm(incompleteId);

      assert(caughtErr !== null, 'Expected validation error for missing rainfall');
      assert(caughtErr.code === 'INSUFFICIENT_FARM_DATA', `Expected INSUFFICIENT_FARM_DATA, got ${caughtErr.code}`);
      assert(caughtErr.missingFields && caughtErr.missingFields.includes('rainfall'), 'missingFields missing rainfall');
      console.log('  [PASS] Test 5: Missing weather.rainfall correctly rejected with INSUFFICIENT_FARM_DATA.');
      passed++;
    } catch (e) {
      console.log(`  [FAIL] Test 5: ${e.message}`);
      failed++;
    }

    // --- Test 6: Invalid Farm ID ---
    try {
      const invalidId = 'malformed-farm-id-999';
      let caughtErr = null;
      try {
        await farmCropRecommendationService.getCropRecommendation(invalidId);
      } catch (err) {
        caughtErr = err;
      }

      assert(caughtErr !== null, 'Expected error for malformed farmId');
      assert(caughtErr.code === 'INVALID_FARM_ID', `Expected INVALID_FARM_ID, got ${caughtErr.code}`);
      console.log('  [PASS] Test 6: Malformed farmId correctly threw INVALID_FARM_ID.');
      passed++;
    } catch (e) {
      console.log(`  [FAIL] Test 6: ${e.message}`);
      failed++;
    }

    // --- Test 7: Farm Not Found ---
    try {
      const nonExistentId = new mongoose.Types.ObjectId().toString();
      let caughtErr = null;
      try {
        await farmCropRecommendationService.getCropRecommendation(nonExistentId);
      } catch (err) {
        caughtErr = err;
      }

      assert(caughtErr !== null, 'Expected error for non-existent farmId');
      assert(caughtErr.code === 'FARM_NOT_FOUND', `Expected FARM_NOT_FOUND, got ${caughtErr.code}`);
      console.log('  [PASS] Test 7: Non-existent farmId correctly threw FARM_NOT_FOUND.');
      passed++;
    } catch (e) {
      console.log(`  [FAIL] Test 7: ${e.message}`);
      failed++;
    }

    // --- Test 8: Real Atlas Integration ---
    if (isAtlasConnected) {
      try {
        const atlasFarmData = {
          name: 'Real Atlas Rice Farm 18D',
          location: { state: 'Odisha', district: 'Cuttack', village: 'Banki' },
          soil: { nitrogen: 95, phosphorus: 45, potassium: 45, ph: 6.2 },
          weather: { temperature: 22.0, humidity: 80.0, rainfall: 210.0 }
        };

        const atlasFarm = await farmService.createFarm(atlasFarmData);
        const atlasFarmId = atlasFarm._id.toString();

        const atlasResult = await farmCropRecommendationService.getCropRecommendation(atlasFarmId);

        assert(atlasResult.success === true, 'Atlas request failed');
        assert(atlasResult.recommendation.predicted_crop === 'rice', `Atlas expected rice, got ${atlasResult.recommendation.predicted_crop}`);
        assert(atlasResult.recommendation.confidence > 0.8, 'Atlas low confidence');

        await farmService.deleteFarm(atlasFarmId);

        console.log(`  [PASS] Test 8 (REAL ATLAS): Real Atlas Farm -> Shared Farm State -> RF Model executed successfully (Predicted: ${atlasResult.recommendation.predicted_crop}).`);
        passed++;
      } catch (e) {
        console.log(`  [FAIL] Test 8 (REAL ATLAS): ${e.message}`);
        failed++;
      }
    } else {
      console.log('  [SKIP] Test 8 (REAL ATLAS): Skipped live Atlas test (database operating in memory fallback).');
    }

    // --- Test 9: HTTP REST Endpoint GET /api/farms/:farmId/crop-recommendation ---
    try {
      assert(validFarm !== null, 'Prerequisite farm not created');
      const farmId = validFarm._id.toString();

      const res = await makeHttpRequest(server, 'GET', `/api/farms/${farmId}/crop-recommendation`);

      assert(res.status === 200, `Expected HTTP 200, got ${res.status}`);
      assert(res.body.success === true, 'HTTP response missing success: true');
      assert(res.body.farmId === farmId, `HTTP response farmId mismatch: expected ${farmId}, got ${res.body.farmId}`);
      assert(res.body.recommendation.predicted_crop === 'rice', `HTTP response expected rice, got ${res.body.recommendation.predicted_crop}`);

      console.log(`  [PASS] Test 9: HTTP GET /api/farms/${farmId}/crop-recommendation verified.`);
      passed++;
    } catch (e) {
      console.log(`  [FAIL] Test 9: ${e.message}`);
      failed++;
    }

    // --- Test 10: Direct Endpoint Coexistence (POST /api/ai/crop-recommendation) ---
    try {
      const directRes = await makeHttpRequest(server, 'POST', '/api/ai/crop-recommendation', {
        N: 90.0,
        P: 42.0,
        K: 43.0,
        temperature: 20.8,
        humidity: 82.0,
        ph: 6.5,
        rainfall: 202.9
      });

      assert(directRes.status === 200, `Expected HTTP status 200, got ${directRes.status}`);
      assert(directRes.body.success === true, 'Direct endpoint missing success: true');
      assert(directRes.body.result.predicted_crop === 'rice', `Direct endpoint expected rice, got ${directRes.body.result.predicted_crop}`);

      console.log(`  [PASS] Test 10: Direct endpoint POST /api/ai/crop-recommendation continues to function unchanged.`);
      passed++;
    } catch (e) {
      console.log(`  [FAIL] Test 10: ${e.message}`);
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
  console.log(`FARM CROP RECOMMENDATION INTEGRATION SUMMARY: ${passed} PASSED, ${failed} FAILED`);
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
