/**
 * AgriSense — AI Service Configuration (Milestone 17).
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

module.exports = {
  // Python Interpreter executable
  pythonPath: process.env.PYTHON_PATH || 'python',

  // Absolute path to Python dispatcher script
  dispatcherPath: path.resolve(__dirname, '..', 'ai', 'dispatcher.py'),

  // Python AI HTTP Microservice URL (optional fast path)
  aiServerUrl: process.env.AI_SERVER_URL || 'http://127.0.0.1:5001',

  // Timeout in milliseconds for AI requests (30s provides sufficient headroom for cold-start ML imports on Windows)
  requestTimeoutMs: parseInt(process.env.AI_TIMEOUT_MS, 10) || 30000,

  // Express Server Port
  port: parseInt(process.env.PORT, 10) || 5000
};
