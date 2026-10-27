const AXES = {
  latitude: { maxDegrees: 90, positive: 'N', negative: 'S', label: 'Latitude' },
  longitude: { maxDegrees: 180, positive: 'E', negative: 'W', label: 'Longitude' }
};

export function decimalToDms(value, axis) {
  const config = AXES[axis];
  if (!config || typeof value !== 'number' || !Number.isFinite(value)) return null;
  let totalSeconds = Math.round(Math.abs(value) * 3600000) / 1000;
  let degrees = Math.floor(totalSeconds / 3600);
  totalSeconds -= degrees * 3600;
  let minutes = Math.floor(totalSeconds / 60);
  let seconds = totalSeconds - minutes * 60;
  if (seconds >= 59.9995) { seconds = 0; minutes += 1; }
  if (minutes >= 60) { minutes = 0; degrees += 1; }
  return {
    degrees: String(degrees), minutes: String(minutes), seconds: seconds.toFixed(3).replace(/\.?0+$/, ''),
    direction: value < 0 ? config.negative : config.positive
  };
}

export function validateDmsCoordinate(values, axis) {
  const config = AXES[axis];
  if (!config) return { value: null, error: 'Choose latitude or longitude.' };
  const { degrees, minutes, seconds, direction } = values || {};
  const coordinateParts = [degrees, minutes, seconds];
  if (coordinateParts.every(part => part === '' || part === null || part === undefined)) return { value: null, error: null };
  const parts = [...coordinateParts, direction];
  if (parts.some(part => part === '' || part === null || part === undefined)) {
    return { value: null, error: `${config.label} requires degrees, minutes, seconds, and direction.` };
  }
  const deg = Number(degrees); const min = Number(minutes); const sec = Number(seconds);
  if (!Number.isInteger(deg) || deg < 0 || deg > config.maxDegrees) {
    return { value: null, error: `${config.label} degrees must be between 0 and ${config.maxDegrees}.` };
  }
  if (!Number.isInteger(min) || min < 0 || min > 59) {
    return { value: null, error: `${config.label} minutes must be between 0 and 59.` };
  }
  if (!Number.isFinite(sec) || sec < 0 || sec >= 60) {
    return { value: null, error: `${config.label} seconds must be at least 0 and less than 60.` };
  }
  if (deg === config.maxDegrees && (min !== 0 || sec !== 0)) {
    return { value: null, error: `At ${config.maxDegrees}° ${config.label} must have 0 minutes and 0 seconds.` };
  }
  if (direction !== config.positive && direction !== config.negative) {
    return { value: null, error: `${config.label} direction must be ${config.positive} or ${config.negative}.` };
  }
  const magnitude = deg + min / 60 + sec / 3600;
  return { value: direction === config.negative ? -magnitude : magnitude, error: null };
}

export function decimalToCoordinateFields(latitude, longitude) {
  const lat = latitude === '' || latitude === null || latitude === undefined ? null : decimalToDms(Number(latitude), 'latitude');
  const lon = longitude === '' || longitude === null || longitude === undefined ? null : decimalToDms(Number(longitude), 'longitude');
  return {
    latDegrees: lat?.degrees ?? '', latMinutes: lat?.minutes ?? '', latSeconds: lat?.seconds ?? '', latDirection: lat?.direction ?? 'N',
    lonDegrees: lon?.degrees ?? '', lonMinutes: lon?.minutes ?? '', lonSeconds: lon?.seconds ?? '', lonDirection: lon?.direction ?? 'E'
  };
}

export function coordinateFieldsToDecimal(values, prefix, axis) {
  const result = validateDmsCoordinate({
    degrees: values[`${prefix}Degrees`], minutes: values[`${prefix}Minutes`],
    seconds: values[`${prefix}Seconds`], direction: values[`${prefix}Direction`]
  }, axis);
  return result;
}
