/**
 * AgriSense — Farm Routes (Milestone 18).
 *
 * Defines REST endpoints for Shared Farm State CRUD operations.
 */

const express = require('express');
const router = express.Router();
const farmController = require('../controllers/farmController');
const { authenticate, loadOwnedFarm } = require('../middleware/authentication');

router.use(authenticate);
router.param('farmId', loadOwnedFarm);

// Farm CRUD
router.post('/', farmController.createFarm);
router.get('/', farmController.listFarms);
router.get('/:farmId/shared-state', farmController.getSharedFarmState);
router.get('/:farmId/crop-recommendation', farmController.getCropRecommendation);
router.get('/:farmId/irrigation', farmController.getIrrigationRecommendation);
router.get('/:farmId/fertilizer', farmController.getFertilizerRecommendation);
router.get('/:farmId/disease-risk', farmController.getDiseaseRiskAssessment);
router.get('/:farmId/market', farmController.getMarketIntelligence);
router.get('/:farmId/crop-ranking', farmController.getCropRanking);
router.get('/:farmId/weather', farmController.getFarmWeather);
router.post('/:farmId/weather/refresh', farmController.refreshFarmWeather);
router.get('/:farmId/evaluation', farmController.getFarmEvaluation);
router.get('/:farmId', farmController.getFarm);
router.patch('/:farmId', farmController.updateFarm);
router.put('/:farmId', farmController.updateFarm);
router.delete('/:farmId', farmController.deleteFarm);

module.exports = router;
