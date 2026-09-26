/**
 * AgriSense — Farm Crop Ranking Service (Milestone 18I).
 *
 * Location: backend/services/farmCropRankingService.js
 *
 * Connects the persisted Farm (via SharedFarmStateService) to the existing
 * Crop Ranking Decision Engine (via AIService), which synthesizes
 * agronomic signals (from the trained Crop Recommendation model) and
 * market signals (from the Market Intelligence engine).
 *
 * Dependency Flow:
 * Controller -> FarmCropRankingService -> SharedFarmStateService -> FarmService -> MongoDB Atlas
 *                                      ↓
 *                             Extract & Validate Inputs
 *                                      ↓
 *                       ┌──────────────┴──────────────┐
 *                       ↓                             ↓
 *               Crop Recommendation           Market Context
 *               (Agronomic Signal)           (Location / Mandi)
 *                       └──────────────┬──────────────┘
 *                                      ↓
 *                                  AIService
 *                                      ↓
 *                              Python Dispatcher
 *                                      ↓
 *                          Crop Ranking Decision Engine
 *                                      ↓
 *                                 Ranked Crops
 */

const sharedFarmStateService = require('./sharedFarmStateService');
const aiService = require('./aiService');

class FarmCropRankingService {
  /**
   * Extracts and validates canonical Crop Ranking input features from Shared Farm State.
   * Required features for agronomic inference: N, P, K, temperature, humidity, ph, rainfall.
   * Optional features for market context: market, state, district.
   *
   * @param {object} sharedState - Canonical Shared Farm State object
   * @returns {{ modelInput: object, marketContext: object }} Canonical feature maps
   * @throws {Error} INSUFFICIENT_FARM_DATA if any required agronomic feature is missing or null
   */
  extractCropRankingInput(sharedState) {
    if (!sharedState) {
      const err = new Error('Crop Ranking: Shared Farm State object is null or undefined.');
      err.code = 'INSUFFICIENT_FARM_DATA';
      throw err;
    }

    const soil = sharedState.soil || {};
    const weather = sharedState.weather || {};
    const location = sharedState.location || {};
    const marketCtx = sharedState.marketContext || {};

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
      const err = new Error(`Crop Ranking: UNAVAILABLE — insufficient farm data. Missing required agronomic feature(s): ${missingFields.join(', ')}.`);
      err.code = 'INSUFFICIENT_FARM_DATA';
      err.missingFields = missingFields;
      throw err;
    }

    const modelInput = {
      N: Number(soil.N),
      P: Number(soil.P),
      K: Number(soil.K),
      temperature: Number(weather.temperature),
      humidity: Number(weather.humidity),
      ph: Number(soil.ph),
      rainfall: Number(weather.rainfall)
    };

    const marketName = marketCtx.market && typeof marketCtx.market === 'string' && marketCtx.market.trim()
      ? marketCtx.market.trim()
      : null;

    const stateName = marketCtx.state && typeof marketCtx.state === 'string' && marketCtx.state.trim()
      ? marketCtx.state.trim()
      : (location.state && typeof location.state === 'string' && location.state.trim() ? location.state.trim() : null);

    const districtName = marketCtx.district && typeof marketCtx.district === 'string' && marketCtx.district.trim()
      ? marketCtx.district.trim()
      : (location.district && typeof location.district === 'string' && location.district.trim() ? location.district.trim() : null);

    const marketContext = {
      ...(marketName ? { market: marketName } : {}),
      ...(stateName ? { state: stateName } : {}),
      ...(districtName ? { district: districtName } : {})
    };

    return {
      modelInput,
      marketContext
    };
  }

  /**
   * Executes full pipeline:
   * Farm ID -> Shared Farm State -> Input Validation -> Crop Recommendation (RF) -> Market Context -> Crop Ranking Engine -> Ranked Result.
   *
   * @param {string} farmId - MongoDB ObjectId string
   * @param {object} [options] - Optional overrides (e.g. custom_weights, explicit market_context)
   * @returns {Promise<object>} Ranked crops result
   */
  async getCropRanking(farmId, options = {}) {
    // 1. Retrieve Shared Farm State (handles farmId validation and FARM_NOT_FOUND error)
    const sharedState = options.sharedFarmState || await sharedFarmStateService.getSharedFarmState(farmId);

    // 2. Map and validate required features (throws INSUFFICIENT_FARM_DATA if missing)
    const { modelInput, marketContext } = this.extractCropRankingInput(sharedState);

    // 3. Obtain Agronomic Signals via existing Crop Recommendation ML inference
    let cropRecommendationOutput = options.cropRecommendationOutput;
    if (!cropRecommendationOutput) {
      const cropRecResponse = await aiService.predictCrop(modelInput);
      cropRecommendationOutput = (cropRecResponse && cropRecResponse.result)
        ? cropRecResponse.result
        : cropRecResponse;
    }

    // 4. Merge market context with any options overrides
    const effectiveMarketContext = {
      ...marketContext,
      ...(options.market_context || {})
    };

    // 5. Delegate ranking execution to existing Crop Ranking Engine via AIService
    const rankingPayload = {
      crop_recommendation_output: cropRecommendationOutput,
      market_context: effectiveMarketContext,
      ...(options.custom_weights ? { custom_weights: options.custom_weights } : {})
    };

    const aiRankingResponse = await aiService.rankCrops(rankingPayload);
    const recommendation = (aiRankingResponse && aiRankingResponse.result)
      ? aiRankingResponse.result
      : aiRankingResponse;

    // 6. Return structured response preserving engine contracts and input provenance
    return {
      success: true,
      farmId: sharedState.farmId,
      farmName: sharedState.name,
      sharedFarmState: sharedState,
      modelInput,
      marketContext: effectiveMarketContext,
      agronomicPrediction: cropRecommendationOutput,
      recommendation
    };
  }
}

module.exports = new FarmCropRankingService();
