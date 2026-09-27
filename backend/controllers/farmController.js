/**
 * AgriSense — Farm Controller Layer (Milestone 18).
 *
 * Maps Express HTTP requests to farmService and sends standardized JSON responses.
 */

const farmService = require('../services/farmService');
const sharedFarmStateService = require('../services/sharedFarmStateService');
const farmCropRecommendationService = require('../services/farmCropRecommendationService');
const farmIrrigationService = require('../services/farmIrrigationService');
const farmFertilizerService = require('../services/farmFertilizerService');
const farmDiseaseRiskService = require('../services/farmDiseaseRiskService');
const farmMarketService = require('../services/farmMarketService');
const farmCropRankingService = require('../services/farmCropRankingService');
const farmEvaluationService = require('../services/farmEvaluationService');
const farmWeatherService = require('../services/farmWeatherService');

function sendError(res, err) {
  const code = err.code || (err.error && err.error.code) || 'INTERNAL_SERVER_ERROR';
  let status = 500;

  if (code === 'FARM_NOT_FOUND') {
    status = 404;
  } else if (
    code === 'INVALID_FARM_ID' ||
    code === 'VALIDATION_ERROR' ||
    code === 'INVALID_INPUT' ||
    code === 'INSUFFICIENT_FARM_DATA' ||
    code === 'PROHIBITED_OPERATOR' ||
    code === 'CropInferenceError' ||
    code === 'IrrigationInputError' ||
    code === 'FertilizerInputError' ||
    code === 'DiseaseRiskInputError' ||
    code === 'MarketDataError' ||
    code === 'MISSING_CROP' ||
    code === 'CropRankingInputError' ||
    code === 'MISSING_CANDIDATES' ||
    code === 'INSUFFICIENT_LOCATION_DATA' ||
    code === 'INVALID_LATITUDE' ||
    code === 'INVALID_LONGITUDE'
  ) {
    status = 400;
  } else if (code.includes('PROVIDER_UNAVAILABLE') || code.includes('PROVIDER_TIMEOUT') || code === 'TIMEOUT') {
    status = 503;
  } else if (code === 'CONFLICT') {
    status = 409;
  }

  const safeMessages = {
    FARM_NOT_FOUND: 'Farm not found.',
    INVALID_FARM_ID: 'Invalid farm ID.',
    VALIDATION_ERROR: 'Request data is invalid.',
    INVALID_INPUT: 'Request data is invalid.',
    INSUFFICIENT_FARM_DATA: 'Farm data is insufficient for this recommendation.',
    WEATHER_PROVIDER_UNAVAILABLE: 'Weather provider is temporarily unavailable.',
    WEATHER_PROVIDER_TIMEOUT: 'Weather provider timed out.',
    CONFLICT: 'The request conflicts with the current resource state.'
  };

  return res.status(status).json({
    success: false,
    error: {
      code,
      message: safeMessages[code] || (status === 400 ? 'Request data is invalid.' : 'An unexpected error occurred.'),
      ...(code === 'INSUFFICIENT_FARM_DATA' && Array.isArray(err.missingFields) ? { missingFields: err.missingFields } : {})
    }
  });
}

/** GET /api/farms/:farmId/weather — read persisted weather only. */
exports.getFarmWeather = async (req, res) => {
  try { return res.status(200).json(await farmWeatherService.getWeather(req.params.farmId, req.farm)); }
  catch (err) { return sendError(res, err); }
};

/** POST /api/farms/:farmId/weather/refresh — retrieve and persist live weather. */
exports.refreshFarmWeather = async (req, res) => {
  try { return res.status(200).json(await farmWeatherService.refreshWeather(req.params.farmId, req.farm)); }
  catch (err) { return sendError(res, err); }
};

/**
 * POST /api/farms
 * Create a new farm.
 */
exports.createFarm = async (req, res) => {
  try {
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'ownerId')) {
      const err = new Error('ownerId is assigned from the authenticated user.');
      err.code = 'INVALID_INPUT';
      throw err;
    }
    const farm = await farmService.createFarm({ ...req.body, ownerId: req.user.id });
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
    const farm = req.farm;
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
    const sharedState = req.farm.toSharedFarmState();
    return res.status(200).json({
      success: true,
      sharedFarmState: sharedState
    });
  } catch (err) {
    return sendError(res, err);
  }
};

/**
 * GET /api/farms/:farmId/crop-recommendation
 * Retrieve AI Crop Recommendation for a Farm based on its Shared Farm State.
 */
exports.getCropRecommendation = async (req, res) => {
  try {
    const result = await farmCropRecommendationService.getCropRecommendation(req.params.farmId, req.farm.toSharedFarmState());
    return res.status(200).json(result);
  } catch (err) {
    return sendError(res, err);
  }
};

/**
 * GET /api/farms/:farmId/irrigation
 * Retrieve AI Irrigation Recommendation for a Farm based on its Shared Farm State.
 */
exports.getIrrigationRecommendation = async (req, res) => {
  try {
    const result = await farmIrrigationService.getIrrigationRecommendation(req.params.farmId, req.farm.toSharedFarmState());
    return res.status(200).json(result);
  } catch (err) {
    return sendError(res, err);
  }
};

/**
 * GET /api/farms/:farmId/fertilizer
 * Retrieve AI Fertilizer Recommendation for a Farm based on its Shared Farm State.
 */
exports.getFertilizerRecommendation = async (req, res) => {
  try {
    const result = await farmFertilizerService.getFertilizerRecommendation(req.params.farmId, req.farm.toSharedFarmState());
    return res.status(200).json(result);
  } catch (err) {
    return sendError(res, err);
  }
};

/**
 * GET /api/farms/:farmId/disease-risk
 * Retrieve AI Environmental Disease Risk Assessment for a Farm based on its Shared Farm State.
 */
exports.getDiseaseRiskAssessment = async (req, res) => {
  try {
    const result = await farmDiseaseRiskService.getDiseaseRiskAssessment(req.params.farmId, req.farm.toSharedFarmState());
    return res.status(200).json(result);
  } catch (err) {
    return sendError(res, err);
  }
};

/**
 * GET /api/farms/:farmId/market
 * Retrieve Market Intelligence analysis for a Farm based on its Shared Farm State.
 */
exports.getMarketIntelligence = async (req, res) => {
  try {
    const result = await farmMarketService.getMarketIntelligence(req.params.farmId, req.farm.toSharedFarmState());
    return res.status(200).json(result);
  } catch (err) {
    return sendError(res, err);
  }
};

/**
 * GET /api/farms/:farmId/crop-ranking
 * Retrieve multi-criteria Crop Ranking for a Farm based on its Shared Farm State.
 */
exports.getCropRanking = async (req, res) => {
  try {
    const options = {};
    options.sharedFarmState = req.farm.toSharedFarmState();
    if (req.query.agronomic_weight !== undefined || req.query.market_weight !== undefined) {
      const parseWeight = (key, fallback) => {
        const raw = req.query[key];
        if (raw === undefined) return fallback;
        if (typeof raw !== 'string' || raw.trim() === '') return NaN;
        return Number(raw);
      };
      const agronomic = parseWeight('agronomic_weight', 0.7);
      const market = parseWeight('market_weight', 0.3);
      if (!Number.isFinite(agronomic) || !Number.isFinite(market)
        || agronomic < 0 || market < 0 || agronomic > 1 || market > 1
        || Math.abs(agronomic + market - 1) > 1e-9) {
        const err = new Error('Crop ranking weights must be finite values between 0 and 1 and sum to 1.');
        err.code = 'INVALID_INPUT';
        throw err;
      }
      options.custom_weights = {
        agronomic,
        market
      };
    }
    for (const key of ['market', 'state', 'district']) {
      if (req.query[key] !== undefined && (typeof req.query[key] !== 'string' || req.query[key].length > 120)) {
        const err = new Error(`${key} must be a string of at most 120 characters.`);
        err.code = 'INVALID_INPUT';
        throw err;
      }
    }
    if (req.query.market || req.query.state || req.query.district) {
      options.market_context = {
        ...(req.query.market ? { market: req.query.market } : {}),
        ...(req.query.state ? { state: req.query.state } : {}),
        ...(req.query.district ? { district: req.query.district } : {})
      };
    }
    const result = await farmCropRankingService.getCropRanking(req.params.farmId, options);
    return res.status(200).json(result);
  } catch (err) {
    return sendError(res, err);
  }
};

/** GET /api/farms/:farmId/evaluation — read-only composite farm evaluation. */
exports.getFarmEvaluation = async (req, res) => {
  try {
    const result = await farmEvaluationService.evaluateFarm(req.params.farmId, req.farm.toSharedFarmState());
    return res.status(200).json(result);
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
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'ownerId')) {
      const err = new Error('ownerId cannot be changed.');
      err.code = 'INVALID_INPUT';
      throw err;
    }
    const farm = await farmService.updateFarm(req.params.farmId, req.body, req.farm);
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
    const result = await farmService.deleteFarm(req.params.farmId, req.farm);
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
    const farms = await farmService.listFarms({ ownerId: req.user.id });
    return res.status(200).json({
      success: true,
      count: farms.length,
      farms: farms.map(f => (f.toObject ? f.toObject() : f))
    });
  } catch (err) {
    return sendError(res, err);
  }
};
