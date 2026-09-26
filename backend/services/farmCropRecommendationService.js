/**
 * AgriSense — Farm Crop Recommendation Service (Milestone 18D).
 *
 * Location: backend/services/farmCropRecommendationService.js
 *
 * Connects the persisted Farm (via SharedFarmStateService) to the existing
 * Crop Recommendation AI inference module (via AIService).
 *
 * Dependency Flow:
 * Controller -> FarmCropRecommendationService -> SharedFarmStateService -> FarmService -> MongoDB Atlas
 *                                              ↓
 *                                     Extract & Validate Model Inputs
 *                                              ↓
 *                                          AIService
 *                                              ↓
 *                                      Python Dispatcher
 *                                              ↓
 *                                     Random Forest Model
 */

const sharedFarmStateService = require('./sharedFarmStateService');
const aiService = require('./aiService');

class FarmCropRecommendationService {
  /**
   * Extracts and validates canonical Crop Recommendation model features from Shared Farm State.
   * Required features: N, P, K, temperature, humidity, ph, rainfall.
   *
   * @param {object} sharedState - Canonical Shared Farm State object
   * @returns {object} Canonical feature map for AI model
   * @throws {Error} INSUFFICIENT_FARM_DATA if any required field is missing or null
   */
  extractCropModelInput(sharedState) {
    if (!sharedState) {
      const err = new Error('Crop Recommendation: Shared Farm State object is null or undefined.');
      err.code = 'INSUFFICIENT_FARM_DATA';
      throw err;
    }

    const soil = sharedState.soil || {};
    const weather = sharedState.weather || {};

    const requiredFields = [
      { key: 'N', value: soil.N },
      { key: 'P', value: soil.P },
      { key: 'K', value: soil.K },
      { key: 'temperature', value: weather.temperature },
      { key: 'humidity', value: weather.humidity },
      { key: 'ph', value: soil.ph },
      { key: 'rainfall', value: weather.rainfall }
    ];

    const missingFields = requiredFields
      .filter(f => f.value === null || f.value === undefined || (typeof f.value === 'number' && isNaN(f.value)))
      .map(f => f.key);

    if (missingFields.length > 0) {
      const err = new Error(`Crop Recommendation: UNAVAILABLE — insufficient farm data. Missing required feature(s): ${missingFields.join(', ')}.`);
      err.code = 'INSUFFICIENT_FARM_DATA';
      err.missingFields = missingFields;
      throw err;
    }

    // Return strict canonical feature ordering map
    return {
      N: Number(soil.N),
      P: Number(soil.P),
      K: Number(soil.K),
      temperature: Number(weather.temperature),
      humidity: Number(weather.humidity),
      ph: Number(soil.ph),
      rainfall: Number(weather.rainfall)
    };
  }

  /**
   * Executes full pipeline: Farm ID -> Shared Farm State -> Input Validation -> AI Model -> Recommendation.
   *
   * @param {string} farmId - MongoDB ObjectId string
   * @returns {Promise<object>} Recommendation result
   */
  async getCropRecommendation(farmId, sharedState = null) {
    // 1. Retrieve Shared Farm State (handles farmId validation and FARM_NOT_FOUND error)
    sharedState = sharedState || await sharedFarmStateService.getSharedFarmState(farmId);

    // 2. Map and validate required features (throws INSUFFICIENT_FARM_DATA if missing)
    const modelInput = this.extractCropModelInput(sharedState);

    // 3. Delegate execution to existing AI service (reuses Python subprocess / RF model)
    const aiResponse = await aiService.predictCrop(modelInput);

    // 4. Return structured response preserving model output contract
    const recommendation = (aiResponse && aiResponse.result) ? aiResponse.result : aiResponse;

    return {
      success: true,
      farmId: sharedState.farmId,
      farmName: sharedState.name,
      sharedFarmState: sharedState,
      modelInput,
      recommendation
    };
  }
}

module.exports = new FarmCropRecommendationService();
