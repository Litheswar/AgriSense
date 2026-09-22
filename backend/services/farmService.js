/**
 * AgriSense — Farm Business & Persistence Service (Milestone 18).
 *
 * Encapsulates CRUD operations on the Farm model and validates inputs.
 * Supports both live MongoDB connection and memory-store mode for deterministic offline testing.
 */

const mongoose = require('mongoose');
const Farm = require('../db/models/Farm');

class FarmService {
  constructor() {
    this.memoryStore = new Map();
    this.isMemoryMode = false;
  }

  /**
   * Toggle memory store mode (useful for testing when MongoDB is offline).
   */
  setMemoryMode(enabled) {
    this.isMemoryMode = !!enabled;
  }

  /**
   * Checks whether the service should operate against live MongoDB or memory store.
   */
  _useLiveDB() {
    return !this.isMemoryMode && mongoose.connection && mongoose.connection.readyState === 1;
  }

  /**
   * Helper to ensure valid MongoDB ObjectId.
   */
  isValidId(id) {
    return id && mongoose.Types.ObjectId.isValid(id) && /^[0-9a-fA-F]{24}$/.test(id);
  }

  /**
   * Create a new Farm document.
   * @param {object} farmData
   * @returns {Promise<object>} Created Farm document
   */
  async createFarm(farmData) {
    if (!farmData || typeof farmData !== 'object' || Array.isArray(farmData)) {
      const err = new Error('Farm data must be a valid JSON object');
      err.code = 'INVALID_INPUT';
      throw err;
    }

    try {
      const farm = new Farm(farmData);
      await farm.validate();

      if (this._useLiveDB()) {
        const savedFarm = await farm.save();
        return savedFarm;
      } else {
        if (!farm._id) {
          farm._id = new mongoose.Types.ObjectId();
        }
        farm.createdAt = new Date();
        farm.updatedAt = new Date();
        this.memoryStore.set(farm._id.toString(), farm);
        return farm;
      }
    } catch (error) {
      if (error.name === 'ValidationError') {
        const validationErrors = Object.keys(error.errors).map(field => ({
          field,
          message: error.errors[field].message
        }));
        const err = new Error(`Farm validation failed: ${validationErrors.map(e => e.message).join(', ')}`);
        err.code = 'VALIDATION_ERROR';
        err.details = validationErrors;
        throw err;
      }
      throw error;
    }
  }

  /**
   * Retrieve a Farm by ID.
   * @param {string} farmId
   * @returns {Promise<object>} Farm document
   */
  async getFarmById(farmId) {
    if (!this.isValidId(farmId)) {
      const err = new Error(`Invalid farm ID format: '${farmId}'`);
      err.code = 'INVALID_FARM_ID';
      throw err;
    }

    let farm = null;
    if (this._useLiveDB()) {
      farm = await Farm.findById(farmId);
    } else {
      farm = this.memoryStore.get(farmId.toString()) || null;
    }

    if (!farm) {
      const err = new Error(`Farm with ID '${farmId}' not found.`);
      err.code = 'FARM_NOT_FOUND';
      throw err;
    }

    return farm;
  }

  /**
   * Update an existing Farm by ID.
   * Uses PATCH semantics to update only provided fields without overwriting unmodified state.
   * @param {string} farmId
   * @param {object} updateData
   * @returns {Promise<object>} Updated Farm document
   */
  async updateFarm(farmId, updateData) {
    if (!this.isValidId(farmId)) {
      const err = new Error(`Invalid farm ID format: '${farmId}'`);
      err.code = 'INVALID_FARM_ID';
      throw err;
    }

    if (!updateData || typeof updateData !== 'object' || Array.isArray(updateData)) {
      const err = new Error('Update payload must be a valid JSON object');
      err.code = 'INVALID_INPUT';
      throw err;
    }

    // Guard against MongoDB injection / arbitrary root operators
    const sanitizedData = {};
    const allowedRootKeys = [
      'name', 'location', 'soil', 'crop',
      'fieldConditions', 'weather', 'diseaseContext', 'marketContext'
    ];

    for (const key of Object.keys(updateData)) {
      if (key.startsWith('$')) {
        const err = new Error(`MongoDB operator '${key}' is prohibited in update payload.`);
        err.code = 'PROHIBITED_OPERATOR';
        throw err;
      }
      if (allowedRootKeys.includes(key)) {
        sanitizedData[key] = updateData[key];
      }
    }

    const farm = await this.getFarmById(farmId);

    // Merge updates
    for (const [key, val] of Object.entries(sanitizedData)) {
      if (typeof val === 'object' && val !== null && !Array.isArray(val) && !(val instanceof Date)) {
        farm[key] = Object.assign(farm[key] || {}, val);
      } else {
        farm[key] = val;
      }
    }

    try {
      await farm.validate();
      farm.updatedAt = new Date();

      if (this._useLiveDB()) {
        const updatedFarm = await farm.save();
        return updatedFarm;
      } else {
        this.memoryStore.set(farmId.toString(), farm);
        return farm;
      }
    } catch (error) {
      if (error.name === 'ValidationError') {
        const validationErrors = Object.keys(error.errors).map(field => ({
          field,
          message: error.errors[field].message
        }));
        const err = new Error(`Farm update validation failed: ${validationErrors.map(e => e.message).join(', ')}`);
        err.code = 'VALIDATION_ERROR';
        err.details = validationErrors;
        throw err;
      }
      throw error;
    }
  }

  /**
   * Delete a Farm by ID.
   * @param {string} farmId
   * @returns {Promise<object>} Deleted farm details
   */
  async deleteFarm(farmId) {
    if (!this.isValidId(farmId)) {
      const err = new Error(`Invalid farm ID format: '${farmId}'`);
      err.code = 'INVALID_FARM_ID';
      throw err;
    }

    let farm = null;
    if (this._useLiveDB()) {
      farm = await Farm.findByIdAndDelete(farmId);
    } else {
      farm = this.memoryStore.get(farmId.toString()) || null;
      if (farm) {
        this.memoryStore.delete(farmId.toString());
      }
    }

    if (!farm) {
      const err = new Error(`Farm with ID '${farmId}' not found.`);
      err.code = 'FARM_NOT_FOUND';
      throw err;
    }

    return {
      deleted: true,
      farmId: farm._id ? farm._id.toString() : farmId.toString(),
      name: farm.name
    };
  }

  /**
   * List all farms.
   */
  async listFarms(filter = {}, limit = 50) {
    if (this._useLiveDB()) {
      return await Farm.find(filter).sort({ updatedAt: -1 }).limit(limit);
    } else {
      return Array.from(this.memoryStore.values()).slice(0, limit);
    }
  }

  /**
   * Clear in-memory store (for testing).
   */
  clearMemoryStore() {
    this.memoryStore.clear();
  }
}

module.exports = new FarmService();
