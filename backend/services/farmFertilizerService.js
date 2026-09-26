/**
 * AgriSense — Farm Fertilizer Service (Milestone 18F).
 *
 * Location: backend/services/farmFertilizerService.js
 *
 * Connects the persisted Farm (via SharedFarmStateService) to the existing
 * Fertilizer Decision Engine (via AIService).
 *
 * Dependency Flow:
 * Controller -> FarmFertilizerService -> SharedFarmStateService -> FarmService -> MongoDB Atlas
 *                                      ↓
 *                             Extract & Validate Inputs
 *                                      ↓
 *                                  AIService
 *                                      ↓
 *                              Python Dispatcher
 *                                      ↓
 *                           Fertilizer Decision Engine
 */

const sharedFarmStateService = require('./sharedFarmStateService');
const aiService = require('./aiService');

class FarmFertilizerService {
  /**
   * Extracts and validates canonical Fertilizer Decision Engine features from Shared Farm State.
   * Required features: N, P, K, ph, crop (name), growth_stage, disease_status.
   *
   * @param {object} sharedState - Canonical Shared Farm State object
   * @returns {object} Canonical feature map for Fertilizer Decision Engine
   * @throws {Error} INSUFFICIENT_FARM_DATA if any required field is missing or null
   */
  extractFertilizerInput(sharedState) {
    if (!sharedState) {
      const err = new Error('Fertilizer Recommendation: Shared Farm State object is null or undefined.');
      err.code = 'INSUFFICIENT_FARM_DATA';
      throw err;
    }

    const soil = sharedState.soil || {};
    const crop = sharedState.crop || {};
    const diseaseContext = sharedState.diseaseContext;

    const requiredFields = [
      { key: 'N', value: soil.N },
      { key: 'P', value: soil.P },
      { key: 'K', value: soil.K },
      { key: 'ph', value: soil.ph },
      { key: 'crop', value: crop.name },
      { key: 'growth_stage', value: crop.growthStage },
      { key: 'disease_status', value: diseaseContext ? diseaseContext.detected : undefined }
    ];

    const missingFields = requiredFields
      .filter(f => f.value === null || f.value === undefined || (typeof f.value === 'string' && !f.value.trim()) || (typeof f.value === 'number' && isNaN(f.value)))
      .map(f => f.key);

    if (missingFields.length > 0) {
      const err = new Error(`Fertilizer Recommendation: UNAVAILABLE — insufficient farm data. Missing required feature(s): ${missingFields.join(', ')}.`);
      err.code = 'INSUFFICIENT_FARM_DATA';
      err.missingFields = missingFields;
      throw err;
    }

    return {
      N: Number(soil.N),
      P: Number(soil.P),
      K: Number(soil.K),
      ph: Number(soil.ph),
      crop: String(crop.name).trim(),
      growth_stage: String(crop.growthStage).trim(),
      disease_status: {
        detected: Boolean(diseaseContext.detected),
        disease: diseaseContext.disease || null,
        confidence: diseaseContext.confidence !== undefined ? diseaseContext.confidence : null
      }
    };
  }

  /**
   * Executes full pipeline: Farm ID -> Shared Farm State -> Input Validation -> Fertilizer Engine -> Advisory.
   *
   * @param {string} farmId - MongoDB ObjectId string
   * @returns {Promise<object>} Recommendation result
   */
  async getFertilizerRecommendation(farmId, sharedState = null) {
    // 1. Retrieve Shared Farm State (handles farmId validation and FARM_NOT_FOUND error)
    sharedState = sharedState || await sharedFarmStateService.getSharedFarmState(farmId);

    // 2. Map and validate required features (throws INSUFFICIENT_FARM_DATA if missing)
    const engineInput = this.extractFertilizerInput(sharedState);

    // 3. Delegate execution to existing AI service (reuses Python subprocess / Fertilizer engine)
    const aiResponse = await aiService.recommendFertilizer(engineInput);

    // 4. Return structured response preserving model output contract
    const recommendation = (aiResponse && aiResponse.result) ? aiResponse.result : aiResponse;

    return {
      success: true,
      farmId: sharedState.farmId,
      farmName: sharedState.name,
      sharedFarmState: sharedState,
      engineInput,
      recommendation
    };
  }
}

module.exports = new FarmFertilizerService();
