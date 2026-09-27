/**
 * AgriSense — AI Controller Layer (Milestone 17).
 *
 * Dispatches Express API requests to aiService and formats standard HTTP responses.
 */

const aiService = require('../services/aiService');
const farmService = require('../services/farmService');

/**
 * Standard error response formatter.
 */
function sendError(res, err, defaultStatus = 400) {
  const code = err.code || (err.error && err.error.code) || 'AI_SERVICE_ERROR';
  let status = defaultStatus;

  if (code === 'FARM_NOT_FOUND') {
    status = 404;
  } else if (
    code === 'INVALID_FARM_ID' ||
    code === 'VALIDATION_ERROR' ||
    code === 'INVALID_INPUT' ||
    code === 'MISSING_IMAGE_PATH' ||
    code === 'MISSING_TASK' ||
    code === 'PROHIBITED_OPERATOR' ||
    code === 'DiseaseInferenceError'
  ) {
    status = 400;
  } else if (
    code === 'TIMEOUT' || code === 'PROVIDER_UNAVAILABLE' || code === 'AI_SERVER_UNAVAILABLE'
    || code === 'PYTHON_SPAWN_ERROR' || code === 'EMPTY_RESPONSE'
  ) {
    status = 503;
  } else if (code === 'INTERNAL_ERROR' || code === 'AI_SERVICE_ERROR') {
    status = 500;
  }

  const safeMessages = {
    FARM_NOT_FOUND: 'Farm not found.',
    INVALID_FARM_ID: 'Invalid farm ID.',
    VALIDATION_ERROR: 'Request data is invalid.',
    INVALID_INPUT: 'Request data is invalid.',
    MISSING_IMAGE_PATH: "Request body must include 'image_path' string.",
    MISSING_TASK: "Request body must include 'task' field.",
    PROHIBITED_OPERATOR: 'Request data contains an unsupported operator.',
    TIMEOUT: 'The AI service timed out.',
    PROVIDER_UNAVAILABLE: 'The AI provider is temporarily unavailable.',
    AI_SERVER_UNAVAILABLE: 'The AI service is temporarily unavailable.'
  };

  return res.status(status).json({
    success: false,
    error: {
      code,
      message: safeMessages[code] || 'An unexpected error occurred in AI service.'
    }
  });
}

/**
 * GET /api/ai/health
 */
exports.getHealth = async (req, res) => {
  try {
    const result = await aiService.checkHealth();
    return res.status(200).json(result);
  } catch (err) {
    return sendError(res, err, 503);
  }
};

/**
 * POST /api/ai/predict
 * General task execution endpoint.
 */
exports.handlePredict = async (req, res) => {
  try {
    const { task, input, payload } = req.body;
    if (!task) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_TASK',
          message: "Request body must include 'task' field."
        }
      });
    }

    const taskPayload = input || payload || {};
    if (task.trim().toLowerCase() === 'disease_detection' && (taskPayload.farmId || req.body.farmId)) {
      req.body.image_path = taskPayload.image_path || req.body.image_path;
      req.body.farmId = taskPayload.farmId || req.body.farmId;
      return exports.handleDiseaseDetection(req, res);
    }

    const result = await aiService.executeTask(task, taskPayload);
    return res.status(200).json(result);
  } catch (err) {
    return sendError(res, err, 400);
  }
};

/**
 * POST /api/ai/crop-recommendation
 */
exports.handleCropRecommendation = async (req, res) => {
  try {
    const soilData = req.body.input || req.body;
    const result = await aiService.predictCrop(soilData);
    return res.status(200).json(result);
  } catch (err) {
    return sendError(res, err, 400);
  }
};

/**
 * POST /api/ai/disease-detection
 * Supports optional farmId to update Farm.diseaseContext with prediction results (Milestone 18J).
 */
exports.handleDiseaseDetection = async (req, res) => {
  try {
    const imagePath = req.body.image_path || (req.body.input && req.body.input.image_path);
    if (typeof imagePath !== 'string' || imagePath.trim().length === 0 || imagePath.length > 1024) {
      const missing = typeof imagePath !== 'string' || imagePath.trim().length === 0;
      return res.status(400).json({
        success: false,
        error: {
          code: missing ? 'MISSING_IMAGE_PATH' : 'INVALID_INPUT',
          message: missing
            ? "Request body must include 'image_path' string."
            : "'image_path' must be at most 1024 characters."
        }
      });
    }

    const farmId = req.body.farmId || (req.body.input && req.body.input.farmId);

    // If farmId is provided, validate ID format and ensure Farm exists before proceeding
    if (farmId) {
      if (!farmService.isValidId(farmId)) {
        const err = new Error(`Invalid farm ID format: '${farmId}'`);
        err.code = 'INVALID_FARM_ID';
        throw err;
      }
      // The route middleware has already authenticated the caller and loaded this owned Farm.
      if (!req.farm || req.farm._id.toString() !== farmId.toString()) {
        const err = new Error('Farm not found.');
        err.code = 'FARM_NOT_FOUND';
        throw err;
      }
    }

    // 1. Execute Disease Detection inference
    const aiResult = await aiService.detectDisease(imagePath);
    const detectionData = (aiResult && aiResult.result) ? aiResult.result : aiResult;

    // 2. If no farmId provided, return standard detection result directly (backward-compatible mode)
    if (!farmId) {
      return res.status(200).json(aiResult);
    }

    // 3. Map detection result to canonical diseaseContext
    const isHealthy = !detectionData.predicted_disease || String(detectionData.predicted_disease).trim().toLowerCase() === 'healthy';
    const detected = !isHealthy;
    const disease = detected ? String(detectionData.predicted_disease).trim() : 'Healthy';
    const confidence = typeof detectionData.confidence === 'number' ? detectionData.confidence : (detectionData.confidence ? parseFloat(detectionData.confidence) : null);

    // 4. Update Farm.diseaseContext via farmService (preserves all other fields, including crop.name)
    const updatedFarm = await farmService.updateFarm(farmId, {
      diseaseContext: {
        detected,
        disease,
        confidence
      }
    }, req.farm);

    // 5. Return disease detection result with updated farm metadata
    return res.status(200).json({
      success: true,
      task: 'disease_detection',
      result: detectionData,
      farmId: farmId.toString(),
      diseaseContext: {
        detected,
        disease,
        confidence
      },
      farm: updatedFarm.toObject ? updatedFarm.toObject() : updatedFarm
    });
  } catch (err) {
    return sendError(res, err, 400);
  }
};

/**
 * POST /api/ai/irrigation
 */
exports.handleIrrigation = async (req, res) => {
  try {
    const farmState = req.body.input || req.body;
    const result = await aiService.recommendIrrigation(farmState);
    return res.status(200).json(result);
  } catch (err) {
    return sendError(res, err, 400);
  }
};

/**
 * POST /api/ai/fertilizer
 */
exports.handleFertilizer = async (req, res) => {
  try {
    const farmState = req.body.input || req.body;
    const result = await aiService.recommendFertilizer(farmState);
    return res.status(200).json(result);
  } catch (err) {
    return sendError(res, err, 400);
  }
};

/**
 * POST /api/ai/disease-risk
 */
exports.handleDiseaseRisk = async (req, res) => {
  try {
    const farmState = req.body.input || req.body;
    const result = await aiService.assessDiseaseRisk(farmState);
    return res.status(200).json(result);
  } catch (err) {
    return sendError(res, err, 400);
  }
};

/**
 * POST /api/ai/market
 */
exports.handleMarket = async (req, res) => {
  try {
    const marketData = req.body.input || req.body;
    const result = await aiService.getMarketIntelligence(marketData);
    return res.status(200).json(result);
  } catch (err) {
    return sendError(res, err, 400);
  }
};

/**
 * POST /api/ai/crop-ranking
 */
exports.handleCropRanking = async (req, res) => {
  try {
    const rankingData = req.body.input || req.body;
    const result = await aiService.rankCrops(rankingData);
    return res.status(200).json(result);
  } catch (err) {
    return sendError(res, err, 400);
  }
};
