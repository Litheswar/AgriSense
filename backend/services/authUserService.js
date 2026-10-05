const fs = require('node:fs/promises');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const User = require('../db/models/User');
const { getConnectionStatus } = require('../config/db');

const LOCAL_USERS_PATH = path.resolve(__dirname, '..', 'data', 'auth-users.json');
const localFallbackAllowed = process.env.NODE_ENV !== 'production';
let writeQueue = Promise.resolve();

async function readLocalUsers() {
  try {
    const data = await fs.readFile(LOCAL_USERS_PATH, 'utf8');
    const users = JSON.parse(data);
    if (!Array.isArray(users)) throw new Error('Local account store is invalid.');
    return users;
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

function updateLocalUsers(update) {
  const operation = writeQueue.then(async () => {
    const users = await readLocalUsers();
    const result = await update(users);
    if (result.write) {
      await fs.mkdir(path.dirname(LOCAL_USERS_PATH), { recursive: true });
      const temporaryPath = `${LOCAL_USERS_PATH}.${process.pid}.tmp`;
      await fs.writeFile(temporaryPath, `${JSON.stringify(users, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
      await fs.rename(temporaryPath, LOCAL_USERS_PATH);
    }
    return result.value;
  });
  writeQueue = operation.catch(() => {});
  return operation;
}

function localAccountError() {
  const error = new Error('Account database is unavailable.');
  error.code = 'AUTH_DATABASE_UNAVAILABLE';
  return error;
}

async function createUser({ name, email, passwordHash }) {
  return updateLocalUsers(async users => {
    if (users.some(user => user.email === email)) {
      const duplicate = new Error('An account with that email already exists.');
      duplicate.code = 11000;
      throw duplicate;
    }
    if (getConnectionStatus()) {
      const user = await User.create({ name, email, passwordHash });
      return { value: user, write: false };
    }
    if (!localFallbackAllowed) throw localAccountError();
    const user = { _id: randomBytes(12).toString('hex'), name, email, passwordHash };
    users.push(user);
    return { value: user, write: true };
  });
}

async function findByEmail(email) {
  if (getConnectionStatus()) {
    try {
      const user = await User.findOne({ email }).select('+passwordHash').lean();
      if (user) return user;
    } catch (error) {
      if (!localFallbackAllowed) throw error;
    }
  }
  if (!localFallbackAllowed) return null;
  return (await readLocalUsers()).find(user => user.email === email) || null;
}

async function findById(id) {
  if (getConnectionStatus()) {
    try {
      const user = await User.findById(id).select('name email').lean();
      if (user) return user;
    } catch (error) {
      if (!localFallbackAllowed) throw error;
    }
  }
  if (!localFallbackAllowed) return null;
  return (await readLocalUsers()).find(user => user._id === id) || null;
}

module.exports = { createUser, findByEmail, findById };
