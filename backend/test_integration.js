/**
 * AgriSense — Node.js Integration Test Suite (Milestone 17).
 *
 * Verifies:
 * - Test 1: AI health check works.
 * - Test 2: Valid crop recommendation request works (real Random Forest).
 * - Test 3: Missing crop recommendation field fails cleanly.
 * - Test 4: Unsupported task fails cleanly.
 * - Test 5: Malformed request fails cleanly.
 * - Test 6: Python/AI service error converts to clean Node.js error object.
 * - Test 7: Complete HTTP request/response flow via Express server.
 * - Test 8: Irrigation engine integration.
 * - Test 9: Fertilizer engine integration.
 * - Test 10: Disease risk engine integration.
 * - Test 11: Market intelligence integration.
 * - Test 12: Crop ranking engine integration.
 * - Test 13: Disease detection end-to-end integration (aiService + HTTP route).
 */

const path = require('path');
const http = require('http');
const app = require('./server');
const aiService = require('./services/aiService');

let passed = 0;
let failed = 0;
const total = 13;

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
  console.log('AGRISENSE — NODE.JS ↔ PYTHON AI INTEGRATION TEST SUITE (MILESTONE 17)');
  console.log('='.repeat(80));

  // Start ephemeral HTTP server on random port
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  try {
    // Test 1: AI health check
    try {
      const health = await aiService.checkHealth();
      assert(health.success === true, 'Health check failed success flag');
      assert(health.result.status === 'healthy', 'Health status is not healthy');
      assert(Array.isArray(health.result.supported_tasks), 'supported_tasks is not an array');
      console.log('  [PASS] Test 1: AI health check returned healthy status.');
      passed++;
    } catch (e) {
      console.log(`  [FAIL] Test 1: ${e.message || JSON.stringify(e)}`);
      failed++;
    }

    // Test 2: Valid crop recommendation (Real Random Forest)
    try {
      const soilInput = {
        N: 90.0,
        P: 42.0,
        K: 43.0,
        temperature: 20.8,
        humidity: 82.0,
        ph: 6.5,
        rainfall: 202.0
      };
      const res = await aiService.predictCrop(soilInput);
      assert(res.success === true, 'Crop recommendation response failed');
      assert(typeof res.result.predicted_crop === 'string', 'predicted_crop is not a string');
      assert(res.result.predicted_crop === 'rice', `Expected rice, got ${res.result.predicted_crop}`);
      assert(res.result.confidence > 0.8, 'Confidence is unexpectedly low');
      assert(Array.isArray(res.result.top_3), 'top_3 is not an array');
      console.log(`  [PASS] Test 2: Crop recommendation inference succeeded (Predicted: ${res.result.predicted_crop}, Confidence: ${res.result.confidence}).`);
      passed++;
    } catch (e) {
      console.log(`  [FAIL] Test 2: ${e.message || JSON.stringify(e)}`);
      failed++;
    }

    // Test 3: Missing crop recommendation field fails cleanly
    try {
      const badSoilInput = {
        N: 90.0,
        P: 42.0
        // Missing K, temperature, humidity, ph, rainfall
      };
      try {
        await aiService.predictCrop(badSoilInput);
        console.log('  [FAIL] Test 3: Expected error on missing fields, but request succeeded.');
        failed++;
      } catch (err) {
        assert(err.success === false, 'Error response missing success: false');
        assert(err.error.code === 'CropInferenceError', `Unexpected error code: ${err.error.code}`);
        console.log(`  [PASS] Test 3: Missing field rejected cleanly with code: ${err.error.code}.`);
        passed++;
      }
    } catch (e) {
      console.log(`  [FAIL] Test 3: ${e.message || JSON.stringify(e)}`);
      failed++;
    }

    // Test 4: Unsupported task fails cleanly
    try {
      try {
        await aiService.executeTask('unsupported_quantum_ml', {});
        console.log('  [FAIL] Test 4: Expected error on unsupported task, but request succeeded.');
        failed++;
      } catch (err) {
        assert(err.success === false, 'Error response missing success: false');
        assert(err.error.code === 'UNSUPPORTED_TASK', `Unexpected error code: ${err.error.code}`);
        console.log(`  [PASS] Test 4: Unsupported task rejected cleanly with code: ${err.error.code}.`);
        passed++;
      }
    } catch (e) {
      console.log(`  [FAIL] Test 4: ${e.message || JSON.stringify(e)}`);
      failed++;
    }

    // Test 5: Malformed payload fails cleanly
    try {
      try {
        await aiService.executeTask('crop_recommendation', 'not_a_json_object');
        console.log('  [FAIL] Test 5: Expected error on non-object payload, but request succeeded.');
        failed++;
      } catch (err) {
        assert(err.success === false, 'Error response missing success: false');
        assert(err.error.code === 'CropInferenceError' || err.error.code === 'INVALID_PAYLOAD', `Unexpected error code: ${err.error.code}`);
        console.log(`  [PASS] Test 5: Malformed payload rejected cleanly with code: ${err.error.code}.`);
        passed++;
      }
    } catch (e) {
      console.log(`  [FAIL] Test 5: ${e.message || JSON.stringify(e)}`);
      failed++;
    }

    // Test 6: Python/AI error conversion to structured Node.js response
    try {
      try {
        await aiService.executeTask('irrigation', {
          crop: 'Tomato',
          soil_moisture: -50 // Invalid negative moisture
        });
        console.log('  [FAIL] Test 6: Expected error on invalid irrigation values, but succeeded.');
        failed++;
      } catch (err) {
        assert(err.success === false, 'Error missing success: false');
        assert(err.error && typeof err.error.message === 'string', 'Error missing message string');
        console.log(`  [PASS] Test 6: Python exception converted to structured JSON error (${err.error.code}: ${err.error.message}).`);
        passed++;
      }
    } catch (e) {
      console.log(`  [FAIL] Test 6: ${e.message || JSON.stringify(e)}`);
      failed++;
    }

    // Test 7: Complete HTTP End-to-End POST /api/ai/crop-recommendation
    try {
      const httpRes = await makeHttpRequest(server, 'POST', '/api/ai/crop-recommendation', {
        N: 120.0,
        P: 48.0,
        K: 20.0,
        temperature: 24.5,
        humidity: 80.2,
        ph: 6.8,
        rainfall: 85.0
      });

      assert(httpRes.status === 200, `Expected HTTP status 200, got ${httpRes.status}`);
      assert(httpRes.body.success === true, 'HTTP response missing success: true');
      assert(httpRes.body.result.predicted_crop === 'cotton', `Expected cotton, got ${httpRes.body.result.predicted_crop}`);
      console.log(`  [PASS] Test 7: HTTP POST /api/ai/crop-recommendation succeeded (Predicted: ${httpRes.body.result.predicted_crop}).`);
      passed++;
    } catch (e) {
      console.log(`  [FAIL] Test 7: ${e.message || JSON.stringify(e)}`);
      failed++;
    }

    // Test 8: End-to-End HTTP POST /api/ai/irrigation
    try {
      const httpRes = await makeHttpRequest(server, 'POST', '/api/ai/irrigation', {
        crop: 'Tomato',
        growth_stage: 'vegetative',
        soil_moisture: 25.0, // Dry (< 30)
        temperature: 38.0,   // Hot (> 35)
        humidity: 30.0,      // Low (< 40)
        rain_probability: 5.0,
        expected_rainfall: 0.0
      });

      assert(httpRes.status === 200, `Expected HTTP status 200, got ${httpRes.status}`);
      assert(httpRes.body.result.irrigation_required === true, 'Expected irrigation_required: true');
      assert(httpRes.body.result.urgency === 'high', `Expected high urgency, got ${httpRes.body.result.urgency}`);
      console.log('  [PASS] Test 8: HTTP POST /api/ai/irrigation evaluated correctly (Urgency: High).');
      passed++;
    } catch (e) {
      console.log(`  [FAIL] Test 8: ${e.message || JSON.stringify(e)}`);
      failed++;
    }

    // Test 9: End-to-End HTTP POST /api/ai/fertilizer
    try {
      const httpRes = await makeHttpRequest(server, 'POST', '/api/ai/fertilizer', {
        N: 20.0, // Low N
        P: 40.0,
        K: 50.0,
        ph: 6.5,
        crop: 'Tomato',
        growth_stage: 'vegetative',
        disease_status: { detected: false }
      });

      assert(httpRes.status === 200, `Expected HTTP status 200, got ${httpRes.status}`);
      assert(httpRes.body.result.nutrient_status.N === 'low', 'Expected N to be low');
      assert(httpRes.body.result.priority_nutrients.includes('N'), 'Expected N in priority_nutrients');
      console.log('  [PASS] Test 9: HTTP POST /api/ai/fertilizer evaluated correctly.');
      passed++;
    } catch (e) {
      console.log(`  [FAIL] Test 9: ${e.message || JSON.stringify(e)}`);
      failed++;
    }

    // Test 10: End-to-End HTTP POST /api/ai/disease-risk
    try {
      const httpRes = await makeHttpRequest(server, 'POST', '/api/ai/disease-risk', {
        crop: 'Tomato',
        growth_stage: 'flowering',
        temperature: 24.0,
        humidity: 85.0,
        rainfall: 15.0,
        recent_rainfall: 30.0
      });

      assert(httpRes.status === 200, `Expected HTTP status 200, got ${httpRes.status}`);
      assert(httpRes.body.result.risk_level === 'High', `Expected High risk, got ${httpRes.body.result.risk_level}`);
      console.log(`  [PASS] Test 10: HTTP POST /api/ai/disease-risk evaluated correctly (Risk: ${httpRes.body.result.risk_level}).`);
      passed++;
    } catch (e) {
      console.log(`  [FAIL] Test 10: ${e.message || JSON.stringify(e)}`);
      failed++;
    }

    // Test 11: End-to-End HTTP POST /api/ai/market
    try {
      const httpRes = await makeHttpRequest(server, 'POST', '/api/ai/market', {
        crop: 'Tomato',
        market: 'Kolar',
        state: 'Karnataka'
      });

      assert(httpRes.status === 200, `Expected HTTP status 200, got ${httpRes.status}`);
      assert(httpRes.body.result.status === 'SUCCESS', 'Expected market result status SUCCESS');
      assert(httpRes.body.result.current_price === 2300.0, `Expected price 2300.0, got ${httpRes.body.result.current_price}`);
      assert(httpRes.body.result.trend === 'Increasing', `Expected Increasing, got ${httpRes.body.result.trend}`);
      console.log(`  [PASS] Test 11: HTTP POST /api/ai/market evaluated correctly (Price: ${httpRes.body.result.current_price}, Trend: ${httpRes.body.result.trend}).`);
      passed++;
    } catch (e) {
      console.log(`  [FAIL] Test 11: ${e.message || JSON.stringify(e)}`);
      failed++;
    }

    // Test 12: End-to-End HTTP POST /api/ai/crop-ranking
    try {
      const httpRes = await makeHttpRequest(server, 'POST', '/api/ai/crop-ranking', {
        candidates: [
          { crop: 'Tomato', probability: 0.6 },
          { crop: 'Potato', probability: 0.4 }
        ],
        market_context: { market: 'Kolar', state: 'Karnataka' }
      });

      assert(httpRes.status === 200, `Expected HTTP status 200, got ${httpRes.status}`);
      assert(httpRes.body.result.status === 'SUCCESS', 'Expected ranking status SUCCESS');
      assert(httpRes.body.result.ranked_crops[0].crop === 'Tomato', 'Expected Tomato rank #1');
      console.log(`  [PASS] Test 12: HTTP POST /api/ai/crop-ranking evaluated correctly (Top Ranked: ${httpRes.body.result.ranked_crops[0].crop}).`);
      passed++;
    } catch (e) {
      console.log(`  [FAIL] Test 12: ${e.message || JSON.stringify(e)}`);
      failed++;
    }

    // Test 13: End-to-End Disease Detection (aiService.detectDisease + HTTP POST /api/ai/disease-detection)
    try {
      const testImagePath = path.resolve(__dirname, 'models/disease_detection/dataset/raw/Potato___healthy/00fc2ee5-729f-4757-8aeb-65c3355874f2___RS_HL 1864.JPG');

      // Part A: aiService direct method
      const serviceRes = await aiService.detectDisease(testImagePath);
      assert(serviceRes.success === true, 'aiService.detectDisease failed');
      assert(serviceRes.result.predicted_disease === 'Healthy', `Expected Healthy, got ${serviceRes.result.predicted_disease}`);
      assert(serviceRes.result.crop === 'Potato', `Expected Potato, got ${serviceRes.result.crop}`);
      assert(serviceRes.result.confidence > 0.8, 'Expected confidence > 0.8');

      // Part B: Full HTTP Express endpoint
      const httpRes = await makeHttpRequest(server, 'POST', '/api/ai/disease-detection', {
        image_path: testImagePath
      });
      assert(httpRes.status === 200, `Expected HTTP status 200, got ${httpRes.status}`);
      assert(httpRes.body.success === true, 'HTTP response missing success: true');
      assert(httpRes.body.result.predicted_disease === 'Healthy', `Expected Healthy, got ${httpRes.body.result.predicted_disease}`);
      assert(Array.isArray(httpRes.body.result.top_3), 'Expected top_3 array');

      console.log(`  [PASS] Test 13: Disease detection end-to-end verified via aiService and HTTP POST (Crop: ${httpRes.body.result.crop}, Disease: ${httpRes.body.result.predicted_disease}).`);
      passed++;
    } catch (e) {
      console.log(`  [FAIL] Test 13: ${e.message || JSON.stringify(e)}`);
      failed++;
    }

  } finally {
    server.close();
  }

  console.log('='.repeat(80));
  console.log(`TEST SUMMARY: ${passed}/${total} PASSED, ${failed}/${total} FAILED`);
  console.log('='.repeat(80));

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Unhandled test suite error:', err);
  process.exit(1);
});
