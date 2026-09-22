/**
 * AgriSense — Shared Farm State & MongoDB Test Suite (Milestone 18).
 *
 * Tests:
 * 1. Valid farm creation & schema validation via HTTP POST.
 * 2. Missing required fields (name, location) rejected by Mongoose schema.
 * 3. Invalid soil pH rejected (pH < 0 or > 14).
 * 4. Invalid soil moisture / humidity / rain probability rejected (> 100 or < 0).
 * 5. Get existing farm via HTTP GET.
 * 6. Get nonexistent farm returns 404 with FARM_NOT_FOUND.
 * 7. Update farm (PATCH/PUT) with partial update validation via HTTP.
 * 8. Delete farm via HTTP DELETE.
 * 9. Malformed MongoDB ID handled cleanly with INVALID_FARM_ID.
 * 10. Complete Shared Farm State can be stored, retrieved, and transformed.
 */

const http = require('http');
const mongoose = require('mongoose');
const app = require('../server');
const Farm = require('../db/models/Farm');
const farmService = require('../services/farmService');
const { connectDB, disconnectDB } = require('../config/db');

let passed = 0;
let failed = 0;
const total = 10;

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

// Helper to make local HTTP requests to Express app
function makeHttpRequest(server, method, path, body = null) {
  return new Promise((resolve, reject) => {
    const address = server.address();
    const port = address.port;
    const bodyStr = body ? JSON.stringify(body) : null;

    const options = {
      hostname: '127.0.0.1',
      port: port,
      path: path,
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

async function runTests() {
  console.log('='.repeat(80));
  console.log('AGRISENSE — SHARED FARM STATE & MONGODB TEST SUITE (MILESTONE 18)');
  console.log('='.repeat(80));

  // Check if live MongoDB connection is available
  const isDbLive = await connectDB();
  if (!isDbLive) {
    farmService.setMemoryMode(true);
    console.log('[Test Suite] MongoDB Mode: IN-MEMORY REPOSITORY (Validating Mongoose models & HTTP endpoints)');
  } else {
    console.log('[Test Suite] MongoDB Mode: LIVE MONGODB CONNECTION');
  }

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  let createdFarmId = null;

  try {
    // Test 1: Valid farm creation & schema validation via HTTP POST
    try {
      const validFarmData = {
        name: 'Cauvery Green Valley Farm',
        location: {
          state: 'Karnataka',
          district: 'Kolar',
          village: 'Mulbagal',
          latitude: 13.16,
          longitude: 78.39
        },
        soil: {
          nitrogen: 90.0,
          phosphorus: 42.0,
          potassium: 43.0,
          ph: 6.5
        },
        crop: {
          name: 'Tomato',
          plantingDate: '2026-08-01',
          growthStage: 'vegetative'
        },
        fieldConditions: {
          soilMoisture: 35.0
        },
        weather: {
          temperature: 28.5,
          humidity: 65.0,
          rainfall: 12.0,
          recentRainfall: 25.0,
          rainProbability: 20.0,
          expectedRainfall: 2.0
        },
        diseaseContext: {
          detected: false,
          disease: null,
          confidence: 0.0
        },
        marketContext: {
          market: 'Kolar',
          state: 'Karnataka',
          district: 'Kolar'
        }
      };

      const res = await makeHttpRequest(server, 'POST', '/api/farms', validFarmData);
      assert(res.status === 201, `Expected HTTP 201, got ${res.status}`);
      assert(res.body.success === true, 'Response missing success: true');
      assert(res.body.farm.name === 'Cauvery Green Valley Farm', 'Farm name mismatch');
      assert(res.body.farm._id, 'Farm document missing _id');
      assert(res.body.sharedFarmState, 'Missing sharedFarmState in response');
      assert(res.body.sharedFarmState.soil.N === 90.0, 'sharedFarmState N mismatch');

      createdFarmId = res.body.farm._id;

      console.log('  [PASS] Test 1: HTTP POST /api/farms created farm & validated schema successfully.');
      passed++;
    } catch (e) {
      console.log(`  [FAIL] Test 1: ${e.message}`);
      failed++;
    }

    // Test 2: Invalid/missing required data rejected
    try {
      const invalidData = {
        location: { village: 'Nowhere' } // Missing name, state, district
      };
      const res = await makeHttpRequest(server, 'POST', '/api/farms', invalidData);
      assert(res.status === 400, `Expected HTTP 400, got ${res.status}`);
      assert(res.body.success === false, 'Expected success: false');
      assert(res.body.error.code === 'VALIDATION_ERROR', `Expected VALIDATION_ERROR, got ${res.body.error.code}`);
      console.log('  [PASS] Test 2: Missing required name and location rejected with HTTP 400 VALIDATION_ERROR.');
      passed++;
    } catch (e) {
      console.log(`  [FAIL] Test 2: ${e.message}`);
      failed++;
    }

    // Test 3: Invalid pH rejected (< 0 or > 14)
    try {
      const badPhData = {
        name: 'High pH Farm',
        location: { state: 'Punjab', district: 'Ludhiana' },
        soil: { ph: 15.0 } // Invalid > 14
      };
      const res = await makeHttpRequest(server, 'POST', '/api/farms', badPhData);
      assert(res.status === 400, `Expected HTTP 400, got ${res.status}`);
      assert(res.body.error.code === 'VALIDATION_ERROR', `Expected VALIDATION_ERROR, got ${res.body.error.code}`);
      console.log('  [PASS] Test 3: Invalid pH (15.0 > 14) rejected by schema validation.');
      passed++;
    } catch (e) {
      console.log(`  [FAIL] Test 3: ${e.message}`);
      failed++;
    }

    // Test 4: Invalid humidity / moisture / rain probability rejected (> 100 or < 0)
    try {
      const badEnvData = {
        name: 'Invalid Env Farm',
        location: { state: 'Tamil Nadu', district: 'Madurai' },
        fieldConditions: { soilMoisture: 120.0 }, // Invalid > 100
        weather: {
          humidity: 150.0, // Invalid > 100
          rainProbability: -10.0 // Invalid < 0
        }
      };
      const res = await makeHttpRequest(server, 'POST', '/api/farms', badEnvData);
      assert(res.status === 400, `Expected HTTP 400, got ${res.status}`);
      assert(res.body.error.code === 'VALIDATION_ERROR', `Expected VALIDATION_ERROR, got ${res.body.error.code}`);
      console.log('  [PASS] Test 4: Physical bounds validation (moisture, humidity, rain probability) enforced.');
      passed++;
    } catch (e) {
      console.log(`  [FAIL] Test 4: ${e.message}`);
      failed++;
    }

    // Test 5: Get existing farm
    try {
      const res = await makeHttpRequest(server, 'GET', `/api/farms/${createdFarmId}`);
      assert(res.status === 200, `Expected HTTP 200, got ${res.status}`);
      assert(res.body.success === true, 'Response missing success: true');
      assert(res.body.farm.name === 'Cauvery Green Valley Farm', 'Retrieved farm name mismatch');
      assert(res.body.sharedFarmState.soil.ph === 6.5, 'pH mismatch');
      console.log('  [PASS] Test 5: GET /api/farms/:farmId retrieved existing farm document successfully.');
      passed++;
    } catch (e) {
      console.log(`  [FAIL] Test 5: ${e.message}`);
      failed++;
    }

    // Test 6: Get nonexistent farm returns 404
    try {
      const randomObjectId = new mongoose.Types.ObjectId().toString();
      const res = await makeHttpRequest(server, 'GET', `/api/farms/${randomObjectId}`);
      assert(res.status === 404, `Expected HTTP 404, got ${res.status}`);
      assert(res.body.success === false, 'Expected success: false');
      assert(res.body.error.code === 'FARM_NOT_FOUND', `Expected FARM_NOT_FOUND, got ${res.body.error.code}`);
      console.log('  [PASS] Test 6: GET nonexistent farm returned HTTP 404 with FARM_NOT_FOUND.');
      passed++;
    } catch (e) {
      console.log(`  [FAIL] Test 6: ${e.message}`);
      failed++;
    }

    // Test 7: Update farm (PATCH)
    try {
      const updatePayload = {
        fieldConditions: { soilMoisture: 22.0 },
        crop: { growthStage: 'flowering' }
      };

      const res = await makeHttpRequest(server, 'PATCH', `/api/farms/${createdFarmId}`, updatePayload);
      assert(res.status === 200, `Expected HTTP 200, got ${res.status}`);
      assert(res.body.farm.fieldConditions.soilMoisture === 22.0, 'soilMoisture update failed');
      assert(res.body.farm.crop.growthStage === 'flowering', 'growthStage update failed');
      assert(res.body.farm.name === 'Cauvery Green Valley Farm', 'Unmodified name should be preserved');
      console.log('  [PASS] Test 7: PATCH /api/farms/:farmId successfully updated partial state.');
      passed++;
    } catch (e) {
      console.log(`  [FAIL] Test 7: ${e.message}`);
      failed++;
    }

    // Test 8: Delete farm
    try {
      const res = await makeHttpRequest(server, 'DELETE', `/api/farms/${createdFarmId}`);
      assert(res.status === 200, `Expected HTTP 200, got ${res.status}`);
      assert(res.body.result.deleted === true, 'Expected deleted: true');

      // Verify it is no longer retrievable
      const checkRes = await makeHttpRequest(server, 'GET', `/api/farms/${createdFarmId}`);
      assert(checkRes.status === 404, `Expected 404 after deletion, got ${checkRes.status}`);
      console.log('  [PASS] Test 8: DELETE /api/farms/:farmId successfully deleted farm.');
      passed++;
    } catch (e) {
      console.log(`  [FAIL] Test 8: ${e.message}`);
      failed++;
    }

    // Test 9: Malformed MongoDB ID handled cleanly
    try {
      const res = await makeHttpRequest(server, 'GET', '/api/farms/invalid-id-12345');
      assert(res.status === 400, `Expected HTTP 400, got ${res.status}`);
      assert(res.body.error.code === 'INVALID_FARM_ID', `Expected INVALID_FARM_ID, got ${res.body.error.code}`);
      console.log('  [PASS] Test 9: Malformed MongoDB ID returned HTTP 400 with INVALID_FARM_ID.');
      passed++;
    } catch (e) {
      console.log(`  [FAIL] Test 9: ${e.message}`);
      failed++;
    }

    // Test 10: Complete Shared Farm State can be stored and retrieved
    try {
      const completeFarmData = {
        name: 'Narmada Bio Farm',
        location: {
          state: 'Madhya Pradesh',
          district: 'Hoshangabad',
          village: 'Pipariya',
          latitude: 22.75,
          longitude: 78.35
        },
        soil: {
          nitrogen: 85.0,
          phosphorus: 38.0,
          potassium: 40.0,
          ph: 6.8
        },
        crop: {
          name: 'Wheat',
          plantingDate: '2026-11-01',
          growthStage: 'vegetative'
        },
        fieldConditions: {
          soilMoisture: 28.0
        },
        weather: {
          temperature: 22.0,
          humidity: 50.0,
          rainfall: 0.0,
          recentRainfall: 5.0,
          rainProbability: 10.0,
          expectedRainfall: 0.0
        },
        diseaseContext: {
          detected: false,
          disease: null,
          confidence: 0.0
        },
        marketContext: {
          market: 'Khanna',
          state: 'Punjab',
          district: 'Ludhiana'
        }
      };

      const res = await makeHttpRequest(server, 'POST', '/api/farms', completeFarmData);
      assert(res.status === 201, `Expected HTTP 201, got ${res.status}`);

      const shared = res.body.sharedFarmState;
      assert(shared.name === 'Narmada Bio Farm', 'Shared state name mismatch');
      assert(shared.soil.N === 85.0, 'Soil N mismatch');
      assert(shared.soil.ph === 6.8, 'Soil pH mismatch');
      assert(shared.crop.name === 'Wheat', 'Crop name mismatch');
      assert(shared.fieldConditions.soilMoisture === 28.0, 'Soil moisture mismatch');
      assert(shared.weather.temperature === 22.0, 'Weather temp mismatch');

      console.log('  [PASS] Test 10: Complete Shared Farm State stored & transformed for AI engines.');
      passed++;
    } catch (e) {
      console.log(`  [FAIL] Test 10: ${e.message}`);
      failed++;
    }

  } finally {
    server.close();
    await disconnectDB();
  }

  console.log('='.repeat(80));
  console.log(`TEST SUMMARY: ${passed}/${total} PASSED, ${failed}/${total} FAILED`);
  console.log('='.repeat(80));

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Unhandled test suite error:', err);
  process.exit(1);
});
