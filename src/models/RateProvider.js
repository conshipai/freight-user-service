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
  
  // Coverage areas (optional, left intact if you still want them)
  coverage: {
    countries: [String],
    regions: [String],
    excludedCountries: [String],
    excludedCities: [String]
  },
  
  // Rate validity and caching
  rateValidity: {
    type: Number,
    default: 24, // hours
    min: 1,
    max: 720    // 30 days max
  },
  cachingEnabled: {
    type: Boolean,
    default: true
  },
  
  // Priority for rate selection (lower number = higher priority)
  priority: {
    type: Number,
    default: 100,
    min: 1,
    max: 1000
  },
  
  // Status
  status: {
    type: String,
    enum: ['active', 'inactive'],
    default: 'active'
  },
  
  // Performance metrics
  metrics: {
    totalQuotes: { type: Number, default: 0 },
    successfulQuotes: { type: Number, default: 0 },
    failedQuotes: { type: Number, default: 0 },
    averageResponseTime: { type: Number, default: 0 }, // milliseconds
    lastSuccessAt: Date,
    lastFailureAt: Date,
    failureReason: String
  },
  
  // Notes and metadata
  notes: String,
  tags: [String]
  
}, {
  timestamps: true
});

// Indexes
rateProviderSchema.index({ code: 1 });
rateProviderSchema.index({ status: 1 });
rateProviderSchema.index({ 'services.mode': 1 });

module.exports = mongoose.model('RateProvider', rateProviderSchema);
