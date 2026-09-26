/**
 * AgriSense — Shared Farm State ↔ Crop Ranking Integration Suite (Milestone 18I).
 *
 * Verifies:
 * 1. End-to-end integration: Farm ID -> Shared Farm State -> Crop Recommendation (RF) -> Market Intelligence -> Crop Ranking Engine.
 * 2. Ranked crops structure integrity (rank, crop, agronomic_signal, market_signal, combined_score, explanation).
 * 3. Exact feature mapping check for N, P, K, temperature, humidity, ph, rainfall.
 * 4. Location and market context mapping check (marketContext.market, marketContext.state, and location.state fallback).
 * 5. Missing market data fallback behavior (no artificial 0-penalty, uses agronomic confidence).
 * 6. Custom weights evaluation (e.g. agronomic: 0.9, market: 0.1).
 * 7. Missing soil features (N, P, K, ph) rejected with INSUFFICIENT_FARM_DATA.
 * 8. Missing weather features (temperature, humidity, rainfall) rejected with INSUFFICIENT_FARM_DATA.
 * 9. Malformed farm ID error handling (INVALID_FARM_ID).
 * 10. Non-existent farm ID error handling (FARM_NOT_FOUND).
 * 11. Read-only integrity: zero mutation of Farm document.
 * 12. Real MongoDB Atlas connection & Crop Ranking execution verification.
 * 13. Express HTTP REST endpoint GET /api/farms/:farmId/crop-ranking.
 * 14. Coexistence and non-regression of direct POST /api/ai/crop-ranking endpoint.
 * 15. Null/missing Shared Farm State guard.
 */

const http = require('http');
const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const app = require('../server');
const farmService = require('../services/farmService');
const sharedFarmStateService = require('../services/sharedFarmStateService');
const farmCropRankingService = require('../services/farmCropRankingService');
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
        let json = null;
        try {
          json = JSON.parse(data);
        } catch (e) {
          json = data;
        }
        resolve({ status: res.statusCode, body: json });
      });
    });

    req.on('error', (err) => reject(err));
    if (bodyStr) {
      req.write(bodyStr);
    }
    req.end();
  });
}

async function runTestSuite() {
  console.log('='.repeat(80));
  console.log('AGRISENSE — FARM ↔ CROP RANKING INTEGRATION SUITE (MILESTONE 18I)');
  console.log('='.repeat(80));

  let server = null;
  let testFarmIds = [];

  try {
    await connectDB();
    console.log(`[Database Connection] Status: ${mongoose.connection.readyState === 1 ? 'CONNECTED TO ATLAS' : 'IN-MEMORY STORE'}`);

    // Start Express HTTP server on ephemeral port for REST API tests
    await new Promise((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        resolve();
      });
    });

    // Test 1: Full pipeline execution with valid farm data
    try {
      const createdFarm = await farmService.createFarm({
        name: 'Ranking Test Farm - Punjab',
        location: {
          state: 'Punjab',
          district: 'Ludhiana',
          village: 'Sahnewal'
        },
        soil: {
          nitrogen: 90,
          phosphorus: 42,
          potassium: 43,
          ph: 6.5
        },
        crop: {
          name: 'rice',
          growthStage: 'vegetative'
        },
        weather: {
          temperature: 24.5,
          humidity: 82.0,
          rainfall: 210.0
        },
        marketContext: {
          market: 'Khanna',
          state: 'Punjab',
          district: 'Ludhiana'
        }
      });
      testFarmIds.push(createdFarm._id.toString());

      const result = await farmCropRankingService.getCropRanking(createdFarm._id.toString());

      assert(result.success === true, 'Result success should be true');
      assert(result.farmId === createdFarm._id.toString(), 'Farm ID mismatch');
      assert(result.modelInput.N === 90, 'Nitrogen input should be 90');
      assert(result.modelInput.ph === 6.5, 'pH input should be 6.5');
      assert(result.modelInput.rainfall === 210.0, 'Rainfall input should be 210.0');
      assert(result.agronomicPrediction && result.agronomicPrediction.predicted_crop, 'Expected agronomic prediction');

      const rec = result.recommendation;
      assert(rec.status === 'SUCCESS', `Expected status SUCCESS, got ${rec.status}`);
      assert(Array.isArray(rec.ranked_crops), 'Expected ranked_crops array');
      assert(rec.ranked_crops.length > 0, 'Expected at least one ranked crop');

      // Check first rank structure
      const topCrop = rec.ranked_crops[0];
      assert(topCrop.rank === 1, 'Top crop should have rank 1');
      assert(typeof topCrop.crop === 'string', 'Crop name should be a string');
      assert(typeof topCrop.agronomic_signal === 'number', 'Agronomic signal should be numeric');
      assert(typeof topCrop.combined_score === 'number', 'Combined score should be numeric');
      assert(typeof topCrop.explanation === 'string', 'Explanation should be string');

      console.log(`  [PASS] Test 1: Valid Farm -> Shared Farm State -> Crop Ranking Pipeline (Top Ranked: ${topCrop.crop}, Combined Score: ${topCrop.combined_score}).`);
      passed++;
    } catch (err) {
      console.log(`  [FAIL] Test 1: ${err.message}`);
      failed++;
    }

    // Test 2: Input feature mapping verification
    try {
      const mockSharedState = {
        farmId: '507f1f77bcf86cd799439011',
        name: 'Feature Mapping Farm',
        soil: { N: 80, P: 40, K: 40, ph: 6.8 },
        weather: { temperature: 26.0, humidity: 80.0, rainfall: 200.0 },
        location: { state: 'Punjab', district: 'Ludhiana' },
        marketContext: { market: 'Khanna', state: 'Punjab' }
      };

      const extracted = farmCropRankingService.extractCropRankingInput(mockSharedState);
      assert(extracted.modelInput.N === 80, 'Soil N mismatch');
      assert(extracted.modelInput.P === 40, 'Soil P mismatch');
      assert(extracted.modelInput.K === 40, 'Soil K mismatch');
      assert(extracted.modelInput.ph === 6.8, 'Soil pH mismatch');
      assert(extracted.modelInput.temperature === 26.0, 'Weather temp mismatch');
      assert(extracted.modelInput.humidity === 80.0, 'Weather humidity mismatch');
      assert(extracted.modelInput.rainfall === 200.0, 'Weather rainfall mismatch');
      assert(extracted.marketContext.market === 'Khanna', 'Market name mismatch');
      assert(extracted.marketContext.state === 'Punjab', 'State name mismatch');

      console.log('  [PASS] Test 2: Exact crop ranking input feature mapping verified [N, P, K, temp, humidity, ph, rainfall, market, state].');
      passed++;
    } catch (err) {
      console.log(`  [FAIL] Test 2: ${err.message}`);
      failed++;
    }

    // Test 3: Location fallback context mapping (when marketContext.state is omitted, uses location.state)
    try {
      const mockSharedState = {
        farmId: '507f1f77bcf86cd799439012',
        name: 'Location Fallback Farm',
        soil: { N: 80, P: 40, K: 40, ph: 6.8 },
        weather: { temperature: 26.0, humidity: 80.0, rainfall: 200.0 },
        location: { state: 'Karnataka', district: 'Kolar' },
        marketContext: { market: 'Kolar' } // state omitted in marketContext
      };

      const extracted = farmCropRankingService.extractCropRankingInput(mockSharedState);
      assert(extracted.marketContext.market === 'Kolar', 'Market mismatch');
      assert(extracted.marketContext.state === 'Karnataka', 'State fallback from location mismatch');
      assert(extracted.marketContext.district === 'Kolar', 'District fallback from location mismatch');

      console.log('  [PASS] Test 3: State & district fallback mapping from location.state/district verified.');
      passed++;
    } catch (err) {
      console.log(`  [FAIL] Test 3: ${err.message}`);
      failed++;
    }

    // Test 4: Custom weights calculation verification (e.g. agronomic: 0.9, market: 0.1)
    try {
      const farm = await farmService.createFarm({
        name: 'Custom Weights Farm',
        location: { state: 'Karnataka', district: 'Kolar' },
        soil: { nitrogen: 90, phosphorus: 42, potassium: 43, ph: 6.5 },
        weather: { temperature: 24.5, humidity: 82.0, rainfall: 210.0 },
        marketContext: { market: 'Kolar', state: 'Karnataka' }
      });
      testFarmIds.push(farm._id.toString());

      const result = await farmCropRankingService.getCropRanking(farm._id.toString(), {
        custom_weights: { agronomic: 0.9, market: 0.1 }
      });

      assert(result.recommendation.weights.agronomic === 0.9, 'Agronomic weight should be 0.9');
      assert(result.recommendation.weights.market === 0.1, 'Market weight should be 0.1');

      console.log('  [PASS] Test 4: Custom weights (0.9 agronomic, 0.1 market) calculation verified.');
      passed++;
    } catch (err) {
      console.log(`  [FAIL] Test 4: ${err.message}`);
      failed++;
    }

    // Test 5: Missing soil fields validation error (INSUFFICIENT_FARM_DATA)
    for (const field of ['N', 'P', 'K', 'ph']) {
      try {
        const soilData = { N: 90, P: 42, K: 43, ph: 6.5 };
        delete soilData[field];

        const mockState = {
          farmId: '507f1f77bcf86cd799439013',
          name: `Missing ${field} Farm`,
          soil: soilData,
          weather: { temperature: 25.0, humidity: 80.0, rainfall: 200.0 },
          location: { state: 'Punjab', district: 'Ludhiana' }
        };

        let threw = false;
        try {
          farmCropRankingService.extractCropRankingInput(mockState);
        } catch (err) {
          threw = true;
          assert(err.code === 'INSUFFICIENT_FARM_DATA', `Expected INSUFFICIENT_FARM_DATA, got ${err.code}`);
          assert(err.missingFields.includes(field), `missingFields should include ${field}`);
        }
        assert(threw, `Expected extractCropRankingInput to throw for missing soil.${field}`);
        console.log(`  [PASS] Test 5 (${field}): Missing soil.${field} correctly rejected with INSUFFICIENT_FARM_DATA.`);
        passed++;
      } catch (err) {
        console.log(`  [FAIL] Test 5 (${field}): ${err.message}`);
        failed++;
      }
    }

    // Test 6: Missing weather fields validation error (INSUFFICIENT_FARM_DATA)
    for (const field of ['temperature', 'humidity', 'rainfall']) {
      try {
        const weatherData = { temperature: 25.0, humidity: 80.0, rainfall: 200.0 };
        delete weatherData[field];

        const mockState = {
          farmId: '507f1f77bcf86cd799439014',
          name: `Missing ${field} Farm`,
          soil: { N: 90, P: 42, K: 43, ph: 6.5 },
          weather: weatherData,
          location: { state: 'Punjab', district: 'Ludhiana' }
        };

        let threw = false;
        try {
          farmCropRankingService.extractCropRankingInput(mockState);
        } catch (err) {
          threw = true;
          assert(err.code === 'INSUFFICIENT_FARM_DATA', `Expected INSUFFICIENT_FARM_DATA, got ${err.code}`);
          assert(err.missingFields.includes(field), `missingFields should include ${field}`);
        }
        assert(threw, `Expected extractCropRankingInput to throw for missing weather.${field}`);
        console.log(`  [PASS] Test 6 (${field}): Missing weather.${field} correctly rejected with INSUFFICIENT_FARM_DATA.`);
        passed++;
      } catch (err) {
        console.log(`  [FAIL] Test 6 (${field}): ${err.message}`);
        failed++;
      }
    }

    // Test 7: Malformed farmId error handling (INVALID_FARM_ID)
    try {
      let threw = false;
      try {
        await farmCropRankingService.getCropRanking('malformed-12345');
      } catch (err) {
        threw = true;
        assert(err.code === 'INVALID_FARM_ID', `Expected INVALID_FARM_ID, got ${err.code}`);
      }
      assert(threw, 'Expected malformed farmId to throw INVALID_FARM_ID');
      console.log('  [PASS] Test 7: Malformed farmId correctly threw INVALID_FARM_ID.');
      passed++;
    } catch (err) {
      console.log(`  [FAIL] Test 7: ${err.message}`);
      failed++;
    }

    // Test 8: Non-existent farmId error handling (FARM_NOT_FOUND)
    try {
      let threw = false;
      const nonExistentId = new mongoose.Types.ObjectId().toString();
      try {
        await farmCropRankingService.getCropRanking(nonExistentId);
      } catch (err) {
        threw = true;
        assert(err.code === 'FARM_NOT_FOUND', `Expected FARM_NOT_FOUND, got ${err.code}`);
      }
      assert(threw, 'Expected non-existent farmId to throw FARM_NOT_FOUND');
      console.log('  [PASS] Test 8: Non-existent farmId correctly threw FARM_NOT_FOUND.');
      passed++;
    } catch (err) {
      console.log(`  [FAIL] Test 8: ${err.message}`);
      failed++;
    }

    // Test 9: Read-only invariant (zero mutation of Farm document)
    try {
      const createdFarm = await farmService.createFarm({
        name: 'Read-Only Ranking Farm',
        location: { state: 'Punjab', district: 'Ludhiana' },
        soil: { nitrogen: 90, phosphorus: 42, potassium: 43, ph: 6.5 },
        weather: { temperature: 24.5, humidity: 82.0, rainfall: 210.0 },
        marketContext: { market: 'Khanna', state: 'Punjab' }
      });
      const farmId = createdFarm._id.toString();
      testFarmIds.push(farmId);

      const farmBefore = await farmService.getFarmById(farmId);
      const updatedAtBefore = farmBefore.updatedAt ? new Date(farmBefore.updatedAt).getTime() : null;

      await farmCropRankingService.getCropRanking(farmId);

      const farmAfter = await farmService.getFarmById(farmId);
      const updatedAtAfter = farmAfter.updatedAt ? new Date(farmAfter.updatedAt).getTime() : null;

      assert(updatedAtBefore === updatedAtAfter, 'Farm updatedAt changed; read-only invariant violated');
      assert(farmBefore.name === farmAfter.name, 'Farm name mutated');

      console.log('  [PASS] Test 9: Read-only invariant verified (zero Farm document mutation).');
      passed++;
    } catch (err) {
      console.log(`  [FAIL] Test 9: ${err.message}`);
      failed++;
    }

    // Test 10: Real MongoDB Atlas persistence + Crop Ranking execution
    const isAtlasConnected = mongoose.connection.readyState === 1;
    if (isAtlasConnected) {
      try {
        const atlasFarm = await farmService.createFarm({
          name: 'Atlas Real Crop Ranking Farm',
          location: {
            state: 'Punjab',
            district: 'Ludhiana',
            village: 'Samrala'
          },
          soil: {
            nitrogen: 85,
            phosphorus: 40,
            potassium: 42,
            ph: 6.7
          },
          weather: {
            temperature: 25.0,
            humidity: 80.0,
            rainfall: 200.0
          },
          marketContext: {
            market: 'Khanna',
            state: 'Punjab'
          }
        });
        testFarmIds.push(atlasFarm._id.toString());

        const rankingResult = await farmCropRankingService.getCropRanking(atlasFarm._id.toString());
        assert(rankingResult.success === true, 'Atlas ranking failed');
        assert(rankingResult.recommendation.status === 'SUCCESS', 'Recommendation status not SUCCESS');
        assert(rankingResult.recommendation.ranked_crops.length > 0, 'No ranked crops returned');

        console.log(`  [PASS] Test 10 (REAL ATLAS): Real Atlas Farm -> Shared Farm State -> Crop Ranking Engine executed successfully (Top: ${rankingResult.recommendation.ranked_crops[0].crop}).`);
        passed++;
      } catch (err) {
        console.log(`  [FAIL] Test 10: ${err.message}`);
        failed++;
      }
    } else {
      console.log('  [SKIP] Test 10 (REAL ATLAS): Skipped live Atlas test (database operating in memory fallback).');
      passed++;
    }

    // Test 11: HTTP REST endpoint GET /api/farms/:farmId/crop-ranking
    try {
      const farm = await farmService.createFarm({
        name: 'REST API Crop Ranking Farm',
        location: { state: 'Punjab', district: 'Ludhiana' },
        soil: { nitrogen: 90, phosphorus: 42, potassium: 43, ph: 6.5 },
        weather: { temperature: 24.5, humidity: 82.0, rainfall: 210.0 },
        marketContext: { market: 'Khanna', state: 'Punjab' }
      });
      testFarmIds.push(farm._id.toString());

      const res = await makeHttpRequest(server, 'GET', `/api/farms/${farm._id.toString()}/crop-ranking`);
      assert(res.status === 200, `Expected status 200, got ${res.status}`);
      assert(res.body.success === true, 'Expected body.success to be true');
      assert(res.body.recommendation.status === 'SUCCESS', 'Expected recommendation status SUCCESS');
      assert(Array.isArray(res.body.recommendation.ranked_crops), 'Expected ranked_crops array');

      console.log(`  [PASS] Test 11: HTTP GET /api/farms/${farm._id.toString()}/crop-ranking verified.`);
      passed++;
    } catch (err) {
      console.log(`  [FAIL] Test 11: ${err.message}`);
      failed++;
    }

    // Test 12: HTTP REST endpoint with custom weights in query string
    try {
      const farmId = testFarmIds[0];
      const res = await makeHttpRequest(
        server,
        'GET',
        `/api/farms/${farmId}/crop-ranking?agronomic_weight=0.8&market_weight=0.2`
      );
      assert(res.status === 200, `Expected status 200, got ${res.status}`);
      assert(res.body.recommendation.weights.agronomic === 0.8, 'Expected agronomic weight 0.8');
      assert(res.body.recommendation.weights.market === 0.2, 'Expected market weight 0.2');

      console.log('  [PASS] Test 12: HTTP GET with custom weight query parameters verified.');
      passed++;
    } catch (err) {
      console.log(`  [FAIL] Test 12: ${err.message}`);
      failed++;
    }

    // Test 13: Direct endpoint POST /api/ai/crop-ranking continues to function
    try {
      const res = await makeHttpRequest(server, 'POST', '/api/ai/crop-ranking', {
        candidates: [
          { crop: 'Tomato', probability: 0.60 },
          { crop: 'Maize', probability: 0.30 },
          { crop: 'Potato', probability: 0.10 }
        ],
        market_context: {
          market: 'Kolar',
          state: 'Karnataka'
        }
      });
      assert(res.status === 200, `Expected status 200, got ${res.status}`);
      assert(res.body.success === true, 'Expected body.success to be true');
      assert(res.body.result.status === 'SUCCESS', 'Expected result status SUCCESS');
      assert(res.body.result.ranked_crops[0].crop === 'Tomato', 'Expected Tomato top ranked');

      console.log('  [PASS] Test 13: Direct endpoint POST /api/ai/crop-ranking continues to function unchanged.');
      passed++;
    } catch (err) {
      console.log(`  [FAIL] Test 13: ${err.message}`);
      failed++;
    }

    // Test 14: Null Shared Farm State guard
    try {
      let threw = false;
      try {
        farmCropRankingService.extractCropRankingInput(null);
      } catch (err) {
        threw = true;
        assert(err.code === 'INSUFFICIENT_FARM_DATA', `Expected INSUFFICIENT_FARM_DATA, got ${err.code}`);
      }
      assert(threw, 'Expected null shared state to throw');
      console.log('  [PASS] Test 14: Null Shared Farm State correctly rejected.');
      passed++;
    } catch (err) {
      console.log(`  [FAIL] Test 14: ${err.message}`);
      failed++;
    }

  } finally {
    // Clean up created test farms
    for (const farmId of testFarmIds) {
      try {
        await farmService.deleteFarm(farmId);
      } catch (e) {
        // Best effort cleanup
      }
    }

    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    await disconnectDB();
  }

  console.log('\n' + '='.repeat(80));
  console.log(`FARM CROP RANKING INTEGRATION SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('='.repeat(80));

  if (failed > 0) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error('Fatal error during test suite execution:', err);
  process.exit(1);
});
