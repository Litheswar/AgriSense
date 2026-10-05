// Real authenticated HTTP workflow against the configured MongoDB Atlas database.
const path = require('path');
const assert = require('node:assert/strict');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const app = require('../server');
const User = require('../db/models/User');
const Farm = require('../db/models/Farm');
const { connectDB, disconnectDB } = require('../config/db');

async function call(base, method, url, token, body) {
  const response = await fetch(`${base}${url}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {})
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  const data = await response.json();
  assert(response.ok, `${method} ${url}: ${response.status} ${JSON.stringify(data)}`);
  return data;
}

async function main() {
  assert(process.env.MONGODB_URI, 'Atlas configuration is required.');
  assert(await connectDB(), 'MongoDB connection failed.');
  const initialUsers = await User.countDocuments();
  const initialFarms = await Farm.countDocuments();
  let userId;
  let farmId;
  const server = app.listen(0, '127.0.0.1');
  try {
    await new Promise(resolve => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const credentials = { name: 'M22 Workflow', email: `m22-${suffix}@example.test`, password: 'frontend-workflow-22' };
    const registered = await call(base, 'POST', '/api/auth/register', null, credentials);
    userId = registered.user.id;
    assert.deepEqual(Object.keys(registered.user).sort(), ['email', 'id', 'name']);
    const login = await call(base, 'POST', '/api/auth/login', null, { email: credentials.email, password: credentials.password });
    const token = login.token;
    assert.equal((await call(base, 'GET', '/api/auth/me', token)).user.id, userId);

    const created = await call(base, 'POST', '/api/farms', token, {
      name: 'M22 Authenticated Workflow Farm',
      location: { state: 'Tamil Nadu', district: 'Coimbatore', village: 'Pollachi', latitude: 10.66, longitude: 77.01 },
      soil: { nitrogen: 90, phosphorus: 45, potassium: 45, ph: 6.8 },
      crop: { name: 'Tomato', growthStage: 'vegetative' },
      fieldConditions: { soilMoisture: 30 },
      diseaseContext: { detected: false, disease: null, confidence: 0 },
      marketContext: { market: 'Coimbatore', state: 'Tamil Nadu', district: 'Coimbatore' }
    });
    farmId = created.farm._id;
    assert.equal(created.farm.ownerId.toString(), userId);
    assert.equal((await call(base, 'GET', '/api/farms', token)).count, 1);
    assert.equal((await call(base, 'GET', `/api/farms/${farmId}`, token)).farm._id, farmId);
    assert.equal((await call(base, 'GET', `/api/farms/${farmId}/shared-state`, token)).sharedFarmState.farmId, farmId);
    await call(base, 'GET', `/api/farms/${farmId}/weather`, token);
    for (const endpoint of ['crop-recommendation', 'irrigation', 'fertilizer', 'disease-risk', 'market', 'crop-ranking']) {
      const result = await call(base, 'GET', `/api/farms/${farmId}/${endpoint}`, token);
      assert.equal(result.success, true, `${endpoint} response success flag`);
    }
    const evaluation = await call(base, 'GET', `/api/farms/${farmId}/evaluation`, token);
    assert.equal(evaluation.success, true);
    assert.equal(evaluation.farmId, farmId);
    const deleted = await call(base, 'DELETE', `/api/farms/${farmId}`, token);
    assert.equal(deleted.result.deleted, true);
    farmId = null;
    assert.equal(await Farm.countDocuments({ ownerId: userId }), 0);
    console.log('Authenticated frontend workflow: 16 HTTP/API assertions passed.');
  } finally {
    await new Promise(resolve => server.close(resolve));
    if (farmId) await Farm.deleteOne({ _id: farmId });
    if (userId) await User.deleteOne({ _id: userId });
    const finalUsers = await User.countDocuments();
    const finalFarms = await Farm.countDocuments();
    console.log(`Atlas workflow cleanup: users ${initialUsers} → ${finalUsers}; farms ${initialFarms} → ${finalFarms}.`);
    assert.equal(finalUsers, initialUsers, 'temporary user cleanup');
    assert.equal(finalFarms, initialFarms, 'temporary farm cleanup');
    await disconnectDB();
  }
}

main().catch(error => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
