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

// Middleware
app.use(cors());
app.use(express.json());

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
      message: `Resource not found: ${req.method} ${req.url}`
    }
  });
});

// Global error handler
app.use((err, req, res, next) => {
  // Error objects from JSON parsers can retain the raw request body (including passwords).
  console.error('[AgriSense Server Error]', err && (err.code || err.name) || 'unknown error');
  const status = Number.isInteger(err.status) && err.status >= 400 && err.status < 500 ? err.status : 500;
  res.status(status).json({
    success: false,
    error: {
      code: status === 400 ? 'INVALID_JSON' : 'INTERNAL_SERVER_ERROR',
      message: status === 400 ? 'Request body contains invalid JSON.' : 'An unexpected server error occurred.'
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
