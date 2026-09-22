/**
 * AgriSense — Node.js AI Client Service (Milestone 17).
 *
 * Responsibilities:
 * - Construct structured JSON requests for the Python AI layer.
 * - Dispatch requests to Python via local HTTP microservice or direct Subprocess execution.
 * - Parse and validate Python responses.
 * - Handle timeouts, process errors, and invalid payloads cleanly without exposing stack traces.
 */

const { spawn } = require('child_process');
const config = require('../config/aiConfig');

class AIService {
  /**
   * Dispatches a task to the Python AI layer via Subprocess (stdin/stdout).
   * @param {string} task - Name of the AI task.
   * @param {object} payload - Input data for the task.
   * @returns {Promise<object>}
   */
  async executeViaSubprocess(task, payload = {}) {
    return new Promise((resolve, reject) => {
      const requestPayload = JSON.stringify({ task, input: payload });
      const pythonProcess = spawn(config.pythonPath, [config.dispatcherPath], {
        env: process.env,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdoutData = '';
      let stderrData = '';
      let isSettled = false;

      const timer = setTimeout(() => {
        if (!isSettled) {
          isSettled = true;
          pythonProcess.kill();
          return reject({
            success: false,
            error: {
              code: 'TIMEOUT',
              message: `AI task '${task}' timed out after ${config.requestTimeoutMs}ms.`
            }
          });
        }
      }, config.requestTimeoutMs);

      pythonProcess.stdout.on('data', (data) => {
        stdoutData += data.toString();
      });

      pythonProcess.stderr.on('data', (data) => {
        stderrData += data.toString();
      });

      pythonProcess.on('error', (err) => {
        if (!isSettled) {
          isSettled = true;
          clearTimeout(timer);
          return reject({
            success: false,
            error: {
              code: 'PYTHON_SPAWN_ERROR',
              message: `Failed to spawn Python process (${config.pythonPath}): ${err.message}`
            }
          });
        }
      });

      pythonProcess.on('close', (code) => {
        if (isSettled) return;
        isSettled = true;
        clearTimeout(timer);

        if (!stdoutData.trim()) {
          return reject({
            success: false,
            error: {
              code: 'EMPTY_RESPONSE',
              message: `Python process exited with code ${code} without output. Error log: ${stderrData.trim() || 'None'}`
            }
          });
        }

        try {
          const parsed = JSON.parse(stdoutData.trim());
          if (parsed.success === false) {
            return reject(parsed);
          }
          return resolve(parsed);
        } catch (parseErr) {
          return reject({
            success: false,
            error: {
              code: 'MALFORMED_OUTPUT',
              message: `Failed to parse Python JSON output: ${parseErr.message}`,
              raw_output: stdoutData.trim()
            }
          });
        }
      });

      // Write request to stdin and close stream
      pythonProcess.stdin.write(requestPayload);
      pythonProcess.stdin.end();
    });
  }

  /**
   * Main entrypoint for executing any AI task.
   * Uses direct subprocess execution for maximum simplicity and zero-configuration developer experience.
   * @param {string} task
   * @param {object} payload
   */
  async executeTask(task, payload = {}) {
    if (!task || typeof task !== 'string' || !task.trim()) {
      throw {
        success: false,
        error: {
          code: 'INVALID_TASK',
          message: 'Task name must be a non-empty string.'
        }
      };
    }

    return await this.executeViaSubprocess(task.trim(), payload);
  }

  // Specialized convenience methods

  async checkHealth() {
    return await this.executeTask('health', {});
  }

  async predictCrop(soilData) {
    return await this.executeTask('crop_recommendation', soilData);
  }

  async detectDisease(imagePath) {
    return await this.executeTask('disease_detection', { image_path: imagePath });
  }

  async recommendIrrigation(farmState) {
    return await this.executeTask('irrigation', farmState);
  }

  async recommendFertilizer(farmState) {
    return await this.executeTask('fertilizer', farmState);
  }

  async assessDiseaseRisk(farmState) {
    return await this.executeTask('disease_risk', farmState);
  }

  async getMarketIntelligence(marketData) {
    return await this.executeTask('market', marketData);
  }

  async rankCrops(rankingData) {
    return await this.executeTask('crop_ranking', rankingData);
  }
}

module.exports = new AIService();
