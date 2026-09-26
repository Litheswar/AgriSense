/**
 * AgriSense — Farm Disease Risk Service (Milestone 18G).
 *
 * Location: backend/services/farmDiseaseRiskService.js
 *
 * Connects the persisted Farm (via SharedFarmStateService) to the existing
 * Disease Risk Decision Engine (via AIService).
 *
 * Dependency Flow:
 * Controller -> FarmDiseaseRiskService -> SharedFarmStateService -> FarmService -> MongoDB Atlas
 *                                      ↓
 *                             Extract & Validate Inputs
 *                                      ↓
 *                                  AIService
 *                                      ↓
 *                              Python Dispatcher
 *                                      ↓
 *                           Disease Risk Decision Engine
 */

const sharedFarmStateService = require('./sharedFarmStateService');
const aiService = require('./aiService');

class FarmDiseaseRiskService {
  /**
   * Extracts and validates canonical Disease Risk Engine features from Shared Farm State.
   * Required features: crop (name), growth_stage, temperature, humidity, rainfall, recent_rainfall.
   *
   * @param {object} sharedState - Canonical Shared Farm State object
   * @returns {object} Canonical feature map for Disease Risk Engine
   * @throws {Error} INSUFFICIENT_FARM_DATA if any required field is missing or null
   */
  extractDiseaseRiskInput(sharedState) {
    if (!sharedState) {
      const err = new Error('Disease Risk Assessment: Shared Farm State object is null or undefined.');
      err.code = 'INSUFFICIENT_FARM_DATA';
      throw err;
    }

    const crop = sharedState.crop || {};
    const weather = sharedState.weather || {};

    const requiredFields = [
      { key: 'crop', value: crop.name },
      { key: 'growth_stage', value: crop.growthStage },
      { key: 'temperature', value: weather.temperature },
      { key: 'humidity', value: weather.humidity },
      { key: 'rainfall', value: weather.rainfall },
      { key: 'recent_rainfall', value: weather.recentRainfall }
    ];

    const missingFields = requiredFields
      .filter(f => f.value === null || f.value === undefined || (typeof f.value === 'string' && !f.value.trim()) || (typeof f.value === 'number' && isNaN(f.value)))
      .map(f => f.key);

    if (missingFields.length > 0) {
      const err = new Error(`Disease Risk Assessment: UNAVAILABLE — insufficient farm data. Missing required feature(s): ${missingFields.join(', ')}.`);
      err.code = 'INSUFFICIENT_FARM_DATA';
      err.missingFields = missingFields;
      throw err;
    }

    return {
      crop: String(crop.name).trim(),
      growth_stage: String(crop.growthStage).trim(),
      temperature: Number(weather.temperature),
      humidity: Number(weather.humidity),
      rainfall: Number(weather.rainfall),
      recent_rainfall: Number(weather.recentRainfall)
    };
  }

  /**
   * Executes full pipeline: Farm ID -> Shared Farm State -> Input Validation -> Disease Risk Engine -> Assessment.
   *
   * @param {string} farmId - MongoDB ObjectId string
   * @returns {Promise<object>} Disease Risk Assessment result
   */
  async getDiseaseRiskAssessment(farmId, sharedState = null) {
    // 1. Retrieve Shared Farm State (handles farmId validation and FARM_NOT_FOUND error)
    sharedState = sharedState || await sharedFarmStateService.getSharedFarmState(farmId);

    // 2. Map and validate required features (throws INSUFFICIENT_FARM_DATA if missing)
    const engineInput = this.extractDiseaseRiskInput(sharedState);

    // 3. Delegate execution to existing AI service (reuses Python subprocess / Disease Risk engine)
    const aiResponse = await aiService.assessDiseaseRisk(engineInput);

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

module.exports = new FarmDiseaseRiskService();
