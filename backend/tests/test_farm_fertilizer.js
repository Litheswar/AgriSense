/**
 * AgriSense — Shared Farm State ↔ Fertilizer Recommendation Integration Suite (Milestone 18F).
 *
 * Verifies:
 * 1. End-to-end integration: Farm ID -> Shared Farm State -> Fertilizer Service -> Rule Engine -> Advisory.
 * 2. Exact feature mapping integrity (N, P, K using distinctive non-identical values).
 * 3. Exact pH feature mapping (e.g. pH 4.5 -> low pH status & soil amendment recommendation).
 * 4. Crop name mapping integrity.
 * 5. Growth stage mapping integrity.
 * 6. Disease Context Detected -> Caution warning generated with disease name.
 * 7. Disease Context Not Detected -> Caution warning is null.
 * 8. Missing Disease Context -> INSUFFICIENT_FARM_DATA validation error.
 * 9. Missing Soil N -> INSUFFICIENT_FARM_DATA validation error.
 * 10. Missing Soil P -> INSUFFICIENT_FARM_DATA validation error.
 * 11. Missing Soil K -> INSUFFICIENT_FARM_DATA validation error.
 * 12. Missing Soil pH -> INSUFFICIENT_FARM_DATA validation error.
 * 13. Missing Crop Name -> INSUFFICIENT_FARM_DATA validation error.
 * 14. Malformed farm ID error handling (INVALID_FARM_ID).
 * 15. Non-existent farm ID error handling (FARM_NOT_FOUND).
 * 16. Live MongoDB Atlas connection & engine execution verification.
 * 17. Express HTTP REST endpoint GET /api/farms/:farmId/fertilizer.
 * 18. Coexistence and non-regression of direct POST /api/ai/fertilizer endpoint.
 */

const http = require('http');
const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
process.env.JWT_SECRET ||= 'test-only-secret-generated-for-agrisense-m21';

const app = require('../server');
const farmService = require('../services/farmService');
const sharedFarmStateService = require('../services/sharedFarmStateService');
const farmFertilizerService = require('../services/farmFertilizerService');
const aiService = require('../services/aiService');
const { connectDB, disconnectDB } = require('../config/db');
const { createAuthFixture, injectFarmOwner } = require('./helpers/authFixture');
let testToken;
let cleanupAuthFixture;

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
        ...(testToken ? { Authorization: `Bearer ${testToken}` } : {}),
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
  console.log('AGRISENSE — FARM ↔ FERTILIZER RECOMMENDATION INTEGRATION SUITE (MILESTONE 18F)');
  console.log('='.repeat(80));

  const isAtlasConnected = await connectDB();
  console.log(`[Database Connection] Status: ${isAtlasConnected ? 'CONNECTED TO ATLAS' : 'MEMORY FALLBACK ACTIVE'}`);
  if (!isAtlasConnected) throw new Error('Authenticated Farm regression requires Atlas.');
  const authFixture = await createAuthFixture('fertilizer');
  testToken = authFixture.token;
  cleanupAuthFixture = injectFarmOwner(farmService, authFixture.user._id);

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  let validFarm = null;

  try {
    // --- Test 1: Valid Farm -> Fertilizer Pipeline ---
    try {
      const farmPayload = {
        name: 'Fertilizer Test Farm 18F',
        location: { state: 'Punjab', district: 'Ludhiana', village: 'Samrala' },
        soil: { nitrogen: 15, phosphorus: 40, potassium: 50, ph: 6.5 },
        crop: { name: 'Corn', growthStage: 'Vegetative' },
        diseaseContext: { detected: false, disease: null, confidence: 0.0 }
      };

      validFarm = await farmService.createFarm(farmPayload);
      const farmId = validFarm._id.toString();

      const result = await farmFertilizerService.getFertilizerRecommendation(farmId);

      assert(result.success === true, 'Response missing success: true');
      assert(result.farmId === farmId, `farmId mismatch: expected ${farmId}, got ${result.farmId}`);
      assert(result.recommendation, 'Result missing recommendation object');
      assert(result.recommendation.nutrient_status.N === 'low', `Expected N status low, got ${result.recommendation.nutrient_status.N}`);
      assert(result.recommendation.priority_nutrients.includes('N'), 'Expected N in priority_nutrients');
      assert(result.recommendation.caution === null, 'Expected caution to be null for healthy farm');

      console.log(`  [PASS] Test 1: Valid Farm -> Shared Farm State -> Fertilizer Engine (Nutrient Status: ${JSON.stringify(result.recommendation.nutrient_status)}, Priorities: ${result.recommendation.priority_nutrients.join(', ')}).`);
      passed++;
    } catch (e) {
      console.log(`  [FAIL] Test 1: ${e.message}`);
      failed++;
    }

    // --- Test 2: Exact N/P/K Feature Mapping (Distinctive Values) ---
    try {
      assert(validFarm !== null, 'Prerequisite farm not created');
      const farmId = validFarm._id.toString();
      const sharedState = await sharedFarmStateService.getSharedFarmState(farmId);
      const mappedInput = farmFertilizerService.extractFertilizerInput(sharedState);

      assert(mappedInput.N === 15, `N mapping failed: expected 15, got ${mappedInput.N}`);
      assert(mappedInput.P === 40, `P mapping failed: expected 40, got ${mappedInput.P}`);
      assert(mappedInput.K === 50, `K mapping failed: expected 50, got ${mappedInput.K}`);

      // Verify no field transposition bugs
      assert(mappedInput.N !== mappedInput.P && mappedInput.P !== mappedInput.K, 'Nutrient values confounded');

      console.log('  [PASS] Test 2: Distinctive N, P, K feature mapping verified without field transposition.');
      passed++;
    } catch (e) {
      console.log(`  [FAIL] Test 2: ${e.message}`);
      failed++;
    }

    // --- Test 3: Exact pH Feature Mapping ---
    try {
      const lowPhFarm = await farmService.createFarm({
        name: 'Acidic Soil Farm',
        location: { state: 'Karnataka', district: 'Kodagu' },
        soil: { nitrogen: 45, phosphorus: 40, potassium: 50, ph: 4.5 },
        crop: { name: 'Coffee', growthStage: 'Vegetative' },
        diseaseContext: { detected: false }
      });
      const lowPhId = lowPhFarm._id.toString();

      const result = await farmFertilizerService.getFertilizerRecommendation(lowPhId);
      await farmService.deleteFarm(lowPhId);

      assert(result.engineInput.ph === 4.5, `pH input mismatch: expected 4.5, got ${result.engineInput.ph}`);
      assert(result.recommendation.ph_status === 'low', `Expected ph_status 'low', got '${result.recommendation.ph_status}'`);
      assert(result.recommendation.recommendation.includes('amendments to raise pH'), 'Recommendation missing pH raising advice');

      console.log('  [PASS] Test 3: Soil pH feature mapping and low pH status classification verified.');
      passed++;
    } catch (e) {
      console.log(`  [FAIL] Test 3: ${e.message}`);
      failed++;
    }

    // --- Test 4: Crop Mapping ---
    try {
      assert(validFarm !== null, 'Prerequisite farm not created');
      const farmId = validFarm._id.toString();
      const sharedState = await sharedFarmStateService.getSharedFarmState(farmId);
      const mappedInput = farmFertilizerService.extractFertilizerInput(sharedState);

      assert(mappedInput.crop === 'Corn', `crop mapping failed: expected Corn, got ${mappedInput.crop}`);
      console.log('  [PASS] Test 4: Crop name mapping verified.');
      passed++;
    } catch (e) {
      console.log(`  [FAIL] Test 4: ${e.message}`);
      failed++;
    }

    // --- Test 5: Growth Stage Mapping ---
    try {
      assert(validFarm !== null, 'Prerequisite farm not created');
      const farmId = validFarm._id.toString();
      const sharedState = await sharedFarmStateService.getSharedFarmState(farmId);
      const mappedInput = farmFertilizerService.extractFertilizerInput(sharedState);

      assert(mappedInput.growth_stage === 'Vegetative', `growth_stage mapping failed: expected Vegetative, got ${mappedInput.growth_stage}`);
      console.log('  [PASS] Test 5: Growth stage mapping verified.');
      passed++;
    } catch (e) {
      console.log(`  [FAIL] Test 5: ${e.message}`);
      failed++;
    }

    // --- Test 6: Disease Context Detected (Caution Safeguard) ---
    try {
      const diseasedFarm = await farmService.createFarm({
        name: 'Blighted Potato Farm',
        location: { state: 'West Bengal', district: 'Hooghly' },
        soil: { nitrogen: 45, phosphorus: 40, potassium: 50, ph: 6.5 },
        crop: { name: 'Potato', growthStage: 'Vegetative' },
        diseaseContext: { detected: true, disease: 'Late blight', confidence: 0.96 }
      });
      const diseasedId = diseasedFarm._id.toString();

      const result = await farmFertilizerService.getFertilizerRecommendation(diseasedId);
      await farmService.deleteFarm(diseasedId);

      assert(result.engineInput.disease_status.detected === true, 'disease_status.detected should be true');
      assert(result.engineInput.disease_status.disease === 'Late blight', 'disease name mismatch');
      assert(result.recommendation.caution !== null, 'Expected caution warning string');
      assert(result.recommendation.caution.includes('Late blight'), 'Caution warning string missing disease name');

      console.log(`  [PASS] Test 6: Disease context detected correctly injected caution warning: "${result.recommendation.caution}".`);
      passed++;
    } catch (e) {
      console.log(`  [FAIL] Test 6: ${e.message}`);
      failed++;
    }

    // --- Test 7: Disease Context Not Detected ---
    try {
      assert(validFarm !== null, 'Prerequisite farm not created');
      const farmId = validFarm._id.toString();
      const result = await farmFertilizerService.getFertilizerRecommendation(farmId);

      assert(result.engineInput.disease_status.detected === false, 'disease_status.detected should be false');
      assert(result.recommendation.caution === null, 'Caution warning should be null when disease not detected');

      console.log('  [PASS] Test 7: Healthy farm (disease detected: false) correctly returns null caution.');
      passed++;
    } catch (e) {
      console.log(`  [FAIL] Test 7: ${e.message}`);
      failed++;
    }

    // --- Test 8: Missing Disease Context ---
    try {
      const rawFarm = await farmService.createFarm({
        name: 'No Disease Context Farm',
        location: { state: 'Haryana', district: 'Karnal' },
        soil: { nitrogen: 40, phosphorus: 40, potassium: 50, ph: 6.5 },
        crop: { name: 'Wheat', growthStage: 'Heading' }
      });
      const farmId = rawFarm._id.toString();

      // Modify sharedState manually to remove diseaseContext to test adapter strictness
      const sharedState = await sharedFarmStateService.getSharedFarmState(farmId);
      delete sharedState.diseaseContext;

      let caughtErr = null;
      try {
        farmFertilizerService.extractFertilizerInput(sharedState);
      } catch (err) {
        caughtErr = err;
      }

      await farmService.deleteFarm(farmId);

      assert(caughtErr !== null, 'Expected error for missing diseaseContext');
      assert(caughtErr.code === 'INSUFFICIENT_FARM_DATA', `Expected INSUFFICIENT_FARM_DATA, got ${caughtErr.code}`);
      assert(caughtErr.missingFields && caughtErr.missingFields.includes('disease_status'), 'missingFields missing disease_status');

      console.log('  [PASS] Test 8: Missing diseaseContext correctly rejected with INSUFFICIENT_FARM_DATA.');
      passed++;
    } catch (e) {
      console.log(`  [FAIL] Test 8: ${e.message}`);
      failed++;
    }

    // --- Test 9: Missing Soil N ---
    try {
      const incompleteFarm = await farmService.createFarm({
        name: 'Missing N Farm',
        location: { state: 'Gujarat', district: 'Anand' },
        soil: { phosphorus: 40, potassium: 50, ph: 6.5 }, // Missing nitrogen
        crop: { name: 'Tomato', growthStage: 'Flowering' },
        diseaseContext: { detected: false }
      });
      const incompleteId = incompleteFarm._id.toString();

      let caughtErr = null;
      try {
        await farmFertilizerService.getFertilizerRecommendation(incompleteId);
      } catch (err) {
        caughtErr = err;
      }

      await farmService.deleteFarm(incompleteId);

      assert(caughtErr !== null, 'Expected error for missing N');
      assert(caughtErr.code === 'INSUFFICIENT_FARM_DATA', `Expected INSUFFICIENT_FARM_DATA, got ${caughtErr.code}`);
      assert(caughtErr.missingFields && caughtErr.missingFields.includes('N'), 'missingFields missing N');

      console.log('  [PASS] Test 9: Missing soil.N correctly rejected with INSUFFICIENT_FARM_DATA.');
      passed++;
    } catch (e) {
      console.log(`  [FAIL] Test 9: ${e.message}`);
      failed++;
    }

    // --- Test 10: Missing Soil P ---
    try {
      const incompleteFarm = await farmService.createFarm({
        name: 'Missing P Farm',
        location: { state: 'Gujarat', district: 'Anand' },
        soil: { nitrogen: 40, potassium: 50, ph: 6.5 }, // Missing phosphorus
        crop: { name: 'Tomato', growthStage: 'Flowering' },
        diseaseContext: { detected: false }
      });
      const incompleteId = incompleteFarm._id.toString();

      let caughtErr = null;
      try {
        await farmFertilizerService.getFertilizerRecommendation(incompleteId);
      } catch (err) {
        caughtErr = err;
      }

      await farmService.deleteFarm(incompleteId);

      assert(caughtErr !== null, 'Expected error for missing P');
      assert(caughtErr.code === 'INSUFFICIENT_FARM_DATA', `Expected INSUFFICIENT_FARM_DATA, got ${caughtErr.code}`);

      console.log('  [PASS] Test 10: Missing soil.P correctly rejected with INSUFFICIENT_FARM_DATA.');
      passed++;
    } catch (e) {
      console.log(`  [FAIL] Test 10: ${e.message}`);
      failed++;
    }

    // --- Test 11: Missing Soil K ---
    try {
      const incompleteFarm = await farmService.createFarm({
        name: 'Missing K Farm',
        location: { state: 'Gujarat', district: 'Anand' },
        soil: { nitrogen: 40, phosphorus: 40, ph: 6.5 }, // Missing potassium
        crop: { name: 'Tomato', growthStage: 'Flowering' },
        diseaseContext: { detected: false }
      });
      const incompleteId = incompleteFarm._id.toString();

      let caughtErr = null;
      try {
        await farmFertilizerService.getFertilizerRecommendation(incompleteId);
      } catch (err) {
        caughtErr = err;
      }

      await farmService.deleteFarm(incompleteId);

      assert(caughtErr !== null, 'Expected error for missing K');
      assert(caughtErr.code === 'INSUFFICIENT_FARM_DATA', `Expected INSUFFICIENT_FARM_DATA, got ${caughtErr.code}`);

      console.log('  [PASS] Test 11: Missing soil.K correctly rejected with INSUFFICIENT_FARM_DATA.');
      passed++;
    } catch (e) {
      console.log(`  [FAIL] Test 11: ${e.message}`);
      failed++;
    }

    // --- Test 12: Missing Soil pH ---
    try {
      const incompleteFarm = await farmService.createFarm({
        name: 'Missing pH Farm',
        location: { state: 'Gujarat', district: 'Anand' },
        soil: { nitrogen: 40, phosphorus: 40, potassium: 50 }, // Missing ph
        crop: { name: 'Tomato', growthStage: 'Flowering' },
        diseaseContext: { detected: false }
      });
      const incompleteId = incompleteFarm._id.toString();

      let caughtErr = null;
      try {
        await farmFertilizerService.getFertilizerRecommendation(incompleteId);
      } catch (err) {
        caughtErr = err;
      }

      await farmService.deleteFarm(incompleteId);

      assert(caughtErr !== null, 'Expected error for missing ph');
      assert(caughtErr.code === 'INSUFFICIENT_FARM_DATA', `Expected INSUFFICIENT_FARM_DATA, got ${caughtErr.code}`);

      console.log('  [PASS] Test 12: Missing soil.ph correctly rejected with INSUFFICIENT_FARM_DATA.');
      passed++;
    } catch (e) {
      console.log(`  [FAIL] Test 12: ${e.message}`);
      failed++;
    }

    // --- Test 13: Missing Crop Name ---
    try {
      const incompleteFarm = await farmService.createFarm({
        name: 'Missing Crop Name Farm',
        location: { state: 'Tamil Nadu', district: 'Salem' },
        soil: { nitrogen: 40, phosphorus: 40, potassium: 50, ph: 6.5 },
        diseaseContext: { detected: false }
      });
      const incompleteId = incompleteFarm._id.toString();

      let caughtErr = null;
      try {
        await farmFertilizerService.getFertilizerRecommendation(incompleteId);
      } catch (err) {
        caughtErr = err;
      }

      await farmService.deleteFarm(incompleteId);

      assert(caughtErr !== null, 'Expected error for missing crop');
      assert(caughtErr.code === 'INSUFFICIENT_FARM_DATA', `Expected INSUFFICIENT_FARM_DATA, got ${caughtErr.code}`);

      console.log('  [PASS] Test 13: Missing crop name correctly rejected with INSUFFICIENT_FARM_DATA.');
      passed++;
    } catch (e) {
      console.log(`  [FAIL] Test 13: ${e.message}`);
      failed++;
    }

    // --- Test 14: Invalid Farm ID ---
    try {
      const invalidId = 'malformed-farm-id-999';
      let caughtErr = null;
      try {
        await farmFertilizerService.getFertilizerRecommendation(invalidId);
      } catch (err) {
        caughtErr = err;
      }

      assert(caughtErr !== null, 'Expected error for malformed farmId');
      assert(caughtErr.code === 'INVALID_FARM_ID', `Expected INVALID_FARM_ID, got ${caughtErr.code}`);

      console.log('  [PASS] Test 14: Malformed farmId correctly threw INVALID_FARM_ID.');
      passed++;
    } catch (e) {
      console.log(`  [FAIL] Test 14: ${e.message}`);
      failed++;
    }

    // --- Test 15: Farm Not Found ---
    try {
      const nonExistentId = new mongoose.Types.ObjectId().toString();
      let caughtErr = null;
      try {
        await farmFertilizerService.getFertilizerRecommendation(nonExistentId);
      } catch (err) {
        caughtErr = err;
      }

      assert(caughtErr !== null, 'Expected error for non-existent farmId');
      assert(caughtErr.code === 'FARM_NOT_FOUND', `Expected FARM_NOT_FOUND, got ${caughtErr.code}`);

      console.log('  [PASS] Test 15: Non-existent farmId correctly threw FARM_NOT_FOUND.');
      passed++;
    } catch (e) {
      console.log(`  [FAIL] Test 15: ${e.message}`);
      failed++;
    }

    // --- Test 16: Real Atlas Integration ---
    if (isAtlasConnected) {
      try {
        const atlasFarmData = {
          name: 'Real Atlas Fertilizer Farm 18F',
          location: { state: 'Maharashtra', district: 'Nashik', village: 'Niphad' },
          soil: { nitrogen: 20, phosphorus: 40, potassium: 50, ph: 6.5 },
          crop: { name: 'Grapes', growthStage: 'Fruiting' },
          diseaseContext: { detected: false }
        };

        const atlasFarm = await farmService.createFarm(atlasFarmData);
        const atlasFarmId = atlasFarm._id.toString();

        const atlasResult = await farmFertilizerService.getFertilizerRecommendation(atlasFarmId);

        assert(atlasResult.success === true, 'Atlas request failed');
        assert(atlasResult.recommendation.nutrient_status.N === 'low', 'Atlas N status low expected');
        assert(atlasResult.recommendation.priority_nutrients.includes('N'), 'Atlas priority nutrients missing N');

        await farmService.deleteFarm(atlasFarmId);

        console.log(`  [PASS] Test 16 (REAL ATLAS): Real Atlas Farm -> Shared Farm State -> Fertilizer Engine executed successfully (Low N identified, Priorities: ${atlasResult.recommendation.priority_nutrients.join(', ')}).`);
        passed++;
      } catch (e) {
        console.log(`  [FAIL] Test 16 (REAL ATLAS): ${e.message}`);
        failed++;
      }
    } else {
      console.log('  [SKIP] Test 16 (REAL ATLAS): Skipped live Atlas test (database operating in memory fallback).');
    }

    // --- Test 17: HTTP REST Endpoint GET /api/farms/:farmId/fertilizer ---
    try {
      assert(validFarm !== null, 'Prerequisite farm not created');
      const farmId = validFarm._id.toString();

      const res = await makeHttpRequest(server, 'GET', `/api/farms/${farmId}/fertilizer`);

      assert(res.status === 200, `Expected HTTP 200, got ${res.status}`);
      assert(res.body.success === true, 'HTTP response missing success: true');
      assert(res.body.farmId === farmId, `HTTP response farmId mismatch: expected ${farmId}, got ${res.body.farmId}`);
      assert(res.body.recommendation.nutrient_status.N === 'low', 'HTTP response expected low N');

      console.log(`  [PASS] Test 17: HTTP GET /api/farms/${farmId}/fertilizer verified.`);
      passed++;
    } catch (e) {
      console.log(`  [FAIL] Test 17: ${e.message}`);
      failed++;
    }

    // --- Test 18: Direct Endpoint Coexistence (POST /api/ai/fertilizer) ---
    try {
      const directRes = await makeHttpRequest(server, 'POST', '/api/ai/fertilizer', {
        N: 20.0,
        P: 40.0,
        K: 50.0,
        ph: 6.5,
        crop: 'Tomato',
        growth_stage: 'Vegetative',
        disease_status: { detected: false }
      });

      assert(directRes.status === 200, `Expected HTTP status 200, got ${directRes.status}`);
      assert(directRes.body.success === true, 'Direct endpoint missing success: true');
      assert(directRes.body.result.nutrient_status.N === 'low', 'Direct endpoint expected low N');

      console.log('  [PASS] Test 18: Direct endpoint POST /api/ai/fertilizer continues to function unchanged.');
      passed++;
    } catch (e) {
      console.log(`  [FAIL] Test 18: ${e.message}`);
      failed++;
    }

    // Cleanup
    if (validFarm && validFarm._id) {
      try {
        await farmService.deleteFarm(validFarm._id.toString());
      } catch (e) {}
    }

  } finally {
    if (cleanupAuthFixture) await cleanupAuthFixture();
    server.close();
    await disconnectDB();
  }

  console.log('\n' + '='.repeat(80));
  console.log(`FARM FERTILIZER INTEGRATION SUMMARY: ${passed} PASSED, ${failed} FAILED`);
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
