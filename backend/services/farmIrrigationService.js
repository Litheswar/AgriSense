/**
 * AgriSense — Farm Irrigation Service (Milestone 18E).
 *
 * Location: backend/services/farmIrrigationService.js
 *
 * Connects the persisted Farm (via SharedFarmStateService) to the existing
 * Irrigation Decision Engine (via AIService).
 *
 * Dependency Flow:
 * Controller -> FarmIrrigationService -> SharedFarmStateService -> FarmService -> MongoDB Atlas
 *                                      ↓
 *                             Extract & Validate Inputs
 *                                      ↓
 *                                  AIService
 *                                      ↓
 *                              Python Dispatcher
 *                                      ↓
 *                           Irrigation Decision Engine
 */

const sharedFarmStateService = require('./sharedFarmStateService');
const aiService = require('./aiService');

class FarmIrrigationService {
  /**
   * Extracts and validates canonical Irrigation Decision Engine features from Shared Farm State.
   * Required features: crop (name), growth_stage, soil_moisture, temperature, humidity, rain_probability, expected_rainfall.
   *
   * @param {object} sharedState - Canonical Shared Farm State object
   * @returns {object} Canonical feature map for Irrigation Decision Engine
   * @throws {Error} INSUFFICIENT_FARM_DATA if any required field is missing or null
   */
  extractIrrigationInput(sharedState) {
    if (!sharedState) {
      const err = new Error('Irrigation Recommendation: Shared Farm State object is null or undefined.');
      err.code = 'INSUFFICIENT_FARM_DATA';
      throw err;
    }

    const crop = sharedState.crop || {};
    const fieldConditions = sharedState.fieldConditions || {};
    const weather = sharedState.weather || {};

    const requiredFields = [
      { key: 'crop', value: crop.name },
      { key: 'growth_stage', value: crop.growthStage },
      { key: 'soil_moisture', value: fieldConditions.soilMoisture },
      { key: 'temperature', value: weather.temperature },
      { key: 'humidity', value: weather.humidity },
      { key: 'rain_probability', value: weather.rainProbability },
      { key: 'expected_rainfall', value: weather.expectedRainfall }
    ];

    const missingFields = requiredFields
      .filter(f => f.value === null || f.value === undefined || (typeof f.value === 'string' && !f.value.trim()) || (typeof f.value === 'number' && isNaN(f.value)))
      .map(f => f.key);

    if (missingFields.length > 0) {
      const err = new Error(`Irrigation Recommendation: UNAVAILABLE — insufficient farm data. Missing required feature(s): ${missingFields.join(', ')}.`);
      err.code = 'INSUFFICIENT_FARM_DATA';
      err.missingFields = missingFields;
      throw err;
    }

    return {
      crop: String(crop.name).trim(),
      growth_stage: String(crop.growthStage).trim(),
      soil_moisture: Number(fieldConditions.soilMoisture),
      temperature: Number(weather.temperature),
      humidity: Number(weather.humidity),
      rain_probability: Number(weather.rainProbability),
      expected_rainfall: Number(weather.expectedRainfall)
    };
  }

  /**
   * Executes full pipeline: Farm ID -> Shared Farm State -> Input Validation -> Irrigation Engine -> Advisory.
   *
   * @param {string} farmId - MongoDB ObjectId string
   * @returns {Promise<object>} Recommendation result
   */
  async getIrrigationRecommendation(farmId, sharedState = null) {
    // 1. Retrieve Shared Farm State (handles farmId validation and FARM_NOT_FOUND error)
    sharedState = sharedState || await sharedFarmStateService.getSharedFarmState(farmId);

    // 2. Map and validate required features (throws INSUFFICIENT_FARM_DATA if missing)
    const engineInput = this.extractIrrigationInput(sharedState);

    // 3. Delegate execution to existing AI service (reuses Python subprocess / Irrigation engine)
    const aiResponse = await aiService.recommendIrrigation(engineInput);

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

module.exports = new FarmIrrigationService();
