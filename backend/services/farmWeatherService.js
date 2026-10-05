const farmService = require('./farmService');
const weatherService = require('./weatherService');

const FRESHNESS_HOURS = 3;
function freshness(weather, now = Date.now()) {
  const recorded = weather && weather.recordedAt ? new Date(weather.recordedAt).getTime() : NaN;
  const ageMinutes = Number.isFinite(recorded) ? Math.max(0, Math.floor((now - recorded) / 60000)) : null;
  const status = !weather || weather.source !== 'open-meteo' || ageMinutes === null
    ? 'UNKNOWN'
    : (ageMinutes <= FRESHNESS_HOURS * 60 ? 'RECENT' : 'STALE');
  return { status, ageMinutes, thresholdHours: FRESHNESS_HOURS };
}
function hasWeatherValues(weather) {
  return ['temperature', 'humidity', 'rainfall'].every(key => typeof weather?.[key] === 'number' && Number.isFinite(weather[key]));
}
class FarmWeatherService {
  constructor(provider = weatherService) { this.provider = provider; }
  async getWeather(farmId, authorizedFarm = null) {
    const farm = authorizedFarm || await farmService.getFarmById(farmId);
    const weather = farm.weather && farm.weather.toObject ? farm.weather.toObject() : (farm.weather || {});
    if (hasWeatherValues(weather)) weather.status = 'available';
    else weather.status = 'unavailable';
    return { success: true, farmId: farm._id.toString(), weather, freshness: freshness(weather) };
  }
  async refreshWeather(farmId, authorizedFarm = null) {
    const farm = authorizedFarm || await farmService.getFarmById(farmId);
    const location = farm.location || {};
    const previous = farm.weather && farm.weather.toObject ? farm.weather.toObject() : (farm.weather || {});
    const persist = async () => {
      await farm.validate();
      farm.updatedAt = new Date();
      if (farmService._useLiveDB()) await farm.save();
      else farmService.memoryStore.set(farm._id.toString(), farm);
    };
    let normalized;
    try {
      normalized = await this.provider.getWeather(location.latitude, location.longitude);
    } catch (error) {
      farm.weather = {
        ...previous,
        status: hasWeatherValues(previous) ? 'available' : 'unavailable',
        lastErrorCode: error.code || 'WEATHER_PROVIDER_UNAVAILABLE',
        lastAttemptAt: new Date()
      };
      try { await persist(); } catch (persistError) {
        console.error('[AgriSense Weather] Could not persist refresh failure status', JSON.stringify({ code: persistError.code || persistError.name || 'UNKNOWN' }));
      }
      console.warn('[AgriSense Weather] Farm weather refresh was not completed', JSON.stringify({ code: error.code || error.name || 'UNKNOWN' }));
      throw error;
    }
    normalized = {
      ...normalized, status: 'available', lastErrorCode: null,
      lastAttemptAt: new Date()
    };
    farm.weather = normalized;
    await persist();
    const weather = farm.weather.toObject ? farm.weather.toObject() : farm.weather;
    return { success: true, farmId: farm._id.toString(), weather, freshness: freshness(weather), sharedFarmState: farm.toSharedFarmState() };
  }
}
module.exports = new FarmWeatherService();
module.exports.FarmWeatherService = FarmWeatherService;
module.exports.freshness = freshness;
module.exports.hasWeatherValues = hasWeatherValues;
