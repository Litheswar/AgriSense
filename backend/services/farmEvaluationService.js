/** Composite, read-only orchestration over the existing farm decision services. */

const sharedFarmStateService = require('./sharedFarmStateService');
const cropService = require('./farmCropRecommendationService');
const irrigationService = require('./farmIrrigationService');
const fertilizerService = require('./farmFertilizerService');
const diseaseRiskService = require('./farmDiseaseRiskService');
const marketService = require('./farmMarketService');
const rankingService = require('./farmCropRankingService');

function errorCode(error) {
  return error && (error.code || (error.error && error.error.code)) || 'INTERNAL_ERROR';
}

function componentResult(value) {
  const data = value && value.recommendation;
  if (data && (data.status === 'UNAVAILABLE' || data.data_available === false)) {
    return { status: 'UNAVAILABLE', data: value };
  }
  return { status: 'SUCCESS', data: value };
}

function componentFailure(error) {
  const code = errorCode(error);
  const status = code === 'INSUFFICIENT_FARM_DATA'
    ? code
    : (code === 'PROVIDER_UNAVAILABLE' || code === 'MARKET_PROVIDER_UNAVAILABLE' ? 'PROVIDER_UNAVAILABLE' : 'INTERNAL_ERROR');
  return {
    status,
    error: {
      code,
      message: (error && error.message) || (error && error.error && error.error.message) || 'Component evaluation failed.',
      ...(error && error.missingFields ? { missingFields: error.missingFields } : {})
    }
  };
}

class FarmEvaluationService {
  async evaluateFarm(farmId) {
    // A failure to retrieve canonical context is fatal; module failures below are partial.
    const sharedFarmState = await sharedFarmStateService.getSharedFarmState(farmId);
    const results = {};
    const run = async (key, work) => {
      try {
        const value = await work();
        results[key] = componentResult(value);
      } catch (error) {
        results[key] = componentFailure(error);
      }
    };

    // Keep subprocess calls sequential to avoid contention. Pass the single canonical
    // state into each service so this request performs one Farm lookup.
    await run('cropRecommendation', () => cropService.getCropRecommendation(farmId, sharedFarmState));
    await run('irrigation', () => irrigationService.getIrrigationRecommendation(farmId, sharedFarmState));
    await run('fertilizer', () => fertilizerService.getFertilizerRecommendation(farmId, sharedFarmState));
    await run('diseaseRisk', () => diseaseRiskService.getDiseaseRiskAssessment(farmId, sharedFarmState));
    await run('market', () => marketService.getMarketIntelligence(farmId, sharedFarmState));

    const cropResult = results.cropRecommendation;
    const cropRecommendationOutput = cropResult && cropResult.status === 'SUCCESS'
      ? cropResult.data.recommendation
      : null;
    if (!cropRecommendationOutput) {
      results.cropRanking = {
        status: 'INSUFFICIENT_DEPENDENCY',
        error: {
          code: 'CROP_RECOMMENDATION_UNAVAILABLE',
          message: 'Crop Ranking requires a successful Crop Recommendation result.'
        }
      };
    } else {
      await run('cropRanking', () => rankingService.getCropRanking(farmId, {
        sharedFarmState,
        cropRecommendationOutput
      }));
    }

    const hasPartial = Object.values(results).some(result => result.status !== 'SUCCESS');
    return {
      success: true,
      status: hasPartial ? 'PARTIAL' : 'SUCCESS',
      farmId: sharedFarmState.farmId,
      farmName: sharedFarmState.name,
      farmContext: sharedFarmState,
      recommendations: results
    };
  }
}

module.exports = new FarmEvaluationService();
