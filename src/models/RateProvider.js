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
    enum: ['active', 'inactive', 'testing', 'suspended'],
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
  tags: [String], // for filtering/grouping
  
}, {
  timestamps: true
});

// Indexes
rateProviderSchema.index({ code: 1 });
rateProviderSchema.index({ status: 1 });
rateProviderSchema.index({ 'services.mode': 1 });

// Method to calculate markup for a given cost
rateProviderSchema.methods.calculateMarkup = function(cost, mode, origin, destination) {
  // Check for lane-specific markup first
  const laneMarkup = this.laneMarkups.find(lane => 
    lane.active &&
    lane.origin === origin &&
    lane.destination === destination &&
    lane.mode === mode
  );
  
  if (laneMarkup) {
    const markupAmount = cost * (laneMarkup.percentage / 100);
    return markupAmount + (laneMarkup.flatFee || 0);
  }
  
  // Use general markup settings
  const settings = this.markupSettings[mode];
  if (!settings) return 0;
  
  let markupAmount = cost * (settings.percentage / 100);
  
  // Apply minimum and maximum constraints
  markupAmount = Math.max(markupAmount, settings.minimumMarkup || 0);
  markupAmount = Math.min(markupAmount, settings.maximumMarkup || Infinity);
  
  // Add flat fee
  markupAmount += settings.flatFee || 0;
  
  return markupAmount;
};

module.exports = mongoose.model('RateProvider', rateProviderSchema);
