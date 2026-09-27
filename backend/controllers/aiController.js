/**
 * AgriSense — AI Controller Layer (Milestone 17).
 *
 * Dispatches Express API requests to aiService and formats standard HTTP responses.
 */

const aiService = require('../services/aiService');
const farmService = require('../services/farmService');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const diseaseTempDirectory = path.resolve(__dirname, '..', 'tmp', 'disease');
const legacyImageRoot = path.resolve(process.env.DISEASE_IMAGE_ROOT || path.resolve(__dirname, '..', 'models', 'disease_detection', 'dataset', 'raw'));
const loadFileTypeDetector = import('file-type').then(module => module.fileTypeFromBuffer);

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
    const requestedImagePath = req.body.image_path || (req.body.input && req.body.input.image_path);
    const imagePath = await resolveLegacyImagePath(requestedImagePath);
    const farmId = req.body.farmId || (req.body.input && req.body.input.farmId);
    return res.status(200).json(await runDiseaseDetection(imagePath, farmId, req.farm));
  } catch (err) {
    return sendError(res, err, 400);
  }
};

async function resolveLegacyImagePath(imagePath) {
  if (typeof imagePath !== 'string' || imagePath.trim().length === 0) {
    const err = new Error("Request body must include 'image_path' string.");
    err.code = 'MISSING_IMAGE_PATH';
    throw err;
  }
  if (imagePath.length > 1024) {
    const err = new Error('Image path is too long.');
    err.code = 'INVALID_INPUT';
    throw err;
  }
  try {
    const root = await fs.promises.realpath(legacyImageRoot);
    const resolved = await fs.promises.realpath(path.resolve(imagePath));
    const relative = path.relative(root, resolved);
    if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error('outside image root');
    const stat = await fs.promises.stat(resolved);
    if (!stat.isFile()) throw new Error('not a regular image file');
    return resolved;
  } catch (_error) {
    const err = new Error('Image path must reference a file inside the configured disease image root.');
    err.code = 'INVALID_IMAGE_PATH';
    throw err;
  }
}

async function runDiseaseDetection(imagePath, farmId, authorizedFarm) {
  if (farmId) {
    if (!farmService.isValidId(farmId)) {
      const err = new Error('Invalid farm ID.');
      err.code = 'INVALID_FARM_ID';
      throw err;
    }
    if (!authorizedFarm || authorizedFarm._id.toString() !== farmId.toString()) {
      const err = new Error('Farm not found.');
      err.code = 'FARM_NOT_FOUND';
      throw err;
    }
  }

  const aiResult = await aiService.detectDisease(imagePath);
  if (!farmId) return aiResult;

  const detectionData = aiResult && aiResult.result ? aiResult.result : aiResult;
  const isHealthy = !detectionData.predicted_disease || String(detectionData.predicted_disease).trim().toLowerCase() === 'healthy';
  const diseaseContext = {
    detected: !isHealthy,
    disease: isHealthy ? 'Healthy' : String(detectionData.predicted_disease).trim(),
    confidence: typeof detectionData.confidence === 'number'
      ? detectionData.confidence
      : (detectionData.confidence ? parseFloat(detectionData.confidence) : null)
  };
  const updatedFarm = await farmService.updateFarm(farmId, { diseaseContext }, authorizedFarm);
  return {
    success: true,
    task: 'disease_detection',
    result: detectionData,
    farmId: farmId.toString(),
    diseaseContext,
    farm: updatedFarm.toObject ? updatedFarm.toObject() : updatedFarm
  };
}

/** Browser upload route; file bytes stay in bounded memory until authorization and signature checks pass. */
exports.handleDiseaseDetectionUpload = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, error: { code: 'MISSING_IMAGE', message: "Provide one image in the 'image' field." } });
  }

  const file = req.file;
  if (!file.buffer || file.size === 0) {
    return res.status(400).json({ success: false, error: { code: 'EMPTY_FILE', message: 'Uploaded image is empty.' } });
  }
  if (typeof file.originalname !== 'string' || file.originalname.length > 255
    || /[\\/\u0000-\u001f]/.test(file.originalname) || file.originalname.includes('..')) {
    return res.status(400).json({ success: false, error: { code: 'INVALID_FILENAME', message: 'Image filename is invalid.' } });
  }

  const extension = path.extname(file.originalname).toLowerCase();
  const allowed = {
    '.jpg': { mime: 'image/jpeg', ext: 'jpg' },
    '.jpeg': { mime: 'image/jpeg', ext: 'jpg' },
    '.png': { mime: 'image/png', ext: 'png' }
  };
  const expected = allowed[extension];
  if (!expected || file.mimetype !== expected.mime) {
    return res.status(415).json({ success: false, error: { code: 'UNSUPPORTED_MEDIA_TYPE', message: 'Upload a JPEG or PNG image with a matching filename extension and MIME type.' } });
  }

  let detectedType;
  try {
    const fileTypeFromBuffer = await loadFileTypeDetector;
    detectedType = await fileTypeFromBuffer(file.buffer);
  } catch (_error) {
    return res.status(500).json({ success: false, error: { code: 'INTERNAL_SERVER_ERROR', message: 'Image validation is unavailable.' } });
  }
  if (!detectedType || detectedType.mime !== expected.mime) {
    return res.status(415).json({ success: false, error: { code: 'UNSUPPORTED_FILE_CONTENT', message: 'File contents are not a supported JPEG or PNG image.' } });
  }

  let tempPath;
  try {
    await fs.promises.mkdir(diseaseTempDirectory, { recursive: true, mode: 0o700 });
    tempPath = path.join(diseaseTempDirectory, `${crypto.randomUUID()}.${expected.ext}`);
    await fs.promises.writeFile(tempPath, file.buffer, { flag: 'wx', mode: 0o600 });

    const farmId = req.body && req.body.farmId;
    const result = await runDiseaseDetection(tempPath, farmId, req.farm);
    await fs.promises.unlink(tempPath);
    tempPath = null;
    return res.status(200).json(result);
  } catch (error) {
    return sendError(res, error, 500);
  } finally {
    if (tempPath) {
      try { await fs.promises.unlink(tempPath); }
      catch (error) {
        if (error.code !== 'ENOENT') console.error('[Disease Upload Cleanup Error]', error.code || 'unknown error');
      }
    }
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
