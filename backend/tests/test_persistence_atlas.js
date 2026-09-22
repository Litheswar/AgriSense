/**
 * AgriSense — MongoDB Atlas Real Persistence & Process Restart Verification Suite (Milestone 18A).
 *
 * Verifies:
 * 1. Mongoose connectivity to MongoDB Atlas cluster.
 * 2. Create a Farm document in MongoDB Atlas (POST /api/farms).
 * 3. Read Farm document back from MongoDB Atlas (GET /api/farms/:id).
 * 4. Update Farm document in MongoDB Atlas (PATCH /api/farms/:id) & verify read-after-write.
 * 5. Verify toSharedFarmState() structure on persisted document.
 * 6. Delete Farm document from MongoDB Atlas (DELETE /api/farms/:id) & verify 404.
 * 7. Multi-Process Restart Verification:
 *    - Process 1 creates a Farm in Atlas and exits.
 *    - Process 2 starts, connects, reads the same Farm from Atlas, and cleans it up.
 * 8. In-Memory Fallback Verification when MongoDB is offline.
 */

const http = require('http');
const path = require('path');
const { spawn } = require('child_process');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const mongoose = require('mongoose');
const app = require('../server');
const Farm = require('../db/models/Farm');
const farmService = require('../services/farmService');
const { connectDB, disconnectDB, getConnectionStatus, getDetailedStatus, getLastConnectionError } = require('../config/db');

let passed = 0;
let failed = 0;
let skipped = 0;

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

// Helper to make local HTTP requests to ephemeral Express server
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

async function runPersistenceSuite() {
  console.log('='.repeat(80));
  console.log('AGRISENSE — MONODB ATLAS REAL PERSISTENCE & VERIFICATION SUITE (MILESTONE 18A)');
  console.log('='.repeat(80));

  // Step 1: Attempt connection to MongoDB Atlas
  console.log('\n[Phase 1] Establishing Mongoose connection to MongoDB Atlas...');
  const isConnected = await connectDB();

  if (!isConnected) {
    failed++;
    const lastErr = getLastConnectionError();
    console.error('\n' + '!'.repeat(80));
    console.error('[ATLAS CONNECTION FAILED — MILESTONE 18A ATLAS PERSISTENCE UNVERIFIED]');
    console.error('Connection to MongoDB Atlas cluster could not be established.');
    if (lastErr) {
      console.error(`Error Category: ${lastErr.name || 'MongooseConnectionError'}`);
      console.error(`Message: ${lastErr.message}`);
      if (lastErr.reason && lastErr.reason.servers) {
        for (const [addr, s] of lastErr.reason.servers.entries()) {
          if (s.error) {
            console.error(`Server (${addr}) Error: ${s.error.message.trim()}`);
          }
        }
      } else if (lastErr.cause) {
        console.error(`Underlying Cause: ${lastErr.cause.message || JSON.stringify(lastErr.cause)}`);
      }
    }

    console.error('Root Cause: Incoming client IP is not authorized in Atlas Network Access Access-List.');
    console.error('Action Required: In MongoDB Atlas UI -> Network Access -> Add IP Address,');
    console.error('authorize the current outbound public IP (or allow access from anywhere for development).');
    console.error('!'.repeat(80) + '\n');

    console.log('[Phase 2: Offline Resilience Check] Running In-Memory Fallback Verification...');
    await runFallbackVerification();

    console.log('\n' + '='.repeat(80));
    console.log(`ATLAS PERSISTENCE SUMMARY: ${passed} PASSED, ${failed} FAILED, ${skipped} SKIPPED`);
    console.log('Result: ATLAS PERSISTENCE FAILED (IN-MEMORY FALLBACK ACTIVE)');
    console.log('='.repeat(80));

    process.exit(1);
  }

  // Strict Database Identity Assertions
  assert(mongoose.connection.readyState === 1, 'Mongoose connection readyState is not 1 (connected)');
  assert(farmService._useLiveDB() === true, 'FarmService is not operating in live database mode');
  assert(mongoose.connection.name === 'agrisense', `Connected database '${mongoose.connection.name}' is not 'agrisense'`);
  assert(mongoose.connection.host && mongoose.connection.host.includes('.mongodb.net'), `Connected host '${mongoose.connection.host}' is not a MongoDB Atlas cluster`);

  console.log(`[Atlas Identity Verified] Host: ${mongoose.connection.host}, DB: ${mongoose.connection.name}`);
  console.log(`[Repository Mode Verified] LIVE MONGODB ATLAS REPOSITORY (Mongoose readyState: 1)`);


  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  let createdFarmId = null;

  try {
    // Test 1: CREATE via POST /api/farms on MongoDB Atlas
    try {
      const atlasTestFarm = {
        name: 'AgriSense Atlas Test Farm',
        location: {
          state: 'Tamil Nadu',
          district: 'Chennai',
          village: 'Test Village',
          latitude: 13.08,
          longitude: 80.27
        },
        soil: {
          nitrogen: 90,
          phosphorus: 42,
          potassium: 43,
          ph: 6.5
        },
        crop: {
          name: 'Tomato',
          growthStage: 'vegetative'
        },
        fieldConditions: {
          soilMoisture: 35
        },
        weather: {
          temperature: 28.5,
          humidity: 65,
          rainfall: 12
        }
      };

      const res = await makeHttpRequest(server, 'POST', '/api/farms', atlasTestFarm);
      assert(res.status === 201, `Expected HTTP 201, got ${res.status}`);
      assert(res.body.success === true, 'Response missing success: true');
      assert(res.body.farm._id, 'Created document missing _id');
      assert(/^[0-9a-fA-F]{24}$/.test(res.body.farm._id), 'Invalid MongoDB ObjectId format');
      assert(res.body.farm.name === 'AgriSense Atlas Test Farm', 'Farm name mismatch');
      
      createdFarmId = res.body.farm._id;

      // Direct Mongoose verification bypassing HTTP to ensure real DB write
      const directDoc = await Farm.findById(createdFarmId);
      assert(directDoc !== null, 'Document not found via direct Mongoose query');
      assert(directDoc.name === 'AgriSense Atlas Test Farm', 'Direct query name mismatch');

      console.log(`  [PASS] Test 1 (CREATE): Successfully created Farm in Atlas with ID: ${createdFarmId}`);
      passed++;
    } catch (e) {
      console.log(`  [FAIL] Test 1 (CREATE): ${e.message}`);
      failed++;
    }

    // Test 2: READ via GET /api/farms/:id
    try {
      const res = await makeHttpRequest(server, 'GET', `/api/farms/${createdFarmId}`);
      assert(res.status === 200, `Expected HTTP 200, got ${res.status}`);
      assert(res.body.success === true, 'Expected success: true');
      assert(res.body.farm._id === createdFarmId, 'Farm ID mismatch on retrieval');
      assert(res.body.farm.soil.nitrogen === 90, 'Nitrogen value mismatch');
      assert(res.body.farm.location.district === 'Chennai', 'District mismatch');
      console.log(`  [PASS] Test 2 (READ): Successfully retrieved Farm from Atlas via HTTP GET.`);
      passed++;
    } catch (e) {
      console.log(`  [FAIL] Test 2 (READ): ${e.message}`);
      failed++;
    }

    // Test 3: UPDATE via PATCH /api/farms/:id
    try {
      const updateData = {
        fieldConditions: { soilMoisture: 42.0 },
        crop: { growthStage: 'flowering' },
        weather: { temperature: 31.0 }
      };
      const res = await makeHttpRequest(server, 'PATCH', `/api/farms/${createdFarmId}`, updateData);
      assert(res.status === 200, `Expected HTTP 200, got ${res.status}`);
      assert(res.body.farm.fieldConditions.soilMoisture === 42.0, 'soilMoisture update failed');
      assert(res.body.farm.crop.growthStage === 'flowering', 'growthStage update failed');
      assert(res.body.farm.weather.temperature === 31.0, 'temperature update failed');
      assert(res.body.farm.name === 'AgriSense Atlas Test Farm', 'Unmodified name was altered');

      // Verify read-after-write directly from DB
      const freshDoc = await Farm.findById(createdFarmId);
      assert(freshDoc.fieldConditions.soilMoisture === 42.0, 'Direct read soilMoisture mismatch');
      assert(freshDoc.crop.growthStage === 'flowering', 'Direct read growthStage mismatch');

      console.log(`  [PASS] Test 3 (UPDATE): Read-after-write persisted update in MongoDB Atlas.`);
      passed++;
    } catch (e) {
      console.log(`  [FAIL] Test 3 (UPDATE): ${e.message}`);
      failed++;
    }

    // Test 4: SHARED FARM STATE Transformation
    try {
      const res = await makeHttpRequest(server, 'GET', `/api/farms/${createdFarmId}`);
      const shared = res.body.sharedFarmState;
      assert(shared !== undefined && shared !== null, 'sharedFarmState missing from response');
      assert(shared.farmId === createdFarmId, 'sharedFarmState farmId mismatch');
      assert(shared.name === 'AgriSense Atlas Test Farm', 'sharedFarmState name mismatch');
      assert(shared.soil.N === 90, 'sharedFarmState soil.N mismatch');
      assert(shared.soil.ph === 6.5, 'sharedFarmState soil.ph mismatch');
      assert(shared.crop.growthStage === 'flowering', 'sharedFarmState growthStage mismatch');
      assert(shared.fieldConditions.soilMoisture === 42.0, 'sharedFarmState soilMoisture mismatch');
      assert(shared.weather.temperature === 31.0, 'sharedFarmState weather.temperature mismatch');
      console.log(`  [PASS] Test 4 (SHARED STATE): toSharedFarmState() transformed Atlas document accurately.`);
      passed++;
    } catch (e) {
      console.log(`  [FAIL] Test 4 (SHARED STATE): ${e.message}`);
      failed++;
    }

    // Test 5: DELETE via DELETE /api/farms/:id
    try {
      const res = await makeHttpRequest(server, 'DELETE', `/api/farms/${createdFarmId}`);
      assert(res.status === 200, `Expected HTTP 200, got ${res.status}`);
      assert(res.body.result.deleted === true, 'Expected deleted: true');

      // Verify 404 on subsequent GET
      const checkRes = await makeHttpRequest(server, 'GET', `/api/farms/${createdFarmId}`);
      assert(checkRes.status === 404, `Expected HTTP 404 after deletion, got ${checkRes.status}`);

      // Verify direct Mongoose null
      const checkDoc = await Farm.findById(createdFarmId);
      assert(checkDoc === null, 'Document still exists in Atlas after deletion');

      console.log(`  [PASS] Test 5 (DELETE): Farm document deleted from Atlas and verified absent.`);
      passed++;
    } catch (e) {
      console.log(`  [FAIL] Test 5 (DELETE): ${e.message}`);
      failed++;
    }

  } finally {
    server.close();
    await disconnectDB();
  }

  // Test 6: Cross-Process Restart Verification
  console.log('\n[Phase 2] Multi-Process Persistence Verification (Process A -> exit -> Process B)...');
  try {
    const restartSuccess = await runProcessRestartVerification();
    assert(restartSuccess === true, 'Process restart persistence verification failed');
    console.log(`  [PASS] Test 6 (PROCESS RESTART): Document survived complete Node.js process termination.`);
    passed++;
  } catch (e) {
    console.log(`  [FAIL] Test 6 (PROCESS RESTART): ${e.message}`);
    failed++;
  }

  // Test 7: Fallback Verification
  console.log('\n[Phase 3] In-Memory Fallback Verification (Offline DB Simulation)...');
  await runFallbackVerification();

  console.log('\n' + '='.repeat(80));
  console.log(`ATLAS PERSISTENCE SUMMARY: ${passed} PASSED, ${failed} FAILED, ${skipped} SKIPPED`);
  console.log('='.repeat(80));

  if (failed > 0) {
    process.exit(1);
  }
  return { atlasVerified: true, fallbackPassed: true };
}

/**
 * Executes two distinct Node.js subprocesses to prove real database persistence.
 */
function runProcessRestartVerification() {
  return new Promise((resolve, reject) => {
    // Script for Process A: Connect, create Farm, output farmId, disconnect, exit
    const scriptA = `
      const path = require('path');
      require('dotenv').config({ path: path.resolve('${__dirname.replace(/\\/g, '/')}', '..', '.env') });
      const { connectDB, disconnectDB } = require('./config/db');
      const farmService = require('./services/farmService');

      async function run() {
        const ok = await connectDB();
        if (!ok) process.exit(2);
        const farm = await farmService.createFarm({
          name: 'AgriSense Process Restart Farm',
          location: { state: 'Karnataka', district: 'Kolar', village: 'RestartVillage' },
          soil: { nitrogen: 88, phosphorus: 44, potassium: 44, ph: 6.8 },
          crop: { name: 'Cotton', growthStage: 'seedling' }
        });
        console.log('CREATED_ID:' + farm._id.toString());
        await disconnectDB();
        process.exit(0);
      }
      run().catch(() => process.exit(1));
    `;

    const procA = spawn('node', ['-e', scriptA], { cwd: path.resolve(__dirname, '..') });
    let outA = '';

    procA.stdout.on('data', d => { outA += d.toString(); });
    procA.on('close', codeA => {
      if (codeA !== 0) {
        return reject(new Error(`Process A exited with code ${codeA}: ${outA}`));
      }

      const match = outA.match(/CREATED_ID:([0-9a-fA-F]{24})/);
      if (!match) {
        return reject(new Error(`Process A failed to return valid farmId. Output: ${outA}`));
      }

      const restartFarmId = match[1];

      // Script for Process B: Connect fresh, retrieve same Farm, verify fields, update, verify update, delete, verify deletion, exit
      const scriptB = `
        const path = require('path');
        require('dotenv').config({ path: path.resolve('${__dirname.replace(/\\/g, '/')}', '..', '.env') });
        const { connectDB, disconnectDB } = require('./config/db');
        const farmService = require('./services/farmService');

        async function run() {
          const ok = await connectDB();
          if (!ok) process.exit(2);

          // 1. Persistent Read & Field Verification
          const farm = await farmService.getFarmById('${restartFarmId}');
          if (!farm || farm.name !== 'AgriSense Process Restart Farm') {
            console.error('Process B: Farm name mismatch or document missing');
            process.exit(3);
          }
          if (!farm.location || farm.location.district !== 'Kolar') {
            console.error('Process B: Location district mismatch');
            process.exit(3);
          }
          if (!farm.soil || farm.soil.nitrogen !== 88) {
            console.error('Process B: Soil nitrogen mismatch');
            process.exit(3);
          }
          if (!farm.crop || farm.crop.name !== 'Cotton') {
            console.error('Process B: Crop name mismatch');
            process.exit(3);
          }

          // 2. Persistent Update
          await farmService.updateFarm('${restartFarmId}', {
            crop: { growthStage: 'flowering' },
            fieldConditions: { soilMoisture: 45.0 }
          });

          // 3. Read-After-Update Verification
          const updated = await farmService.getFarmById('${restartFarmId}');
          if (!updated || updated.crop.growthStage !== 'flowering' || updated.fieldConditions.soilMoisture !== 45.0) {
            console.error('Process B: Read-after-update verification failed');
            process.exit(4);
          }

          // 4. Persistent Delete
          await farmService.deleteFarm('${restartFarmId}');

          // 5. Confirm Deletion
          try {
            await farmService.getFarmById('${restartFarmId}');
            console.error('Process B: Document still exists after deletion');
            process.exit(5);
          } catch (e) {
            if (e.code !== 'FARM_NOT_FOUND') {
              console.error('Process B: Unexpected error checking deletion:', e);
              process.exit(5);
            }
          }

          console.log('CROSS_PROCESS_LIFECYCLE_VERIFIED');
          await disconnectDB();
          process.exit(0);
        }
        run().catch((err) => {
          console.error('Process B uncaught error:', err);
          process.exit(1);
        });
      `;


      const procB = spawn('node', ['-e', scriptB], { cwd: path.resolve(__dirname, '..') });
      let outB = '';

      procB.stdout.on('data', d => { outB += d.toString(); });
      procB.on('close', codeB => {
        if (codeB !== 0) {
          return reject(new Error(`Process B failed to retrieve farm created by Process A. Code: ${codeB}, Log: ${outB}`));
        }
        resolve(true);
      });
    });
  });
}

/**
 * Tests in-memory fallback behavior when MongoDB is offline.
 */
async function runFallbackVerification() {
  try {
    farmService.setMemoryMode(true);
    farmService.clearMemoryStore();

    const fallbackFarm = await farmService.createFarm({
      name: 'Fallback Memory Farm',
      location: { state: 'Punjab', district: 'Ludhiana', village: 'MemoryVillage' },
      soil: { nitrogen: 75, phosphorus: 35, potassium: 35, ph: 7.0 },
      crop: { name: 'Wheat', growthStage: 'vegetative' }
    });

    assert(fallbackFarm._id !== undefined, 'Fallback farm missing _id');
    const retrieved = await farmService.getFarmById(fallbackFarm._id.toString());
    assert(retrieved.name === 'Fallback Memory Farm', 'Fallback retrieval mismatch');

    const updated = await farmService.updateFarm(fallbackFarm._id.toString(), {
      crop: { growthStage: 'ripening' }
    });
    assert(updated.crop.growthStage === 'ripening', 'Fallback update failed');

    await farmService.deleteFarm(fallbackFarm._id.toString());

    farmService.setMemoryMode(false);
    console.log('  [PASS] Test 7 (FALLBACK): In-memory repository functions cleanly when MongoDB is offline.');
    passed++;
  } catch (e) {
    console.log(`  [FAIL] Test 7 (FALLBACK): ${e.message}`);
    failed++;
  }
}

if (require.main === module) {
  runPersistenceSuite().catch((err) => {
    console.error('Fatal suite error:', err);
    process.exit(1);
  });
}

module.exports = runPersistenceSuite;
