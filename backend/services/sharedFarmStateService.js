/**
 * AgriSense — Shared Farm State Service (Milestone 18B).
 *
 * Location: backend/services/sharedFarmStateService.js
 *
 * Provides a unified, canonical service boundary that retrieves a persisted Farm
 * via FarmService and produces the normalized Shared Farm State consumed by AI engines.
 *
 * Dependency Flow:
 * Controller / AI Service -> SharedFarmStateService -> FarmService -> MongoDB / Memory Store
 */

const farmService = require('./farmService');

class SharedFarmStateService {
  /**
   * Retrieves a Farm by ID via FarmService and converts it into the canonical Shared Farm State.
   * @param {string} farmId - MongoDB ObjectId string
   * @returns {Promise<object>} Normalized Shared Farm State object
   */
  async getSharedFarmState(farmId) {
    // 1. Retrieve Farm document from FarmService (handles ID validation, live DB, or memory store)
    const farm = await farmService.getFarmById(farmId);

    // 2. Guard against missing farm (FarmService throws FARM_NOT_FOUND, but check defensively)
    if (!farm) {
      const err = new Error(`Farm with ID '${farmId}' not found.`);
      err.code = 'FARM_NOT_FOUND';
      throw err;
    }

    // 3. Transform to normalized Shared Farm State using Mongoose schema method if available
    if (typeof farm.toSharedFarmState === 'function') {
      return farm.toSharedFarmState();
    }

    // 4. Fallback formatting helper for plain objects
    return this._formatSharedFarmState(farm);
  }

  /**
   * Helper method to format a plain Farm object into canonical Shared Farm State shape.
   * @param {object} farm - Plain Farm object
   * @returns {object} Canonical Shared Farm State
   */
  _formatSharedFarmState(farm) {
    const raw = farm.toObject ? farm.toObject() : farm;
    return {
      farmId: raw._id ? raw._id.toString() : (raw.farmId || null),
      name: raw.name || null,
      location: raw.location || null,
      soil: {
        N: raw.soil ? (raw.soil.N !== undefined ? raw.soil.N : raw.soil.nitrogen) : null,
        P: raw.soil ? (raw.soil.P !== undefined ? raw.soil.P : raw.soil.phosphorus) : null,
        K: raw.soil ? (raw.soil.K !== undefined ? raw.soil.K : raw.soil.potassium) : null,
        ph: raw.soil ? raw.soil.ph : null
      },
      crop: {
        name: raw.crop ? raw.crop.name : null,
        plantingDate: raw.crop ? raw.crop.plantingDate : null,
        growthStage: raw.crop ? raw.crop.growthStage : null
      },
      fieldConditions: {
        soilMoisture: raw.fieldConditions ? raw.fieldConditions.soilMoisture : null
      },
      weather: raw.weather || {},
      diseaseContext: raw.diseaseContext || { detected: false, disease: null },
      marketContext: raw.marketContext || {},
      lastUpdated: raw.updatedAt || raw.lastUpdated || null
    };
  }
}

module.exports = new SharedFarmStateService();
