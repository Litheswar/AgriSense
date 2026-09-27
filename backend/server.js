/**
 * AgriSense — Main Express Server (Milestone 17).
 */

const express = require('express');
const cors = require('cors');
const aiRoutes = require('./routes/aiRoutes');
const farmRoutes = require('./routes/farmRoutes');
const authRoutes = require('./routes/authRoutes');
const config = require('./config/aiConfig');
const { connectDB, getDetailedStatus } = require('./config/db');
const farmService = require('./services/farmService');

const app = express();

// JWTs are sent in the Authorization header; browser cookies are not used.
// Permit same-origin/non-browser requests and explicitly configured frontend origins.
const allowedOrigins = new Set(
  (process.env.FRONTEND_ORIGIN || 'http://localhost:5173')
    .split(',').map(origin => origin.trim()).filter(Boolean)
);
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin)) return callback(null, true);
    const error = new Error('Origin is not allowed by CORS.');
    error.status = 403;
    error.code = 'CORS_ORIGIN_DENIED';
    return callback(error);
  },
  credentials: false
}));
app.use(express.json({ limit: '100kb', strict: true }));

// Root health & status
app.get('/', (req, res) => {
  const dbStatus = getDetailedStatus();
  res.status(200).json({
    service: 'AgriSense Backend API',
    status: 'online',
    version: '1.1.0',
    milestone: 'Milestone 18 — Shared Farm State + MongoDB Data Layer',
    database: {
      provider: 'mongodb',
      connected: dbStatus.isConnected,
      state: dbStatus.state,
      mode: farmService._useLiveDB() ? 'mongodb' : 'in-memory-fallback',
      host: dbStatus.host,
      database: dbStatus.database
    }
  });
});

// Mount routes
app.use('/api/ai', aiRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/farms', farmRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: 'Resource not found.'
    }
  });
});

// Global error handler
app.use((err, req, res, next) => {
  // Error objects from JSON parsers can retain the raw request body (including passwords).
  console.error('[AgriSense Server Error]', err && (err.code || err.name) || 'unknown error');
  const status = Number.isInteger(err.status) && err.status >= 400 && err.status < 500 ? err.status : 500;
  const knownClientError = status === 400 || status === 413 || status === 415 || status === 403;
  const code = status === 400 ? 'INVALID_JSON'
    : status === 413 ? 'PAYLOAD_TOO_LARGE'
      : status === 415 ? 'UNSUPPORTED_MEDIA_TYPE'
        : status === 403 && err.code === 'CORS_ORIGIN_DENIED' ? 'CORS_ORIGIN_DENIED'
          : 'INTERNAL_SERVER_ERROR';
  const messages = {
    INVALID_JSON: 'Request body contains invalid JSON.',
    PAYLOAD_TOO_LARGE: 'Request body exceeds the 100kb limit.',
    UNSUPPORTED_MEDIA_TYPE: 'Content type must be application/json.',
    CORS_ORIGIN_DENIED: 'Origin is not allowed.'
  };
  res.status(status).json({
    success: false,
    error: {
      code: knownClientError ? code : 'INTERNAL_SERVER_ERROR',
      message: messages[code] || 'An unexpected server error occurred.'
    }
  });
});

// Start listening if run directly
if (require.main === module) {
  const PORT = config.port;
  connectDB().then(() => {
    app.listen(PORT, () => {
      console.log(`===========================================================`);
      console.log(`  AgriSense Backend Server running on http://localhost:${PORT}`);
      console.log(`  AI Health Check: http://localhost:${PORT}/api/ai/health`);
      console.log(`  Farm State API: http://localhost:${PORT}/api/farms`);
      console.log(`===========================================================`);
    });
  });
}

module.exports = app;
