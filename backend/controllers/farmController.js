/**
 * AgriSense — Farm Controller Layer (Milestone 18).
 *
 * Maps Express HTTP requests to farmService and sends standardized JSON responses.
 */

const farmService = require('../services/farmService');
const sharedFarmStateService = require('../services/sharedFarmStateService');

function sendError(res, err) {
  const code = err.code || 'INTERNAL_SERVER_ERROR';
  let status = 500;

  if (code === 'FARM_NOT_FOUND') {
    status = 404;
  } else if (
    code === 'INVALID_FARM_ID' ||
    code === 'VALIDATION_ERROR' ||
    code === 'INVALID_INPUT' ||
    code === 'PROHIBITED_OPERATOR'
  ) {
    status = 400;
  }

  return res.status(status).json({
    success: false,
    error: {
      code,
      message: err.message,
      ...(err.details ? { details: err.details } : {})
    }
  });
}

/**
 * POST /api/farms
 * Create a new farm.
 */
exports.createFarm = async (req, res) => {
  try {
    const farm = await farmService.createFarm(req.body);
    return res.status(201).json({
      success: true,
      farm: farm.toObject ? farm.toObject() : farm,
      sharedFarmState: farm.toSharedFarmState ? farm.toSharedFarmState() : undefined
    });
  } catch (err) {
    return sendError(res, err);
  }
};

/**
 * GET /api/farms/:farmId
 * Retrieve farm by ID.
 */
exports.getFarm = async (req, res) => {
  try {
    const farm = await farmService.getFarmById(req.params.farmId);
    return res.status(200).json({
      success: true,
      farm: farm.toObject ? farm.toObject() : farm,
      sharedFarmState: farm.toSharedFarmState ? farm.toSharedFarmState() : undefined
    });
  } catch (err) {
    return sendError(res, err);
  }
};

/**
 * GET /api/farms/:farmId/shared-state
 * Retrieve normalized Shared Farm State by Farm ID.
 */
exports.getSharedFarmState = async (req, res) => {
  try {
    const sharedState = await sharedFarmStateService.getSharedFarmState(req.params.farmId);
    return res.status(200).json({
      success: true,
      sharedFarmState: sharedState
    });
  } catch (err) {
    return sendError(res, err);
  }
};

/**
 * PATCH /api/farms/:farmId & PUT /api/farms/:farmId
 * Update an existing farm.
 */
exports.updateFarm = async (req, res) => {
  try {
    const farm = await farmService.updateFarm(req.params.farmId, req.body);
    return res.status(200).json({
      success: true,
      farm: farm.toObject ? farm.toObject() : farm,
      sharedFarmState: farm.toSharedFarmState ? farm.toSharedFarmState() : undefined
    });
  } catch (err) {
    return sendError(res, err);
  }
};

/**
 * DELETE /api/farms/:farmId
 * Delete a farm.
 */
exports.deleteFarm = async (req, res) => {
  try {
    const result = await farmService.deleteFarm(req.params.farmId);
    return res.status(200).json({
      success: true,
      result
    });
  } catch (err) {
    return sendError(res, err);
  }
};

/**
 * GET /api/farms
 * List all farms.
 */
exports.listFarms = async (req, res) => {
  try {
    const farms = await farmService.listFarms();
    return res.status(200).json({
      success: true,
      count: farms.length,
      farms: farms.map(f => (f.toObject ? f.toObject() : f))
    });
  } catch (err) {
    return sendError(res, err);
  }
};
