const User = require('../../db/models/User');
const Farm = require('../../db/models/Farm');
const { issueToken } = require('../../services/authTokenService');
const { hashPassword } = require('../../services/passwordService');

async function createAuthFixture(label) {
  const user = await User.create({
    name: `${label} Test User`,
    email: `${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now()}-${Math.random().toString(16).slice(2)}@example.test`,
    passwordHash: await hashPassword(`fixture-password-${Math.random()}`)
  });
  return { user, token: issueToken(user._id) };
}

function injectFarmOwner(farmService, ownerId) {
  const original = farmService.createFarm;
  farmService.createFarm = data => original.call(farmService, { ...data, ownerId: data && data.ownerId || ownerId });
  return async () => {
    farmService.createFarm = original;
    await Farm.deleteMany({ ownerId });
    await User.deleteOne({ _id: ownerId });
  };
}

module.exports = { createAuthFixture, injectFarmOwner };
