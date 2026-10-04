/**
 * Explicitly assign verified ownership to legacy ownerless Farms.
 *
 * Dry run:
 *   node scripts/migrateLegacyFarmOwner.js --dry-run --owner <userId>
 * Execute:
 *   MIGRATE_LEGACY_FARMS=YES node scripts/migrateLegacyFarmOwner.js --owner <userId>
 * Scope selected Farms with one or more --farm <farmId> arguments. Without
 * --farm, every currently ownerless Farm is selected after explicit confirmation.
 * Existing owners are never overwritten.
 */
const mongoose = require('mongoose');
const { connectDB, disconnectDB } = require('../config/db');
const User = require('../db/models/User');
const Farm = require('../db/models/Farm');

function readArgs(argv) {
  const args = { dryRun: false, ownerId: process.env.LEGACY_FARM_OWNER_USER_ID || null, farmIds: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--owner' || arg === '--owner-id') args.ownerId = argv[++index];
    else if (arg === '--farm' || arg === '--farm-id') args.farmIds.push(argv[++index]);
    else throw new Error(`Unknown argument '${arg}'.`);
  }
  return args;
}

function ownerlessFilter() {
  return { $or: [{ ownerId: { $exists: false } }, { ownerId: null }] };
}

async function main() {
  const args = readArgs(process.argv.slice(2));
  if (!args.dryRun && process.env.MIGRATE_LEGACY_FARMS !== 'YES') {
    throw new Error('Set MIGRATE_LEGACY_FARMS=YES to confirm this explicit migration.');
  }
  if (args.ownerId && !mongoose.Types.ObjectId.isValid(args.ownerId)) {
    throw new Error('--owner must be a valid User ObjectId.');
  }
  if (args.farmIds.some(id => !mongoose.Types.ObjectId.isValid(id))) {
    throw new Error('Every --farm value must be a valid Farm ObjectId.');
  }
  if (!await connectDB()) throw new Error('MongoDB connection failed.');

  try {
    const legacyFilter = ownerlessFilter();
    const [totalFarms, ownerlessCount, userCount] = await Promise.all([
      Farm.countDocuments({}),
      Farm.countDocuments(legacyFilter),
      User.countDocuments({})
    ]);
    console.log(`Legacy Farms found: ${totalFarms}`);
    console.log(`Ownerless Farms: ${ownerlessCount}`);
    console.log(`Existing Users: ${userCount}`);

    if (!args.ownerId) {
      console.log('Migration cannot proceed: a verified User ID is required.');
      return;
    }
    if (!await User.exists({ _id: args.ownerId })) {
      throw new Error('The selected User does not exist. No changes made.');
    }

    const targetFilter = args.farmIds.length
      ? { ...legacyFilter, _id: { $in: args.farmIds } }
      : legacyFilter;
    const targetCount = await Farm.countDocuments(targetFilter);
    if (args.farmIds.length !== targetCount) {
      throw new Error('One or more selected Farms are missing or already have an owner. No changes made.');
    }

    console.log(`Target owner: ${args.ownerId}`);
    console.log(`Farms selected: ${targetCount}`);
    console.log('Existing owners overwritten: 0');
    if (args.dryRun) {
      console.log('Dry run: no database changes made.');
      return;
    }

    const result = await Farm.updateMany(targetFilter, { $set: { ownerId: new mongoose.Types.ObjectId(args.ownerId) } });
    console.log(`Migration complete: ${result.modifiedCount} Farms assigned.`);
  } finally {
    await disconnectDB();
  }
}

main().catch(error => {
  console.error(error.message || 'Legacy Farm ownership migration failed.');
  process.exitCode = 1;
});