/**
 * AgriSense — Shared Farm State Service Verification Suite (Milestone 18B).
 *
 * Verifies:
 * 1. Retrieval of Shared Farm State for an existing farm.
 * 2. Proper handling & error code for missing farmId (FARM_NOT_FOUND).
 * 3. Proper handling & error code for invalid farmId format (INVALID_FARM_ID).
 * 4. Field mapping integrity across location, soil, crop, fieldConditions, weather, diseaseContext, marketContext.
 * 5. No accidental data loss or missing keys in canonical Shared Farm State structure.
 * 6. HTTP REST endpoint GET /api/farms/:farmId/shared-state.
 * 7. Real MongoDB Atlas integration test verifying SharedFarmStateService over live Atlas connection.
 */

const http = require('http');
const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const app = require('../server');
const farmService = require('../services/farmService');
const sharedFarmStateService = require('../services/sharedFarmStateService');
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

async function runSharedFarmStateSuite() {
  console.log('='.repeat(80));
  console.log('AGRISENSE — SHARED FARM STATE SERVICE VERIFICATION SUITE (MILESTONE 18B)');
  console.log('='.repeat(80));

  // Connect to DB (Atlas if available, or memory store fallback)
  const isAtlasConnected = await connectDB();
  console.log(`[Database Connection] Status: ${isAtlasConnected ? 'CONNECTED TO ATLAS' : 'MEMORY FALLBACK ACTIVE'}`);

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  try {
    // --- Test 1: Existing Farm Retrieval & Canonical Structure ---
    let createdFarm = null;
    try {
      const samplePayload = {
        name: 'Shared State Test Farm',
        location: {
          state: 'Tamil Nadu',
          district: 'Coimbatore',
          village: 'Pollachi',
          latitude: 10.66,
          longitude: 77.01
        },
        soil: {
          nitrogen: 85,
          phosphorus: 40,
          potassium: 50,
          ph: 6.8
        },
        crop: {
          name: 'Coconut',
          growthStage: 'flowering'
        },
        fieldConditions: {
          soilMoisture: 45.5
        },
        weather: {
          temperature: 30.2,
          humidity: 70,
          rainfall: 15,
          recentRainfall: 5,
          rainProbability: 20,
          expectedRainfall: 0
        },
        diseaseContext: {
          detected: false,
          disease: null,
          confidence: null
        },
        marketContext: {
          market: 'Pollachi Mandi',
          state: 'Tamil Nadu',
          district: 'Coimbatore'
        }
      };

      createdFarm = await farmService.createFarm(samplePayload);
      const farmId = createdFarm._id.toString();

      const sharedState = await sharedFarmStateService.getSharedFarmState(farmId);

      assert(sharedState !== null && typeof sharedState === 'object', 'Returned state is not an object');
      assert(sharedState.farmId === farmId, `farmId mismatch: expected ${farmId}, got ${sharedState.farmId}`);
      assert(sharedState.name === 'Shared State Test Farm', 'Name mismatch');

      console.log(`  [PASS] Test 1: Created farm & retrieved Shared Farm State for ID: ${farmId}`);
      passed++;
    } catch (e) {
      console.log(`  [FAIL] Test 1: ${e.message}`);
      failed++;
    }

    // --- Test 2: Missing Farm (FARM_NOT_FOUND) ---
    try {
      const unknownId = new mongoose.Types.ObjectId().toString();
      let caughtErr = null;
      try {
        await sharedFarmStateService.getSharedFarmState(unknownId);
      } catch (err) {
        caughtErr = err;
      }

      assert(caughtErr !== null, 'Expected error for non-existent farmId, but none was thrown');
      assert(caughtErr.code === 'FARM_NOT_FOUND', `Expected code 'FARM_NOT_FOUND', got '${caughtErr.code}'`);
      console.log(`  [PASS] Test 2: Missing farmId correctly threw FARM_NOT_FOUND.`);
      passed++;
    } catch (e) {
      console.log(`  [FAIL] Test 2: ${e.message}`);
      failed++;
    }

    // --- Test 3: Invalid Farm ID Format (INVALID_FARM_ID) ---
    try {
      const invalidId = 'not-a-valid-object-id';
      let caughtErr = null;
      try {
        await sharedFarmStateService.getSharedFarmState(invalidId);
      } catch (err) {
        caughtErr = err;
      }

      assert(caughtErr !== null, 'Expected error for malformed farmId, but none was thrown');
      assert(caughtErr.code === 'INVALID_FARM_ID', `Expected code 'INVALID_FARM_ID', got '${caughtErr.code}'`);
      console.log(`  [PASS] Test 3: Malformed farmId correctly threw INVALID_FARM_ID.`);
      passed++;
    } catch (e) {
      console.log(`  [FAIL] Test 3: ${e.message}`);
      failed++;
    }

    // --- Test 4: Field Mapping Integrity & Complete Schema Coverage ---
    try {
      assert(createdFarm !== null, 'Prerequisite farm not created');
      const farmId = createdFarm._id.toString();
      const sharedState = await sharedFarmStateService.getSharedFarmState(farmId);

      // Verify soil mapping: nitrogen -> N, phosphorus -> P, potassium -> K, ph -> ph
      assert(sharedState.soil.N === 85, `Soil N mapping error: ${sharedState.soil.N}`);
      assert(sharedState.soil.P === 40, `Soil P mapping error: ${sharedState.soil.P}`);
      assert(sharedState.soil.K === 50, `Soil K mapping error: ${sharedState.soil.K}`);
      assert(sharedState.soil.ph === 6.8, `Soil ph mapping error: ${sharedState.soil.ph}`);

      // Verify location
      assert(sharedState.location.state === 'Tamil Nadu', 'Location state error');
      assert(sharedState.location.district === 'Coimbatore', 'Location district error');

      // Verify crop
      assert(sharedState.crop.name === 'Coconut', 'Crop name error');
      assert(sharedState.crop.growthStage === 'flowering', 'Crop growthStage error');

      // Verify fieldConditions
      assert(sharedState.fieldConditions.soilMoisture === 45.5, 'Field conditions soilMoisture error');

      // Verify weather
      assert(sharedState.weather.temperature === 30.2, 'Weather temperature error');
      assert(sharedState.weather.humidity === 70, 'Weather humidity error');

      // Verify diseaseContext & marketContext
      assert(sharedState.diseaseContext.detected === false, 'Disease context error');
      assert(sharedState.marketContext.market === 'Pollachi Mandi', 'Market context error');

      console.log(`  [PASS] Test 4: Complete field mapping integrity verified.`);
      passed++;
    } catch (e) {
      console.log(`  [FAIL] Test 4: ${e.message}`);
      failed++;
    }

    // --- Test 5: No Accidental Data Loss (Key Contract Completeness) ---
    try {
      assert(createdFarm !== null, 'Prerequisite farm not created');
      const farmId = createdFarm._id.toString();
      const sharedState = await sharedFarmStateService.getSharedFarmState(farmId);

      const requiredTopKeys = [
        'farmId', 'name', 'location', 'soil', 'crop',
        'fieldConditions', 'weather', 'diseaseContext', 'marketContext', 'lastUpdated'
      ];

      for (const key of requiredTopKeys) {
        assert(Object.prototype.hasOwnProperty.call(sharedState, key), `Missing top-level key: ${key}`);
      }

      console.log(`  [PASS] Test 5: All required canonical keys verified present without data loss.`);
      passed++;
    } catch (e) {
      console.log(`  [FAIL] Test 5: ${e.message}`);
      failed++;
    }

    // --- Test 6: HTTP REST Endpoint GET /api/farms/:farmId/shared-state ---
    try {
      assert(createdFarm !== null, 'Prerequisite farm not created');
      const farmId = createdFarm._id.toString();

      const res = await makeHttpRequest(server, 'GET', `/api/farms/${farmId}/shared-state`);
      assert(res.status === 200, `Expected HTTP 200, got ${res.status}`);
      assert(res.body.success === true, 'Response missing success: true');
      assert(res.body.sharedFarmState, 'Response missing sharedFarmState object');
      assert(res.body.sharedFarmState.farmId === farmId, 'HTTP response farmId mismatch');
      assert(res.body.sharedFarmState.soil.N === 85, 'HTTP response soil.N mismatch');

      console.log(`  [PASS] Test 6: HTTP REST endpoint GET /api/farms/${farmId}/shared-state verified.`);
      passed++;
    } catch (e) {
      console.log(`  [FAIL] Test 6: ${e.message}`);
      failed++;
    }

    // --- Test 7: Real MongoDB Atlas Integration Test ---
    if (isAtlasConnected) {
      try {
        const atlasFarmData = {
          name: 'Real Atlas Shared State Farm',
          location: { state: 'Maharashtra', district: 'Nashik', village: 'Niphad' },
          soil: { nitrogen: 95, phosphorus: 50, potassium: 60, ph: 7.2 },
          crop: { name: 'Grapes', growthStage: 'fruiting' }
        };

        const atlasFarm = await farmService.createFarm(atlasFarmData);
        const atlasFarmId = atlasFarm._id.toString();

        // Verify retrieval directly via SharedFarmStateService over live Atlas connection
        const atlasSharedState = await sharedFarmStateService.getSharedFarmState(atlasFarmId);

        assert(atlasSharedState.farmId === atlasFarmId, 'Atlas farmId mismatch');
        assert(atlasSharedState.name === 'Real Atlas Shared State Farm', 'Atlas name mismatch');
        assert(atlasSharedState.soil.N === 95, 'Atlas soil N mismatch');
        assert(atlasSharedState.crop.name === 'Grapes', 'Atlas crop name mismatch');

        // Cleanup
        await farmService.deleteFarm(atlasFarmId);

        console.log(`  [PASS] Test 7 (REAL ATLAS): SharedFarmStateService verified against live MongoDB Atlas.`);
        passed++;
      } catch (e) {
        console.log(`  [FAIL] Test 7 (REAL ATLAS): ${e.message}`);
        failed++;
      }
    } else {
      console.log(`  [SKIP] Test 7 (REAL ATLAS): Skipped live Atlas test (database operating in memory fallback).`);
    }

    // Cleanup Test 1 created farm
    if (createdFarm && createdFarm._id) {
      try {
        await farmService.deleteFarm(createdFarm._id.toString());
      } catch (e) {
        // Ignore cleanup error
      }
    }

  } finally {
    server.close();
    await disconnectDB();
  }

  console.log('\n' + '='.repeat(80));
  console.log(`SHARED FARM STATE SERVICE SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('='.repeat(80));

  if (failed > 0) {
    process.exit(1);
  }
}

if (require.main === module) {
  runSharedFarmStateSuite().catch((err) => {
    console.error('Fatal suite error:', err);
    process.exit(1);
  });
}

module.exports = runSharedFarmStateSuite;
