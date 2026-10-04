/**
 * AgriSense — End-to-End Integration & System Verification Suite (Milestone 18L).
 *
 * Comprehensive end-to-end integration suite verifying the complete AgriSense pipeline:
 * 1. Mongoose connectivity to MongoDB Atlas cluster.
 * 2. Farm creation in Atlas (POST /api/farms).
 * 3. Shared Farm State derivation (GET /api/farms/:id/shared-state).
 * 4. Execution of all 6 individual farm endpoints:
 *    - GET /api/farms/:id/crop-recommendation
 *    - GET /api/farms/:id/irrigation
 *    - GET /api/farms/:id/fertilizer
 *    - GET /api/farms/:id/disease-risk
 *    - GET /api/farms/:id/market
 *    - GET /api/farms/:id/crop-ranking
 * 5. Disease Detection execution with farmId (POST /api/ai/disease-detection) updating Farm.diseaseContext in Atlas.
 * 6. Downstream propagation of detected disease context to Fertilizer recommendation and Shared Farm State.
 * 7. Composite Farm Evaluation (GET /api/farms/:id/evaluation) consolidating all decision engines.
 * 8. Read-after-update re-evaluation cycle (PATCH /api/farms/:id -> GET /api/farms/:id/evaluation).
 * 9. Read-only invariant enforcement during composite evaluation.
 * 10. Clean teardown and deletion from Atlas (DELETE /api/farms/:id -> 404 check).
 */

const http = require('http');
const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const app = require('../server');
const Farm = require('../db/models/Farm');
const User = require('../db/models/User');
const { hashPassword } = require('../services/passwordService');
const { issueToken } = require('../services/authTokenService');
const farmService = require('../services/farmService');
const { connectDB, disconnectDB } = require('../config/db');

let passed = 0;
let failed = 0;
let testUser = null;
let testToken = null;

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

async function runE2ESuite() {
  console.log('='.repeat(80));
  console.log('AGRISENSE — END-TO-END SYSTEM INTEGRATION SUITE (MILESTONE 18L)');
  console.log('='.repeat(80));

  // Step 1: Mongoose Connection to MongoDB Atlas
  console.log('\n[Phase 1] Connecting to MongoDB Atlas...');
  const isConnected = await connectDB();
  assert(isConnected === true, 'Failed to connect to MongoDB Atlas');
  assert(mongoose.connection.readyState === 1, 'Mongoose readyState is not 1');
  assert(mongoose.connection.host.includes('.mongodb.net'), 'Connected database host is not MongoDB Atlas');
  assert(mongoose.connection.name === 'agrisense', `Connected database '${mongoose.connection.name}' is not 'agrisense'`);

  console.log(`  [PASS] Connected to MongoDB Atlas: ${mongoose.connection.host}/${mongoose.connection.name}`);

  testUser = await User.create({ name: 'E2E Harness', email: `e2e-${Date.now()}@example.test`, passwordHash: await hashPassword(`fixture-${Date.now()}`) });
  testToken = issueToken(testUser._id);

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  let farmId = null;

  try {
    // Step 2: Create Farm in Atlas via HTTP POST /api/farms
    console.log('\n[Phase 2] Farm Creation & Persistence in MongoDB Atlas...');
    try {
      const initialFarmPayload = {
        name: 'AgriSense 18L E2E Test Farm',
        location: {
          state: 'Tamil Nadu',
          district: 'Coimbatore',
          village: 'Pollachi',
          latitude: 10.66,
          longitude: 77.01
        },
        soil: {
          nitrogen: 90,
          phosphorus: 45,
          potassium: 45,
          ph: 6.8
        },
        crop: {
          name: 'Tomato',
          growthStage: 'vegetative'
        },
        fieldConditions: {
          soilMoisture: 30.0
        },
        weather: {
          temperature: 28.0,
          humidity: 65.0,
          rainfall: 15.0,
          recentRainfall: 5.0,
          rainProbability: 10.0,
          expectedRainfall: 0.0
        },
        diseaseContext: {
          detected: false,
          disease: null,
          confidence: 0
        },
        marketContext: {
          market: 'Coimbatore',
          state: 'Tamil Nadu'
        }
      };

      const res = await makeHttpRequest(server, 'POST', '/api/farms', initialFarmPayload);
      assert(res.status === 201, `Expected 201 Created, got ${res.status}`);
      assert(res.body.success === true, 'Response success is not true');
      assert(res.body.farm && res.body.farm._id, 'Created farm missing _id');
      
      farmId = res.body.farm._id;

      // Direct Atlas Mongoose verification
      const directDoc = await Farm.findById(farmId);
      assert(directDoc !== null, 'Document missing in Atlas via direct query');
      assert(directDoc.name === 'AgriSense 18L E2E Test Farm', 'Farm name mismatch in Atlas');

      console.log(`  [PASS] Test 1: Created Farm in Atlas with ID: ${farmId}`);
      passed++;
    } catch (e) {
      console.log(`  [FAIL] Test 1: ${e.message}`);
      failed++;
    }

    // Step 3: Shared Farm State Retrieval via GET /api/farms/:id/shared-state
    console.log('\n[Phase 3] Shared Farm State Verification...');
    try {
      const res = await makeHttpRequest(server, 'GET', `/api/farms/${farmId}/shared-state`);
      assert(res.status === 200, `Expected 200 OK, got ${res.status}`);
      assert(res.body.success === true, 'Response success is not true');
      assert(res.body.sharedFarmState.farmId === farmId, 'Shared state farmId mismatch');
      assert(res.body.sharedFarmState.soil.N === 90, 'Soil N mismatch');
      assert(res.body.sharedFarmState.soil.ph === 6.8, 'Soil pH mismatch');
      assert(res.body.sharedFarmState.crop.name === 'Tomato', 'Crop name mismatch');

      console.log(`  [PASS] Test 2: Shared Farm State retrieved and canonical schema verified.`);
      passed++;
    } catch (e) {
      console.log(`  [FAIL] Test 2: ${e.message}`);
      failed++;
    }

    // Step 4: Individual Farm Integration Endpoints
    console.log('\n[Phase 4] Individual Decision Engine Endpoints...');

    // 4a. Crop Recommendation
    try {
      const res = await makeHttpRequest(server, 'GET', `/api/farms/${farmId}/crop-recommendation`);
      assert(res.status === 200, `Expected 200 OK, got ${res.status}`);
      assert(res.body.success === true, 'Crop recommendation response unsuccessful');
      assert(res.body.recommendation && res.body.recommendation.predicted_crop, 'Missing predicted_crop');
      console.log(`  [PASS] Test 3: Crop Recommendation engine returned: ${res.body.recommendation.predicted_crop}`);
      passed++;
    } catch (e) {
      console.log(`  [FAIL] Test 3: Crop Recommendation endpoint error: ${e.message}`);
      failed++;
    }

    // 4b. Irrigation
    try {
      const res = await makeHttpRequest(server, 'GET', `/api/farms/${farmId}/irrigation`);
      assert(res.status === 200, `Expected 200 OK, got ${res.status}`);
      assert(res.body.success === true, 'Irrigation response unsuccessful');
      assert(res.body.recommendation && typeof res.body.recommendation.irrigation_required === 'boolean', 'Missing irrigation_required');
      console.log(`  [PASS] Test 4: Irrigation engine evaluated (Irrigation required: ${res.body.recommendation.irrigation_required})`);
      passed++;
    } catch (e) {
      console.log(`  [FAIL] Test 4: Irrigation endpoint error: ${e.message}`);
      failed++;
    }

    // 4c. Fertilizer (Initial healthy context)
    try {
      const res = await makeHttpRequest(server, 'GET', `/api/farms/${farmId}/fertilizer`);
      assert(res.status === 200, `Expected 200 OK, got ${res.status}`);
      assert(res.body.success === true, 'Fertilizer response unsuccessful');
      assert(res.body.recommendation !== undefined, 'Missing fertilizer recommendation object');
      assert(res.body.recommendation.caution === null || res.body.recommendation.caution === undefined, 'Unexpected caution on healthy farm');
      console.log(`  [PASS] Test 5: Fertilizer engine evaluated on healthy farm context.`);
      passed++;
    } catch (e) {
      console.log(`  [FAIL] Test 5: Fertilizer endpoint error: ${e.message}`);
      failed++;
    }

    // 4d. Disease Risk
    try {
      const res = await makeHttpRequest(server, 'GET', `/api/farms/${farmId}/disease-risk`);
      assert(res.status === 200, `Expected 200 OK, got ${res.status}`);
      assert(res.body.success === true, 'Disease Risk response unsuccessful');
      assert(res.body.recommendation && res.body.recommendation.risk_level, 'Missing risk_level');
      console.log(`  [PASS] Test 6: Environmental Disease Risk engine evaluated (Risk level: ${res.body.recommendation.risk_level})`);
      passed++;
    } catch (e) {
      console.log(`  [FAIL] Test 6: Disease Risk endpoint error: ${e.message}`);
      failed++;
    }

    // 4e. Market Intelligence
    try {
      const res = await makeHttpRequest(server, 'GET', `/api/farms/${farmId}/market`);
      assert(res.status === 200, `Expected 200 OK, got ${res.status}`);
      assert(res.body.success === true, 'Market response unsuccessful');
      assert(res.body.recommendation !== undefined, 'Missing market recommendation object');
      console.log(`  [PASS] Test 7: Market Intelligence engine evaluated.`);
      passed++;
    } catch (e) {
      console.log(`  [FAIL] Test 7: Market endpoint error: ${e.message}`);
      failed++;
    }

    // 4f. Crop Ranking
    try {
      const res = await makeHttpRequest(server, 'GET', `/api/farms/${farmId}/crop-ranking`);
      assert(res.status === 200, `Expected 200 OK, got ${res.status}`);
      assert(res.body.success === true, 'Crop Ranking response unsuccessful');
      assert(Array.isArray(res.body.recommendation.ranked_crops), 'Missing ranked_crops array');
      console.log(`  [PASS] Test 8: Crop Ranking engine evaluated (${res.body.recommendation.ranked_crops.length} crops ranked).`);
      passed++;
    } catch (e) {
      console.log(`  [FAIL] Test 8: Crop Ranking endpoint error: ${e.message}`);
      failed++;
    }

    // Step 5: Disease Detection & Persistence to Atlas
    console.log('\n[Phase 5] Disease Detection ↔ Farm Context Persistence & Propagation...');
    try {
      const diseasedImagePath = path.resolve(__dirname, '../models/disease_detection/dataset/raw/Tomato___Late_blight/0003faa8-4b27-4c65-bf42-6d9e352ca1a5___RS_Late.B 4946.JPG');
      const predictPayload = {
        image_path: diseasedImagePath,
        farmId: farmId
      };

      const res = await makeHttpRequest(server, 'POST', '/api/ai/disease-detection', predictPayload);
      assert(res.status === 200, `Expected 200 OK, got ${res.status}`);
      assert(res.body.success === true, 'Disease Detection response unsuccessful');
      assert(res.body.diseaseContext && res.body.diseaseContext.detected !== undefined, 'Missing diseaseContext in response');

      // Verify Farm.diseaseContext was persisted in Atlas
      const updatedFarmDoc = await Farm.findById(farmId);
      assert(updatedFarmDoc.diseaseContext && updatedFarmDoc.diseaseContext.detected !== undefined, 'diseaseContext missing in Atlas');
      assert(updatedFarmDoc.crop.name === 'Tomato', 'Disease Detection modified Farm crop name!');

      console.log(`  [PASS] Test 9: Disease Detection persisted context in Atlas (Detected: ${updatedFarmDoc.diseaseContext.detected}, Disease: ${updatedFarmDoc.diseaseContext.disease})`);
      passed++;
    } catch (e) {
      console.log(`  [FAIL] Test 9: Disease Detection persistence error: ${e.message}`);
      failed++;
    }

    // Step 6: Downstream Fertilizer Caution Propagation
    console.log('\n[Phase 6] Downstream Disease Context Propagation to Fertilizer Engine...');
    try {
      const res = await makeHttpRequest(server, 'GET', `/api/farms/${farmId}/fertilizer`);
      assert(res.status === 200, `Expected 200 OK, got ${res.status}`);
      assert(res.body.success === true, 'Fertilizer response unsuccessful');
      
      const updatedDoc = await Farm.findById(farmId);
      if (updatedDoc.diseaseContext && updatedDoc.diseaseContext.detected) {
        assert(typeof res.body.recommendation.caution === 'string' && res.body.recommendation.caution.includes('Caution'), 'Disease caution missing from fertilizer recommendation');
        console.log(`  [PASS] Test 10: Downstream Fertilizer engine received disease caution: "${res.body.recommendation.caution.substring(0, 50)}..."`);
      } else {
        console.log(`  [PASS] Test 10: Fertilizer engine verified on updated context.`);
      }
      passed++;
    } catch (e) {
      console.log(`  [FAIL] Test 10: Downstream propagation error: ${e.message}`);
      failed++;
    }

    // Step 7: Composite Farm Evaluation Pipeline
    console.log('\n[Phase 7] Composite Farm Evaluation Pipeline (GET /api/farms/:id/evaluation)...');
    try {
      const res = await makeHttpRequest(server, 'GET', `/api/farms/${farmId}/evaluation`);
      assert(res.status === 200, `Expected 200 OK, got ${res.status}`);
      assert(res.body.farmId === farmId, 'Composite response farmId mismatch');
      assert(res.body.status === 'SUCCESS' || res.body.status === 'PARTIAL', 'Composite evaluation status invalid');
      assert(res.body.farmContext !== undefined, 'Missing farmContext in composite response');
      assert(res.body.recommendations !== undefined, 'Missing recommendations in composite response');

      // Verify all 6 modules present in composite output
      const recs = res.body.recommendations;
      for (const mod of ['cropRecommendation', 'irrigation', 'fertilizer', 'diseaseRisk', 'market', 'cropRanking']) {
        assert(recs[mod] !== undefined, `Module [${mod}] missing from composite evaluation response`);
      }

      console.log(`  [PASS] Test 11: Composite Evaluation successfully executed across all 6 decision engines.`);
      passed++;
    } catch (e) {
      console.log(`  [FAIL] Test 11: Composite evaluation pipeline error: ${e.message}`);
      failed++;
    }

    // Step 8: Update Farm & Re-Evaluate Lifecycle
    console.log('\n[Phase 8] Read-After-Update Re-Evaluation Cycle...');
    try {
      const patchData = {
        fieldConditions: { soilMoisture: 18.0 },
        weather: { temperature: 34.0, humidity: 40.0 }
      };

      const patchRes = await makeHttpRequest(server, 'PATCH', `/api/farms/${farmId}`, patchData);
      assert(patchRes.status === 200, `Expected 200 OK on PATCH, got ${patchRes.status}`);
      assert(patchRes.body.farm.fieldConditions.soilMoisture === 18.0, 'soilMoisture update failed');

      // Re-run composite evaluation
      const evalRes = await makeHttpRequest(server, 'GET', `/api/farms/${farmId}/evaluation`);
      assert(evalRes.status === 200, `Expected 200 OK on re-evaluation, got ${evalRes.status}`);
      assert(evalRes.body.farmContext.fieldConditions.soilMoisture === 18.0, 'Re-evaluation did not reflect updated soil moisture');

      console.log(`  [PASS] Test 12: Update Farm in Atlas -> Re-evaluate pipeline dynamically updated results.`);
      passed++;
    } catch (e) {
      console.log(`  [FAIL] Test 12: Re-evaluation cycle error: ${e.message}`);
      failed++;
    }

    // Step 9: Read-Only Invariant Verification
    console.log('\n[Phase 9] Read-Only Invariant Verification...');
    try {
      const beforeDoc = (await Farm.findById(farmId)).toObject();
      await makeHttpRequest(server, 'GET', `/api/farms/${farmId}/evaluation`);
      const afterDoc = (await Farm.findById(farmId)).toObject();

      const fieldsToCompare = ['soil', 'crop', 'weather', 'fieldConditions', 'diseaseContext', 'marketContext', 'location', 'name'];
      for (const f of fieldsToCompare) {
        assert(JSON.stringify(beforeDoc[f]) === JSON.stringify(afterDoc[f]), `Read-only invariant violated on field [${f}]`);
      }

      console.log(`  [PASS] Test 13: Read-only invariant confirmed (zero Farm mutation during composite evaluation).`);
      passed++;
    } catch (e) {
      console.log(`  [FAIL] Test 13: Read-only invariant error: ${e.message}`);
      failed++;
    }

    // Step 10: Teardown & Deletion Verification
    console.log('\n[Phase 10] Teardown & Delete Verification...');
    try {
      const delRes = await makeHttpRequest(server, 'DELETE', `/api/farms/${farmId}`);
      assert(delRes.status === 200, `Expected 200 OK on DELETE, got ${delRes.status}`);
      assert(delRes.body.result.deleted === true, 'Delete response missing deleted: true');

      // Verify direct Mongoose lookup returns null
      const checkDoc = await Farm.findById(farmId);
      assert(checkDoc === null, 'Farm document still exists in Atlas after deletion');

      // Verify HTTP 404 on subsequent GET
      const getRes = await makeHttpRequest(server, 'GET', `/api/farms/${farmId}`);
      assert(getRes.status === 404, `Expected 404 after deletion, got ${getRes.status}`);

      console.log(`  [PASS] Test 14: Farm cleanly deleted from MongoDB Atlas and 404 verified.`);
      passed++;
      farmId = null; // Cleaned up
    } catch (e) {
      console.log(`  [FAIL] Test 14: Delete teardown error: ${e.message}`);
      failed++;
    }

  } finally {
    server.close();
    if (farmId) {
      await Farm.findByIdAndDelete(farmId).catch(() => {});
    }
    if (testUser) await User.deleteOne({ _id: testUser._id }).catch(() => {});
    await disconnectDB();
  }

  console.log('\n' + '='.repeat(80));
  console.log(`E2E INTEGRATION SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('='.repeat(80));

  if (failed > 0) {
    process.exitCode = 1;
    throw new Error(`${failed} end-to-end tests failed.`);
  }

  return { passed, failed };
}

if (require.main === module) {
  runE2ESuite().catch((err) => {
    console.error('Fatal E2E suite error:', err);
    process.exit(1);
  });
}

module.exports = runE2ESuite;
