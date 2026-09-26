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
class FarmWeatherService {
  constructor(provider = weatherService) { this.provider = provider; }
  async getWeather(farmId) {
    const farm = await farmService.getFarmById(farmId);
    const weather = farm.weather && farm.weather.toObject ? farm.weather.toObject() : (farm.weather || {});
    return { success: true, farmId: farm._id.toString(), weather, freshness: freshness(weather) };
  }
  async refreshWeather(farmId) {
    const farm = await farmService.getFarmById(farmId);
    const location = farm.location || {};
    const normalized = await this.provider.getWeather(location.latitude, location.longitude);
    farm.weather = normalized;
    await farm.validate();
    if (farmService._useLiveDB()) await farm.save();
    return { success: true, farmId: farm._id.toString(), weather: farm.weather.toObject ? farm.weather.toObject() : farm.weather, freshness: freshness(normalized), sharedFarmState: farm.toSharedFarmState() };
  }
}
module.exports = new FarmWeatherService();
module.exports.FarmWeatherService = FarmWeatherService;
module.exports.freshness = freshness;
