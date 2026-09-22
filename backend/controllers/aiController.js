/**
 * AgriSense — AI Controller Layer (Milestone 17).
 *
 * Dispatches Express API requests to aiService and formats standard HTTP responses.
 */

const aiService = require('../services/aiService');

/**
 * Standard error response formatter.
 */
function sendError(res, err, defaultStatus = 400) {
  if (err && err.error && err.error.code) {
    const status = err.error.code === 'INTERNAL_ERROR' || err.error.code === 'TIMEOUT' ? 500 : defaultStatus;
    return res.status(status).json(err);
  }

  const statusCode = err.status || defaultStatus;
  const message = err.message || (typeof err === 'string' ? err : 'An unexpected error occurred in AI service.');

  return res.status(statusCode).json({
    success: false,
    error: {
      code: err.code || 'AI_SERVICE_ERROR',
      message: message
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
 */
exports.handleDiseaseDetection = async (req, res) => {
  try {
    const imagePath = req.body.image_path || (req.body.input && req.body.input.image_path);
    if (!imagePath) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_IMAGE_PATH',
          message: "Request body must include 'image_path' string."
        }
      });
    }
    const result = await aiService.detectDisease(imagePath);
    return res.status(200).json(result);
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
