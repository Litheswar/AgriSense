/**
 * AgriSense — AI Routes (Milestone 17).
 *
 * Defines REST endpoints for AI service capabilities.
 */

const express = require('express');
const router = express.Router();
const aiController = require('../controllers/aiController');

// Health Check
router.get('/health', aiController.getHealth);

// General Task Prediction
router.post('/predict', aiController.handlePredict);

// Specific Task Endpoints
router.post('/crop-recommendation', aiController.handleCropRecommendation);
router.post('/disease-detection', aiController.handleDiseaseDetection);
router.post('/irrigation', aiController.handleIrrigation);
router.post('/fertilizer', aiController.handleFertilizer);
router.post('/disease-risk', aiController.handleDiseaseRisk);
router.post('/market', aiController.handleMarket);
router.post('/crop-ranking', aiController.handleCropRanking);

module.exports = router;
