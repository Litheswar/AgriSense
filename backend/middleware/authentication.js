const User = require('../db/models/User');
const farmService = require('../services/farmService');
const { verifyToken } = require('../services/authTokenService');

function unauthorized(res) {
  return res.status(401).json({ success: false, error: { code: 'UNAUTHENTICATED', message: 'Authentication is required.' } });
}

async function authenticate(req, res, next) {
  const header = req.get('authorization');
  const match = typeof header === 'string' && /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/.exec(header);
  if (!match) return unauthorized(res);
  try {
    const identity = verifyToken(match[1]);
    const user = await User.findById(identity.id).select('name email').lean();
    if (!user) return unauthorized(res);
    req.user = { id: user._id.toString(), name: user.name, email: user.email };
    return next();
  } catch (error) {
    if (error.code === 'AUTH_NOT_CONFIGURED') return res.status(503).json({ success: false, error: { code: 'AUTH_NOT_CONFIGURED', message: 'Authentication is temporarily unavailable.' } });
    return unauthorized(res);
  }
}

async function loadOwnedFarm(req, res, next) {
  try {
    req.farm = await farmService.getFarmById(req.params.farmId, req.user.id);
    return next();
  } catch (error) {
    const status = error.code === 'INVALID_FARM_ID' ? 400 : (error.code === 'FARM_NOT_FOUND' ? 404 : 500);
    return res.status(status).json({ success: false, error: { code: status === 404 ? 'FARM_NOT_FOUND' : (error.code || 'INTERNAL_SERVER_ERROR'), message: status === 404 ? 'Farm not found.' : (status === 400 ? 'Invalid farm ID.' : 'An unexpected error occurred.') } });
  }
}

async function authenticateOptionalFarm(req, res, next) {
  const farmId = req.body && (req.body.farmId || (req.body.input && req.body.input.farmId));
  if (!farmId) return next();
  return authenticate(req, res, () => {
    req.params.farmId = farmId;
    return loadOwnedFarm(req, res, next);
  });
}

function authenticatePredictDiseaseFarm(req, res, next) {
  if (String(req.body && req.body.task || '').trim().toLowerCase() !== 'disease_detection') return next();
  return authenticateOptionalFarm(req, res, next);
}

module.exports = { authenticate, loadOwnedFarm, authenticateOptionalFarm, authenticatePredictDiseaseFarm };
