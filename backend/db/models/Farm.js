/**
 * AgriSense — Farm Mongoose Schema & Model (Milestone 18).
 *
 * Location: backend/db/models/Farm.js
 * (Placed under backend/db/models/ to avoid conflict with backend/models/ which houses Python AI models).
 *
 * Represents the persistent Shared Farm State across the AgriSense platform.
 */

const mongoose = require('mongoose');
const { Schema } = mongoose;

const LocationSchema = new Schema({
  state: {
    type: String,
    required: [true, 'Location state is required'],
    trim: true
  },
  district: {
    type: String,
    required: [true, 'Location district is required'],
    trim: true
  },
  village: {
    type: String,
    trim: true,
    default: null
  },
  latitude: {
    type: Number,
    min: [-90, 'Latitude must be >= -90'],
    max: [90, 'Latitude must be <= 90'],
    default: null,
    validate: { validator(value) { return (value === null && this.longitude === null) || (value !== null && this.longitude !== null); }, message: 'Enter both latitude and longitude, or leave both blank.' }
  },
  longitude: {
    type: Number,
    min: [-180, 'Longitude must be >= -180'],
    max: [180, 'Longitude must be <= 180'],
    default: null,
    validate: { validator(value) { return (value === null && this.latitude === null) || (value !== null && this.latitude !== null); }, message: 'Enter both latitude and longitude, or leave both blank.' }
  }
}, { _id: false });

const SoilSchema = new Schema({
  nitrogen: {
    type: Number,
    min: [0, 'Nitrogen (N) cannot be negative'],
    default: null
  },
  phosphorus: {
    type: Number,
    min: [0, 'Phosphorus (P) cannot be negative'],
    default: null
  },
  potassium: {
    type: Number,
    min: [0, 'Potassium (K) cannot be negative'],
    default: null
  },
  ph: {
    type: Number,
    min: [0, 'pH must be between 0 and 14'],
    max: [14, 'pH must be between 0 and 14'],
    default: null
  }
}, { _id: false });

const CropSchema = new Schema({
  name: {
    type: String,
    trim: true,
    default: null
  },
  plantingDate: {
    type: Date,
    default: null
  },
  growthStage: {
    type: String,
    trim: true,
    default: 'vegetative'
  }
}, { _id: false });

const FieldConditionsSchema = new Schema({
  soilMoisture: {
    type: Number,
    min: [0, 'Soil moisture must be between 0 and 100%'],
    max: [100, 'Soil moisture must be between 0 and 100%'],
    default: null
  }
}, { _id: false });

const WeatherSchema = new Schema({
  temperature: {
    type: Number,
    min: [-50, 'Temperature is out of reasonable range (-50 to 60 °C)'],
    max: [60, 'Temperature is out of reasonable range (-50 to 60 °C)'],
    default: null
  },
  humidity: {
    type: Number,
    min: [0, 'Humidity must be between 0 and 100%'],
    max: [100, 'Humidity must be between 0 and 100%'],
    default: null
  },
  rainfall: {
    type: Number,
    min: [0, 'Rainfall cannot be negative'],
    default: null
  },
  recentRainfall: {
    type: Number,
    min: [0, 'Recent rainfall cannot be negative'],
    default: null
  },
  rainProbability: {
    type: Number,
    min: [0, 'Rain probability must be between 0 and 100%'],
    max: [100, 'Rain probability must be between 0 and 100%'],
    default: null
  },
  expectedRainfall: {
    type: Number,
    min: [0, 'Expected rainfall cannot be negative'],
    default: null
  },
  source: { type: String, trim: true, default: null },
  status: { type: String, enum: ['available', 'unavailable'], default: 'unavailable' },
  lastErrorCode: { type: String, trim: true, default: null },
  lastAttemptAt: { type: Date, default: null },
  fetchedAt: { type: Date, default: null },
  recordedAt: {
    type: Date,
    default: null
  }
}, { _id: false });

const DiseaseContextSchema = new Schema({
  detected: {
    type: Boolean,
    default: false
  },
  disease: {
    type: String,
    trim: true,
    default: null
  },
  confidence: {
    type: Number,
    min: [0, 'Confidence must be between 0 and 1'],
    max: [1, 'Confidence must be between 0 and 1'],
    default: null
  }
}, { _id: false });

const MarketContextSchema = new Schema({
  market: {
    type: String,
    trim: true,
    default: null
  },
  state: {
    type: String,
    trim: true,
    default: null
  },
  district: {
    type: String,
    trim: true,
    default: null
  }
}, { _id: false });

const FarmSchema = new Schema({
  ownerId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Farm owner is required'],
    index: true
  },
  name: {
    type: String,
    required: [true, 'Farm name is required'],
    trim: true,
    minlength: [1, 'Farm name cannot be empty'],
    maxlength: [120, 'Farm name must be less than 120 characters']
  },
  location: {
    type: LocationSchema,
    required: [true, 'Farm location is required']
  },
  soil: {
    type: SoilSchema,
    default: () => ({})
  },
  crop: {
    type: CropSchema,
    default: () => ({})
  },
  fieldConditions: {
    type: FieldConditionsSchema,
    default: () => ({})
  },
  weather: {
    type: WeatherSchema,
    default: () => ({})
  },
  diseaseContext: {
    type: DiseaseContextSchema,
    default: () => ({})
  },
  marketContext: {
    type: MarketContextSchema,
    default: () => ({})
  }
}, {
  timestamps: true // Adds createdAt and updatedAt automatically
});

/**
 * Transforms Farm document into normalized Shared Farm State object
 * ready to be mapped into any AgriSense AI engine.
 */
FarmSchema.methods.toSharedFarmState = function () {
  const farm = this.toObject();
  return {
    farmId: farm._id ? farm._id.toString() : null,
    name: farm.name,
    location: farm.location,
    soil: {
      N: farm.soil ? farm.soil.nitrogen : null,
      P: farm.soil ? farm.soil.phosphorus : null,
      K: farm.soil ? farm.soil.potassium : null,
      ph: farm.soil ? farm.soil.ph : null
    },
    crop: {
      name: farm.crop ? farm.crop.name : null,
      plantingDate: farm.crop ? farm.crop.plantingDate : null,
      growthStage: farm.crop ? farm.crop.growthStage : null
    },
    fieldConditions: {
      soilMoisture: farm.fieldConditions ? farm.fieldConditions.soilMoisture : null
    },
    weather: farm.weather || {},
    diseaseContext: farm.diseaseContext || { detected: false, disease: null },
    marketContext: farm.marketContext || {},
    lastUpdated: farm.updatedAt
  };
};

module.exports = mongoose.model('Farm', FarmSchema);
