/**
 * AgriSense — Shared Farm State ↔ Market Intelligence Integration Suite (Milestone 18H).
 *
 * Verifies:
 * 1. End-to-end integration: Farm ID -> Shared Farm State -> Market Service -> Market Engine -> Intelligence Result.
 * 2. Exact crop mapping integrity (crop.name -> crop).
 * 3. Exact market mapping integrity (marketContext.market -> market).
 * 4. Exact state mapping integrity (marketContext.state || location.state -> state).
 * 5. District fallback context mapping integrity.
 * 6. Clean execution when optional market & state parameters are omitted.
 * 7. Graceful handling of unavailable market data (data_available: false, status: UNAVAILABLE).
 * 8. Missing required crop name validation error (INSUFFICIENT_FARM_DATA).
 * 9. Malformed farm ID error handling (INVALID_FARM_ID).
 * 10. Non-existent farm ID error handling (FARM_NOT_FOUND).
 * 11. Read-only integrity: zero mutation of Farm document.
 * 12. Provider/fallback metadata preservation.
 * 13. Live MongoDB Atlas connection & market engine execution verification.
 * 14. Express HTTP REST endpoint GET /api/farms/:farmId/market.
 * 15. Coexistence and non-regression of direct POST /api/ai/market endpoint.
 * 16. Score and trend calculation verification (Increasing trend -> score 75.0).
 * 17. Null/missing Shared Farm State guard.
 */

const http = require('http');
const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
process.env.JWT_SECRET ||= 'test-only-secret-generated-for-agrisense-m21';

const app = require('../server');
const farmService = require('../services/farmService');
const sharedFarmStateService = require('../services/sharedFarmStateService');
const farmMarketService = require('../services/farmMarketService');
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
  console.log('AGRISENSE — FARM ↔ MARKET INTELLIGENCE INTEGRATION SUITE (MILESTONE 18H)');
  console.log('='.repeat(80));

  const isAtlasConnected = await connectDB();
  console.log(`[Database Connection] Status: ${isAtlasConnected ? 'CONNECTED TO ATLAS' : 'MEMORY FALLBACK ACTIVE'}`);
  if (!isAtlasConnected) throw new Error('Authenticated Farm regression requires Atlas.');
  const authFixture = await createAuthFixture('market');
  testToken = authFixture.token;
  cleanupAuthFixture = injectFarmOwner(farmService, authFixture.user._id);

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  let validFarm = null;

  try {
    // --- Test 1: Valid Farm -> Market Pipeline ---
    try {
      const farmPayload = {
        name: 'Market Test Farm 18H',
        location: { state: 'Karnataka', district: 'Kolar', village: 'Mulbagal' },
        crop: { name: 'Tomato', growthStage: 'Harvesting' },
        marketContext: { market: 'Kolar', state: 'Karnataka', district: 'Kolar' }
      };

      validFarm = await farmService.createFarm(farmPayload);
      const farmId = validFarm._id.toString();

      const result = await farmMarketService.getMarketIntelligence(farmId);

      assert(result.success === true, 'Response missing success: true');
      assert(result.farmId === farmId, `farmId mismatch: expected ${farmId}, got ${result.farmId}`);
      assert(result.recommendation, 'Result missing recommendation object');
      assert(result.recommendation.crop === 'Tomato', `Expected crop Tomato, got ${result.recommendation.crop}`);
      assert(result.recommendation.market === 'Kolar', `Expected market Kolar, got ${result.recommendation.market}`);
      assert(result.recommendation.data_available === true, 'Expected data_available: true');
      assert(result.recommendation.current_price === 2300, `Expected current_price 2300, got ${result.recommendation.current_price}`);
      assert(result.recommendation.trend === 'Increasing', `Expected trend Increasing, got ${result.recommendation.trend}`);
      assert(result.recommendation.market_score === 75.0, `Expected market_score 75.0, got ${result.recommendation.market_score}`);

      console.log(`  [PASS] Test 1: Valid Farm -> Shared Farm State -> Market Engine (Crop: ${result.recommendation.crop}, Price: ${result.recommendation.current_price} INR/Quintal, Trend: ${result.recommendation.trend}, Score: ${result.recommendation.market_score}).`);
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
      const mappedInput = farmMarketService.extractMarketInput(sharedState);

      assert(mappedInput.crop === 'Tomato', `crop mapping failed: expected Tomato, got ${mappedInput.crop}`);
      console.log('  [PASS] Test 2: Crop name mapping verified.');
      passed++;
    } catch (e) {
      console.log(`  [FAIL] Test 2: ${e.message}`);
      failed++;
    }

    // --- Test 3: Exact Market Mapping ---
    try {
      assert(validFarm !== null, 'Prerequisite farm not created');
      const farmId = validFarm._id.toString();
      const sharedState = await sharedFarmStateService.getSharedFarmState(farmId);
      const mappedInput = farmMarketService.extractMarketInput(sharedState);

      assert(mappedInput.market === 'Kolar', `market mapping failed: expected Kolar, got ${mappedInput.market}`);
      console.log('  [PASS] Test 3: Market name mapping verified.');
      passed++;
    } catch (e) {
      console.log(`  [FAIL] Test 3: ${e.message}`);
      failed++;
    }

    // --- Test 4: Exact State Mapping (From marketContext or location.state Fallback) ---
    try {
      const stateFallbackFarm = await farmService.createFarm({
        name: 'State Fallback Farm',
        location: { state: 'Punjab', district: 'Ludhiana' },
        crop: { name: 'Wheat', growthStage: 'Maturation' }
      });
      const stateFallbackId = stateFallbackFarm._id.toString();

      const sharedState = await sharedFarmStateService.getSharedFarmState(stateFallbackId);
      const mappedInput = farmMarketService.extractMarketInput(sharedState);

      await farmService.deleteFarm(stateFallbackId);

      assert(mappedInput.crop === 'Wheat', `crop mapping failed: expected Wheat, got ${mappedInput.crop}`);
      assert(mappedInput.state === 'Punjab', `state fallback failed: expected Punjab, got ${mappedInput.state}`);
      assert(mappedInput.market === undefined, 'market parameter should be omitted when not provided');

      console.log('  [PASS] Test 4: State fallback mapping from location.state verified.');
      passed++;
    } catch (e) {
      console.log(`  [FAIL] Test 4: ${e.message}`);
      failed++;
    }

    // --- Test 5: Optional Parameters Omitted Cleanly ---
    try {
      const minimalFarm = await farmService.createFarm({
        name: 'Minimal Market Farm',
        location: { state: 'Uttar Pradesh', district: 'Agra' },
        crop: { name: 'Potato' }
      });
      const minimalId = minimalFarm._id.toString();

      const result = await farmMarketService.getMarketIntelligence(minimalId);
      await farmService.deleteFarm(minimalId);

      assert(result.engineInput.crop === 'Potato', `Expected crop Potato, got ${result.engineInput.crop}`);
      assert(result.recommendation.crop === 'Potato', `Expected result crop Potato, got ${result.recommendation.crop}`);
      assert(result.recommendation.data_available === true, 'Expected data_available: true for Potato');

      console.log('  [PASS] Test 5: Omitted optional parameters handled cleanly.');
      passed++;
    } catch (e) {
      console.log(`  [FAIL] Test 5: ${e.message}`);
      failed++;
    }

    // --- Test 6: Unavailable Market Data Handling ---
    try {
      const unknownCropFarm = await farmService.createFarm({
        name: 'Exotic Crop Farm',
        location: { state: 'Kerala', district: 'Idukki' },
        crop: { name: 'Dragonfruit' }
      });
      const unknownId = unknownCropFarm._id.toString();

      const result = await farmMarketService.getMarketIntelligence(unknownId);
      await farmService.deleteFarm(unknownId);

      assert(result.success === true, 'Response missing success: true');
      assert(result.recommendation.data_available === false, 'Expected data_available: false for unknown crop');
      assert(result.recommendation.status === 'UNAVAILABLE', `Expected status UNAVAILABLE, got ${result.recommendation.status}`);
      assert(result.recommendation.trend === 'Unavailable', `Expected trend Unavailable, got ${result.recommendation.trend}`);

      console.log('  [PASS] Test 6: Unavailable market data handled gracefully (data_available: false, status: UNAVAILABLE).');
      passed++;
    } catch (e) {
      console.log(`  [FAIL] Test 6: ${e.message}`);
      failed++;
    }

    // --- Test 7: Missing Required Crop Name ---
    try {
      const missingCropFarm = await farmService.createFarm({
        name: 'No Crop Farm',
        location: { state: 'Haryana', district: 'Karnal' },
        marketContext: { market: 'Karnal', state: 'Haryana' }
      });
      const missingCropId = missingCropFarm._id.toString();

      let caughtErr = null;
      try {
        await farmMarketService.getMarketIntelligence(missingCropId);
      } catch (err) {
        caughtErr = err;
      }

      await farmService.deleteFarm(missingCropId);

      assert(caughtErr !== null, 'Expected error for missing crop name');
      assert(caughtErr.code === 'INSUFFICIENT_FARM_DATA', `Expected INSUFFICIENT_FARM_DATA, got ${caughtErr.code}`);
      assert(caughtErr.missingFields && caughtErr.missingFields.includes('crop.name'), 'missingFields missing crop.name');

      console.log('  [PASS] Test 7: Missing crop name correctly rejected with INSUFFICIENT_FARM_DATA.');
      passed++;
    } catch (e) {
      console.log(`  [FAIL] Test 7: ${e.message}`);
      failed++;
    }

    // --- Test 8: Malformed Farm ID ---
    try {
      const invalidId = 'malformed-farm-id-999';
      let caughtErr = null;
      try {
        await farmMarketService.getMarketIntelligence(invalidId);
      } catch (err) {
        caughtErr = err;
      }

      assert(caughtErr !== null, 'Expected error for malformed farmId');
      assert(caughtErr.code === 'INVALID_FARM_ID', `Expected INVALID_FARM_ID, got ${caughtErr.code}`);

      console.log('  [PASS] Test 8: Malformed farmId correctly threw INVALID_FARM_ID.');
      passed++;
    } catch (e) {
      console.log(`  [FAIL] Test 8: ${e.message}`);
      failed++;
    }

    // --- Test 9: Non-existent Farm ID ---
    try {
      const nonExistentId = new mongoose.Types.ObjectId().toString();
      let caughtErr = null;
      try {
        await farmMarketService.getMarketIntelligence(nonExistentId);
      } catch (err) {
        caughtErr = err;
      }

      assert(caughtErr !== null, 'Expected error for non-existent farmId');
      assert(caughtErr.code === 'FARM_NOT_FOUND', `Expected FARM_NOT_FOUND, got ${caughtErr.code}`);

      console.log('  [PASS] Test 9: Non-existent farmId correctly threw FARM_NOT_FOUND.');
      passed++;
    } catch (e) {
      console.log(`  [FAIL] Test 9: ${e.message}`);
      failed++;
    }

    // --- Test 10: Read-Only Verification (No Farm Mutation) ---
    try {
      assert(validFarm !== null, 'Prerequisite farm not created');
      const farmId = validFarm._id.toString();

      const farmBefore = await farmService.getFarmById(farmId);
      const updatedAtBefore = farmBefore.updatedAt ? new Date(farmBefore.updatedAt).getTime() : null;

      await farmMarketService.getMarketIntelligence(farmId);

      const farmAfter = await farmService.getFarmById(farmId);
      const updatedAtAfter = farmAfter.updatedAt ? new Date(farmAfter.updatedAt).getTime() : null;

      assert(updatedAtBefore === updatedAtAfter, 'Farm updatedAt changed; read-only invariant violated');
      assert(farmBefore.name === farmAfter.name, 'Farm name mutated');

      console.log('  [PASS] Test 10: Read-only invariant verified (zero Farm document mutation).');
      passed++;
    } catch (e) {
      console.log(`  [FAIL] Test 10: ${e.message}`);
      failed++;
    }

    // --- Test 11: Provider / Fallback Metadata Preservation ---
    try {
      assert(validFarm !== null, 'Prerequisite farm not created');
      const farmId = validFarm._id.toString();
      const result = await farmMarketService.getMarketIntelligence(farmId);

      assert(result.recommendation.raw_source !== undefined, 'Result missing raw_source metadata field');
      assert(typeof result.recommendation.disclaimer === 'string', 'Result missing disclaimer string');

      console.log(`  [PASS] Test 11: Provider metadata preserved (raw_source: "${result.recommendation.raw_source}").`);
      passed++;
    } catch (e) {
      console.log(`  [FAIL] Test 11: ${e.message}`);
      failed++;
    }

    // --- Test 12: Trend and Score Calculation Verification ---
    try {
      assert(validFarm !== null, 'Prerequisite farm not created');
      const farmId = validFarm._id.toString();
      const result = await farmMarketService.getMarketIntelligence(farmId);

      assert(result.recommendation.trend === 'Increasing', `Expected trend Increasing, got ${result.recommendation.trend}`);
      assert(result.recommendation.market_score === 75.0, `Expected market_score 75.0, got ${result.recommendation.market_score}`);
      assert(result.recommendation.history_points === 3, `Expected 3 history points, got ${result.recommendation.history_points}`);

      console.log('  [PASS] Test 12: Price trend ("Increasing") and score calculation (75.0) verified.');
      passed++;
    } catch (e) {
      console.log(`  [FAIL] Test 12: ${e.message}`);
      failed++;
    }

    // --- Test 13: Real Atlas Integration ---
    if (isAtlasConnected) {
      try {
        const atlasFarmData = {
          name: 'Real Atlas Market Farm 18H',
          location: { state: 'Punjab', district: 'Ludhiana', village: 'Khanna' },
          crop: { name: 'Wheat', growthStage: 'Tillering' },
          marketContext: { market: 'Khanna', state: 'Punjab', district: 'Ludhiana' }
        };

        const atlasFarm = await farmService.createFarm(atlasFarmData);
        const atlasFarmId = atlasFarm._id.toString();

        const atlasResult = await farmMarketService.getMarketIntelligence(atlasFarmId);

        assert(atlasResult.success === true, 'Atlas request failed');
        assert(atlasResult.recommendation.crop === 'Wheat', 'Atlas crop Wheat expected');
        assert(atlasResult.recommendation.market === 'Khanna', 'Atlas market Khanna expected');
        assert(atlasResult.recommendation.data_available === true, 'Atlas data_available expected true');

        await farmService.deleteFarm(atlasFarmId);

        console.log(`  [PASS] Test 13 (REAL ATLAS): Real Atlas Farm -> Shared Farm State -> Market Engine executed successfully (Price: ${atlasResult.recommendation.current_price} INR/Quintal, Market: ${atlasResult.recommendation.market}).`);
        passed++;
      } catch (e) {
        console.log(`  [FAIL] Test 13 (REAL ATLAS): ${e.message}`);
        failed++;
      }
    } else {
      console.log('  [SKIP] Test 13 (REAL ATLAS): Skipped live Atlas test (database operating in memory fallback).');
    }

    // --- Test 14: HTTP REST Endpoint GET /api/farms/:farmId/market ---
    try {
      assert(validFarm !== null, 'Prerequisite farm not created');
      const farmId = validFarm._id.toString();

      const res = await makeHttpRequest(server, 'GET', `/api/farms/${farmId}/market`);

      assert(res.status === 200, `Expected HTTP 200, got ${res.status}`);
      assert(res.body.success === true, 'HTTP response missing success: true');
      assert(res.body.farmId === farmId, `HTTP response farmId mismatch: expected ${farmId}, got ${res.body.farmId}`);
      assert(res.body.recommendation.crop === 'Tomato', 'HTTP response expected crop Tomato');
      assert(res.body.recommendation.current_price === 2300, 'HTTP response expected current_price 2300');

      console.log(`  [PASS] Test 14: HTTP GET /api/farms/${farmId}/market verified.`);
      passed++;
    } catch (e) {
      console.log(`  [FAIL] Test 14: ${e.message}`);
      failed++;
    }

    // --- Test 15: Direct Endpoint Coexistence (POST /api/ai/market) ---
    try {
      const directRes = await makeHttpRequest(server, 'POST', '/api/ai/market', {
        crop: 'Tomato',
        market: 'Kolar',
        state: 'Karnataka'
      });

      assert(directRes.status === 200, `Expected HTTP status 200, got ${directRes.status}`);
      assert(directRes.body.success === true, 'Direct endpoint missing success: true');
      assert(directRes.body.result.current_price === 2300, 'Direct endpoint expected current_price 2300');

      console.log('  [PASS] Test 15: Direct endpoint POST /api/ai/market continues to function unchanged.');
      passed++;
    } catch (e) {
      console.log(`  [FAIL] Test 15: ${e.message}`);
      failed++;
    }

    // --- Test 16: Null Shared Farm State Guard ---
    try {
      let caughtErr = null;
      try {
        farmMarketService.extractMarketInput(null);
      } catch (err) {
        caughtErr = err;
      }

      assert(caughtErr !== null, 'Expected error for null sharedState');
      assert(caughtErr.code === 'INSUFFICIENT_FARM_DATA', `Expected INSUFFICIENT_FARM_DATA, got ${caughtErr.code}`);

      console.log('  [PASS] Test 16: Null Shared Farm State correctly rejected.');
      passed++;
    } catch (e) {
      console.log(`  [FAIL] Test 16: ${e.message}`);
      failed++;
    }

    // --- Test 17: HTTP GET /api/farms/:farmId/market with Omitted Optional Fields ---
    try {
      const optionalFarm = await farmService.createFarm({
        name: 'Potato Agra Farm',
        location: { state: 'Uttar Pradesh', district: 'Agra' },
        crop: { name: 'Potato' }
      });
      const optionalId = optionalFarm._id.toString();

      const res = await makeHttpRequest(server, 'GET', `/api/farms/${optionalId}/market`);
      await farmService.deleteFarm(optionalId);

      assert(res.status === 200, `Expected HTTP 200, got ${res.status}`);
      assert(res.body.success === true, 'HTTP response missing success: true');
      assert(res.body.recommendation.crop === 'Potato', 'HTTP response expected crop Potato');
      assert(res.body.recommendation.current_price === 1250, `Expected current_price 1250, got ${res.body.recommendation.current_price}`);

      console.log('  [PASS] Test 17: HTTP GET /api/farms/:farmId/market with omitted optional marketContext verified.');
      passed++;
    } catch (e) {
      console.log(`  [FAIL] Test 17: ${e.message}`);
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
  console.log(`FARM MARKET INTELLIGENCE INTEGRATION SUMMARY: ${passed} PASSED, ${failed} FAILED`);
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
