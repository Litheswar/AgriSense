/** Explicitly assign only legacy ownerless Farms after a human identifies their owner.
 * Required env: MIGRATE_LEGACY_FARMS=YES and LEGACY_FARM_OWNER_USER_ID=<existing User ObjectId>.
 * This script never creates users, overwrites owners, or deletes data.
 */
const mongoose = require('mongoose');
const { connectDB, disconnectDB } = require('../config/db');
const User = require('../db/models/User');
const Farm = require('../db/models/Farm');

async function main() {
  if (process.env.MIGRATE_LEGACY_FARMS !== 'YES') throw new Error('Set MIGRATE_LEGACY_FARMS=YES to confirm this explicit migration.');
  const ownerId = process.env.LEGACY_FARM_OWNER_USER_ID;
  if (!ownerId || !mongoose.Types.ObjectId.isValid(ownerId)) throw new Error('LEGACY_FARM_OWNER_USER_ID must be a valid existing User ObjectId.');
  if (!await connectDB()) throw new Error('MongoDB connection failed.');
  try {
    if (!await User.exists({ _id: ownerId })) throw new Error('The selected User does not exist.');
    const before = await Farm.countDocuments({ $or: [{ ownerId: { $exists: false } }, { ownerId: null }] });
    const result = await Farm.updateMany(
      { $or: [{ ownerId: { $exists: false } }, { ownerId: null }] },
      { $set: { ownerId: new mongoose.Types.ObjectId(ownerId) } }
    );
    console.log(`Ownerless farms before: ${before}; assigned: ${result.modifiedCount}.`);
  } finally {
    await disconnectDB();
  }
}

main().catch(error => {
  console.error(error.message || 'Legacy Farm ownership migration failed.');
  process.exitCode = 1;
});
