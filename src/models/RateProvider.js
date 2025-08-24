const mongoose = require('mongoose');

const rateProviderSchema = new mongoose.Schema({
  // Basic Information
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  code: {
    type: String,
    required: true,
    unique: true,
    uppercase: true, // 'PELICARGO', 'DHL_API', 'FEDEX_API', etc.
    trim: true
  },
  type: {
    type: String,
    enum: ['api', 'manual', 'email'],
    default: 'api'
  },
  
  // API Configuration (if type is 'api')
  apiConfig: {
    baseUrl: String,
    apiKey: String,
    apiSecret: String,
    username: String,
    password: String,
    accountNumber: String,
    customHeaders: mongoose.Schema.Types.Mixed,
    timeout: { type: Number, default: 30000 }, // 30 seconds
    retryAttempts: { type: Number, default: 3 }
  },
  
  // Services this provider offers
  services: [{
    mode: {
      type: String,
      enum: ['air', 'ocean', 'road'],
      required: true
    },
    serviceTypes: [String], // ['express', 'economy', 'standard']
    active: { type: Boolean, default: true }
  }],
  
  // Coverage areas
  coverage: {
    countries: [String],     // Countries they service
    regions: [String],       // Specific regions
    excludedCountries: [String], // Countries they don't service
    excludedCities: [String]     // Cities they don't service
  },
  
  // Markup Settings - THIS IS THE KEY PART
  markupSettings: {
    air: {
      percentage: { type: Number, default: 25 },
      minimumMarkup: { type: Number, default: 50 },  // Minimum $ to add
      maximumMarkup: { type: Number, default: 5000 }, // Maximum $ to add
      flatFee: { type: Number, default: 0 }          // Additional flat fee
    },
    ocean: {
      percentage: { type: Number, default: 20 },
      minimumMarkup: { type: Number, default: 75 },
      maximumMarkup: { type: Number, default: 10000 },
      flatFee: { type: Number, default: 0 }
    },
    road: {
      percentage: { type: Number, default: 30 },
      minimumMarkup: { type: Number, default: 40 },
      maximumMarkup: { type: Number, default: 3000 },
      flatFee: { type: Number, default: 0 }
    }
  },
  
  // Lane-specific markups (overrides general markup)
  laneMarkups: [{
    origin: String,      // 'US-ELP' (El Paso)
    destination: String, // 'DE-HAM' (Hamburg)
    mode: String,       // 'air'
    percentage: Number,
    flatFee: Number,
    active: { type: Boolean, default: true }
  }],
  
  // Additional fees specific to this provider
  additionalFees: [{
    name: String,           // 'Fuel Surcharge', 'Security Fee'
    code: String,           // 'FSC', 'SEC'
    amount: Number,
    feeType: {
      type: String,
      enum: ['fixed', 'percentage'],
      default: 'fixed'
    },
    serviceType: {
      type: String,
      enum: ['air', 'ocean', 'road', 'all']
    },
    mandatory: { type: Boolean, default: true },
    active: { type: Boolean, default: true }
  }],
  
  // Rate validity and
