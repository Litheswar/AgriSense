import { coordinateFieldsToDecimal, decimalToCoordinateFields } from './coordinates.js';

export function farmToFormValues(farm) {
  return {
    name: farm?.name || '',
    state: farm?.location?.state || '',
    district: farm?.location?.district || '',
    village: farm?.location?.village || '',
    latitude: farm?.location?.latitude ?? '',
    longitude: farm?.location?.longitude ?? '',
    coordinateFormat: 'decimal',
    ...decimalToCoordinateFields(farm?.location?.latitude, farm?.location?.longitude),
    crop: farm?.crop?.name || '',
    nitrogen: farm?.soil?.nitrogen ?? '',
    phosphorus: farm?.soil?.phosphorus ?? '',
    potassium: farm?.soil?.potassium ?? '',
    ph: farm?.soil?.ph ?? '',
    soilMoisture: farm?.fieldConditions?.soilMoisture ?? ''
  };
}

const numberValue = (value) => value === '' || value === null || value === undefined ? null : Number(value);

export function validateFarmValues(values) {
  const errors = {};
  if (!values.name.trim()) errors.name = 'Enter a farm name.';
  else if (values.name.trim().length > 120) errors.name = 'Farm name must be 120 characters or fewer.';
  if (!values.state.trim()) errors.state = 'Enter a state.';
  if (!values.district.trim()) errors.district = 'Enter a district.';

  const ranges = {
    nitrogen: [0, Infinity],
    phosphorus: [0, Infinity], potassium: [0, Infinity], ph: [0, 14], soilMoisture: [0, 100]
  };
  for (const [field, [min, max]] of Object.entries(ranges)) {
    if (values[field] === '' || values[field] === null || values[field] === undefined) continue;
    const value = Number(values[field]);
    if (!Number.isFinite(value) || value < min || value > max) {
      errors[field] = `${field === 'ph' ? 'pH' : field === 'soilMoisture' ? 'Soil moisture' : field[0].toUpperCase() + field.slice(1)} must be ${max === Infinity ? `${min} or greater` : `between ${min} and ${max}`}.`;
    }
  }
  if (values.coordinateFormat === 'dms') {
    const latitude = coordinateFieldsToDecimal(values, 'lat', 'latitude');
    const longitude = coordinateFieldsToDecimal(values, 'lon', 'longitude');
    if (latitude.error) errors.latitude = latitude.error;
    if (longitude.error) errors.longitude = longitude.error;
    if (!latitude.error && !longitude.error && ((latitude.value === null) !== (longitude.value === null))) {
      errors.latitude = 'Enter both latitude and longitude, or leave both blank.';
      errors.longitude = 'Enter both latitude and longitude, or leave both blank.';
    }
  } else {
    const latitudeBlank = values.latitude === '' || values.latitude === null || values.latitude === undefined;
    const longitudeBlank = values.longitude === '' || values.longitude === null || values.longitude === undefined;
    if (latitudeBlank !== longitudeBlank) {
      errors.latitude = 'Enter both latitude and longitude, or leave both blank.';
      errors.longitude = 'Enter both latitude and longitude, or leave both blank.';
    }
    for (const [field, min, max] of [['latitude', -90, 90], ['longitude', -180, 180]]) {
      const value = values[field];
      if (value === '' || value === null || value === undefined) continue;
      if (!Number.isFinite(Number(value)) || Number(value) < min || Number(value) > max) {
        errors[field] = `${field === 'latitude' ? 'Latitude' : 'Longitude'} must be between ${min} and ${max}.`;
      }
    }
  }
  return errors;
}

export function farmValuesToPayload(values) {
  const latitude = values.coordinateFormat === 'dms'
    ? coordinateFieldsToDecimal(values, 'lat', 'latitude').value
    : numberValue(values.latitude);
  const longitude = values.coordinateFormat === 'dms'
    ? coordinateFieldsToDecimal(values, 'lon', 'longitude').value
    : numberValue(values.longitude);
  return {
    name: values.name.trim(),
    location: {
      state: values.state.trim(), district: values.district.trim(),
      village: values.village.trim() || null,
      latitude, longitude
    },
    crop: { name: values.crop.trim() || null },
    soil: {
      nitrogen: numberValue(values.nitrogen), phosphorus: numberValue(values.phosphorus),
      potassium: numberValue(values.potassium), ph: numberValue(values.ph)
    },
    fieldConditions: { soilMoisture: numberValue(values.soilMoisture) }
  };
}
