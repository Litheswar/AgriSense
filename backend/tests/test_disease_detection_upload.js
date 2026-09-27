require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });
process.env.JWT_SECRET ||= 'test-only-secret-generated-for-agrisense-m23';

const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const app = require('../server');
const aiService = require('../services/aiService');
const farmService = require('../services/farmService');
const Farm = require('../db/models/Farm');
const User = require('../db/models/User');
const { connectDB, disconnectDB } = require('../config/db');
const { createAuthFixture } = require('./helpers/authFixture');

const uploadDirectory = path.resolve(__dirname, '..', 'tmp', 'disease');
let passed = 0;
let failed = 0;

async function requestUpload(base, form, token, options = {}) {
  const headers = { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(options.origin ? { origin: options.origin } : {}) };
  if (options.contentType) headers['content-type'] = options.contentType;
  const response = await fetch(`${base}/api/ai/disease-detection/upload`, {
    method: 'POST', headers,
    body: options.rawBody === undefined ? form : options.rawBody
  });
  let body;
  try { body = await response.json(); } catch { body = null; }
  return { status: response.status, body, headers: response.headers };
}

function formWithImage(bytes, filename = 'leaf.jpg', type = 'image/jpeg') {
  const form = new FormData();
  form.append('image', new Blob([bytes], { type }), filename);
  return form;
}

async function assertNoTemporaryFiles() {
  let entries = [];
  try { entries = await fs.promises.readdir(uploadDirectory); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  assert.deepEqual(entries, [], 'temporary disease upload directory must be empty');
}

async function test(name, action) {
  try {
    await action();
    passed++;
    console.log(`  [PASS] ${name}`);
  } catch (error) {
    failed++;
    console.error(`  [FAIL] ${name}: ${error.message}`);
  }
}

async function main() {
  assert(process.env.MONGODB_URI, 'Atlas configuration is required.');
  assert(await connectDB(), 'MongoDB Atlas connection failed.');
  const initialUsers = await User.countDocuments();
  const initialFarms = await Farm.countDocuments();
  const originalDetectDisease = aiService.detectDisease;
  let userA;
  let userB;
  let farm;
  let server;
  try {
    userA = await createAuthFixture('m23-upload-owner');
    userB = await createAuthFixture('m23-upload-other');
    farm = await farmService.createFarm({
      ownerId: userA.user._id,
      name: 'M23 Temporary Upload Farm',
      location: { state: 'Tamil Nadu', district: 'Coimbatore', village: 'Pollachi', latitude: 10.66, longitude: 77.01 },
      soil: { nitrogen: 90, phosphorus: 45, potassium: 45, ph: 6.8 },
      crop: { name: 'Tomato', growthStage: 'vegetative' },
      fieldConditions: { soilMoisture: 30 },
      weather: { temperature: 28, humidity: 65, rainfall: 15, recentRainfall: 5, rainProbability: 10, expectedRainfall: 0 },
      diseaseContext: { detected: false, disease: null, confidence: 0 },
      marketContext: { market: 'Coimbatore', state: 'Tamil Nadu', district: 'Coimbatore' }
    });
    server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const validImagePath = path.resolve(__dirname, '../models/disease_detection/dataset/raw/Tomato___Late_blight/0003faa8-4b27-4c65-bf42-6d9e352ca1a5___RS_Late.B 4946.JPG');
    const jpeg = await fs.promises.readFile(validImagePath);

    await test('configured frontend origin receives upload CORS headers', async () => {
      const response = await fetch(`${base}/api/ai/disease-detection/upload`, {
        method: 'OPTIONS', headers: { origin: 'http://localhost:5173', 'access-control-request-method': 'POST' }
      });
      assert.equal(response.status, 204);
      assert.equal(response.headers.get('access-control-allow-origin'), 'http://localhost:5173');
    });

    await test('missing image returns 400', async () => {
      const response = await requestUpload(base, new FormData());
      assert.equal(response.status, 400);
      assert.equal(response.body.error.code, 'MISSING_IMAGE');
      await assertNoTemporaryFiles();
    });

    await test('executable renamed to JPEG is rejected by content signature', async () => {
      const response = await requestUpload(base, formWithImage(Buffer.from('MZ executable payload'), 'payload.jpg', 'image/jpeg'));
      assert.equal(response.status, 415);
      assert.equal(response.body.error.code, 'UNSUPPORTED_FILE_CONTENT');
      await assertNoTemporaryFiles();
    });

    await test('unsupported extension is rejected', async () => {
      const response = await requestUpload(base, formWithImage(jpeg, 'leaf.pdf', 'application/pdf'));
      assert.equal(response.status, 415);
      await assertNoTemporaryFiles();
    });

    await test('client MIME mismatch is rejected even when bytes are a valid JPEG', async () => {
      const response = await requestUpload(base, formWithImage(jpeg, 'leaf.jpg', 'image/png'));
      assert.equal(response.status, 415);
      await assertNoTemporaryFiles();
    });

    await test('PNG signature, extension, and MIME are accepted', async () => {
      aiService.detectDisease = async () => ({ success: true, result: { predicted_disease: 'Healthy', confidence: 0.99 } });
      const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNg+M8AAAICAQB7CYF4AAAAAElFTkSuQmCC', 'base64');
      const response = await requestUpload(base, formWithImage(png, 'leaf.png', 'image/png'));
      assert.equal(response.status, 200);
      assert.equal(response.body.result.predicted_disease, 'Healthy');
      await assertNoTemporaryFiles();
      aiService.detectDisease = originalDetectDisease;
    });

    await test('oversized upload is rejected at multipart parser limit', async () => {
      const response = await requestUpload(base, formWithImage(Buffer.alloc(5 * 1024 * 1024 + 1), 'large.jpg', 'image/jpeg'));
      assert.equal(response.status, 413);
      assert.equal(response.body.error.code, 'IMAGE_TOO_LARGE');
      await assertNoTemporaryFiles();
    });

    await test('multiple image files are rejected', async () => {
      const form = formWithImage(jpeg);
      form.append('image', new Blob([jpeg], { type: 'image/jpeg' }), 'second.jpg');
      const response = await requestUpload(base, form);
      assert.equal(response.status, 400);
      assert.equal(response.body.error.code, 'TOO_MANY_FILES');
      await assertNoTemporaryFiles();
    });

    await test('malformed multipart is rejected without filesystem writes', async () => {
      const response = await requestUpload(base, null, undefined, {
        contentType: 'multipart/form-data; boundary=broken-boundary',
        rawBody: '--broken-boundary\r\nContent-Disposition: form-data; name="image"; filename="x.jpg"\r\n'
      });
      assert.equal(response.status, 400);
      assert.equal(response.body.error.code, 'MALFORMED_MULTIPART');
      await assertNoTemporaryFiles();
    });

    await test('malicious filename is rejected', async () => {
      const response = await requestUpload(base, formWithImage(jpeg, 'folder\\..\\payload.jpg', 'image/jpeg'));
      assert.equal(response.status, 400);
      assert.equal(response.body.error.code, 'INVALID_FILENAME');
      await assertNoTemporaryFiles();
    });

    await test('path traversal filename is rejected', async () => {
      const response = await requestUpload(base, formWithImage(jpeg, '../../server.js.jpg', 'image/jpeg'));
      assert.equal(response.status, 400);
      assert.equal(response.body.error.code, 'INVALID_FILENAME');
      await assertNoTemporaryFiles();
    });

    await test('empty file is rejected', async () => {
      const response = await requestUpload(base, formWithImage(Buffer.alloc(0), 'empty.jpg', 'image/jpeg'));
      assert.equal(response.status, 400);
      assert.equal(response.body.error.code, 'EMPTY_FILE');
      await assertNoTemporaryFiles();
    });

    await test('wrong file signature is rejected', async () => {
      const response = await requestUpload(base, formWithImage(Buffer.from('<html>not an image</html>'), 'page.jpg', 'image/jpeg'));
      assert.equal(response.status, 415);
      await assertNoTemporaryFiles();
    });

    await test('farm context upload requires authentication', async () => {
      const protectedForm = formWithImage(jpeg);
      protectedForm.append('farmId', farm._id.toString());
      const protectedResponse = await requestUpload(base, protectedForm);
      assert.equal(protectedResponse.status, 401);
      await assertNoTemporaryFiles();
    });

    await test('another user cannot infer or update the Farm context', async () => {
      const form = formWithImage(jpeg);
      form.append('farmId', farm._id.toString());
      const response = await requestUpload(base, form, userB.token);
      assert.equal(response.status, 404);
      assert.equal(response.body.error.code, 'FARM_NOT_FOUND');
      await assertNoTemporaryFiles();
    });

    await test('standalone upload returns inference response without persisting an image', async () => {
      aiService.detectDisease = async () => ({ success: true, result: { predicted_disease: 'Healthy', confidence: 0.99 } });
      const response = await requestUpload(base, formWithImage(jpeg));
      assert.equal(response.status, 200);
      assert.equal(response.body.result.predicted_disease, 'Healthy');
      assert.equal(JSON.stringify(response.body).includes(uploadDirectory), false);
      await assertNoTemporaryFiles();
    });

    await test('malformed image inference failure cleans temporary file', async () => {
      aiService.detectDisease = async () => { const error = new Error('private path must not escape'); error.code = 'DiseaseInferenceError'; throw error; };
      const corruptedJpeg = Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x11, 0x22]);
      const response = await requestUpload(base, formWithImage(corruptedJpeg, 'corrupt.jpg', 'image/jpeg'));
      assert.equal(response.status, 400);
      assert.equal(JSON.stringify(response.body).includes('private path'), false);
      await assertNoTemporaryFiles();
    });

    await test('owned upload runs real inference, updates only diseaseContext, and cleans up', async () => {
      aiService.detectDisease = originalDetectDisease;
      const beforeDoc = await Farm.findById(farm._id).lean();
      const before = JSON.parse(JSON.stringify({
        ownerId: beforeDoc.ownerId,
        location: beforeDoc.location,
        soil: beforeDoc.soil,
        crop: beforeDoc.crop,
        fieldConditions: beforeDoc.fieldConditions,
        weather: beforeDoc.weather,
        marketContext: beforeDoc.marketContext
      }));
      const form = formWithImage(jpeg, 'tomato-leaf.jpg', 'image/jpeg');
      form.append('farmId', farm._id.toString());
      const response = await requestUpload(base, form, userA.token);
      assert.equal(response.status, 200, JSON.stringify(response.body));
      assert.equal(response.body.task, 'disease_detection');
      assert.equal(typeof response.body.result.predicted_disease, 'string');
      assert.equal(typeof response.body.diseaseContext.detected, 'boolean');
      assert.equal(JSON.stringify(response.body).includes(uploadDirectory), false);

      const afterDoc = await Farm.findById(farm._id).lean();
      const after = JSON.parse(JSON.stringify({
        ownerId: afterDoc.ownerId,
        location: afterDoc.location,
        soil: afterDoc.soil,
        crop: afterDoc.crop,
        fieldConditions: afterDoc.fieldConditions,
        weather: afterDoc.weather,
        marketContext: afterDoc.marketContext
      }));
      assert.deepEqual(after, before);
      assert.deepEqual(afterDoc.diseaseContext, response.body.diseaseContext);
      await assertNoTemporaryFiles();
    });
  } finally {
    aiService.detectDisease = originalDetectDisease;
    if (server) await new Promise(resolve => server.close(resolve));
    if (farm) await Farm.deleteOne({ _id: farm._id });
    if (userA) await User.deleteOne({ _id: userA.user._id });
    if (userB) await User.deleteOne({ _id: userB.user._id });
    await assertNoTemporaryFiles();
    const finalUsers = await User.countDocuments();
    const finalFarms = await Farm.countDocuments();
    console.log(`Atlas cleanup: users ${initialUsers} → ${finalUsers}; farms ${initialFarms} → ${finalFarms}.`);
    assert.equal(finalUsers, initialUsers);
    assert.equal(finalFarms, initialFarms);
    await disconnectDB();
  }

  console.log(`Disease image upload suite: ${passed} passed, ${failed} failed.`);
  if (failed) process.exitCode = 1;
}

main().catch(error => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
