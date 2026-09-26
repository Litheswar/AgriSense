/**
 * AgriSense — Farm Market Service (Milestone 18H).
 *
 * Location: backend/services/farmMarketService.js
 *
 * Connects the persisted Farm (via SharedFarmStateService) to the existing
 * Market Intelligence Engine (via AIService).
 *
 * Dependency Flow:
 * Controller -> FarmMarketService -> SharedFarmStateService -> FarmService -> MongoDB Atlas
 *                                  ↓
 *                         Extract & Validate Inputs
 *                                  ↓
 *                              AIService
 *                                  ↓
 *                          Python Dispatcher
 *                                  ↓
 *                      Market Intelligence Engine
 */

const sharedFarmStateService = require('./sharedFarmStateService');
const aiService = require('./aiService');

class FarmMarketService {
  /**
   * Extracts and validates canonical Market Intelligence Engine inputs from Shared Farm State.
   * Required feature: crop (name).
   * Optional features: market (mandi name), state (state name).
   *
   * @param {object} sharedState - Canonical Shared Farm State object
   * @returns {object} Canonical feature map for Market Intelligence Engine
   * @throws {Error} INSUFFICIENT_FARM_DATA if crop name is missing or empty
   */
  extractMarketInput(sharedState) {
    if (!sharedState) {
      const err = new Error('Market Intelligence: Shared Farm State object is null or undefined.');
      err.code = 'INSUFFICIENT_FARM_DATA';
      throw err;
    }

    const crop = sharedState.crop || {};
    const location = sharedState.location || {};
    const marketContext = sharedState.marketContext || {};

    const cropName = crop.name;

    if (!cropName || typeof cropName !== 'string' || !cropName.trim()) {
      const err = new Error('Market Intelligence: UNAVAILABLE — insufficient farm data. Missing required feature: crop.name.');
      err.code = 'INSUFFICIENT_FARM_DATA';
      err.missingFields = ['crop.name'];
      throw err;
    }

    const marketName = marketContext.market && typeof marketContext.market === 'string' && marketContext.market.trim()
      ? marketContext.market.trim()
      : null;

    const stateName = marketContext.state && typeof marketContext.state === 'string' && marketContext.state.trim()
      ? marketContext.state.trim()
      : (location.state && typeof location.state === 'string' && location.state.trim() ? location.state.trim() : null);

    return {
      crop: String(cropName).trim(),
      ...(marketName ? { market: marketName } : {}),
      ...(stateName ? { state: stateName } : {})
    };
  }

  /**
   * Executes full pipeline: Farm ID -> Shared Farm State -> Input Validation -> Market Engine -> Market Analysis.
   *
   * @param {string} farmId - MongoDB ObjectId string
   * @returns {Promise<object>} Market Intelligence result
   */
  async getMarketIntelligence(farmId, sharedState = null) {
    // 1. Retrieve Shared Farm State (handles farmId validation and FARM_NOT_FOUND error)
    sharedState = sharedState || await sharedFarmStateService.getSharedFarmState(farmId);

    // 2. Map and validate required features (throws INSUFFICIENT_FARM_DATA if missing)
    const engineInput = this.extractMarketInput(sharedState);

    // 3. Delegate execution to existing AI service (reuses Python subprocess / Market Engine)
    const aiResponse = await aiService.getMarketIntelligence(engineInput);

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

module.exports = new FarmMarketService();
