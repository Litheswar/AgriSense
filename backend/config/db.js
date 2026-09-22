/**
 * AgriSense — MongoDB Connection Configuration (Milestone 18).
 *
 * Connects to MongoDB via Mongoose using MONGODB_URI.
 * Ensures clean startup and safe handling when database credentials are not yet configured.
 */

const path = require('path');
const mongoose = require('mongoose');

// Always load backend/.env deterministically regardless of caller process.cwd()
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const DEFAULT_FALLBACK_URI = 'mongodb://localhost:27017/agrisense';
let isConnected = false;
let lastConnectionError = null;

/**
 * Strips password from MongoDB connection string for safe logging.
 */
function sanitizeUri(rawUri) {
  if (!rawUri) return '';
  return rawUri.replace(/:\/\/([^:]+):([^@]+)@/, '://$1:****@');
}

/**
 * Connect to MongoDB database.
 * @param {string} [uri] Optional override URI
 * @returns {Promise<boolean>} True if connected, false if skipped/failed
 */
async function connectDB(uri = null) {
  if (isConnected && mongoose.connection.readyState === 1) {
    return true;
  }

  const targetUri = uri || process.env.MONGODB_URI || DEFAULT_FALLBACK_URI;

  try {
    const conn = await mongoose.connect(targetUri, {
      serverSelectionTimeoutMS: 5000 // Timeout if MongoDB is offline / unreachable
    });
    isConnected = true;
    lastConnectionError = null;
    console.log(`[AgriSense DB] MongoDB Connected: ${conn.connection.host}/${conn.connection.name}`);
    return true;
  } catch (error) {
    lastConnectionError = error;
    const safeUri = sanitizeUri(targetUri);
    console.warn(`[AgriSense DB Warning] Could not connect to MongoDB at ${safeUri}: ${error.message}`);
    if (error.cause && error.cause.message) {
      console.warn(`[AgriSense DB Cause] ${sanitizeUri(error.cause.message)}`);
    }
    console.warn(`[AgriSense DB Warning] Application will run with in-memory repository active for farm state.`);
    isConnected = false;
    return false;
  }
}

/**
 * Disconnect from MongoDB.
 */
async function disconnectDB() {
  if (mongoose.connection && mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
    isConnected = false;
  }
}

function getConnectionStatus() {
  return isConnected && mongoose.connection.readyState === 1;
}

function getLastConnectionError() {
  return lastConnectionError;
}

function getDetailedStatus() {
  const stateMap = { 0: 'disconnected', 1: 'connected', 2: 'connecting', 3: 'disconnecting' };
  const stateCode = mongoose.connection ? mongoose.connection.readyState : 0;
  return {
    isConnected: stateCode === 1,
    state: stateMap[stateCode] || 'disconnected',
    host: mongoose.connection && mongoose.connection.host ? mongoose.connection.host : null,
    database: mongoose.connection && mongoose.connection.name ? mongoose.connection.name : null
  };
}

module.exports = {
  connectDB,
  disconnectDB,
  getConnectionStatus,
  getLastConnectionError,
  getDetailedStatus,
  sanitizeUri,
  MONGODB_URI: process.env.MONGODB_URI || DEFAULT_FALLBACK_URI
};

