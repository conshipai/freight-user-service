const mongoose = require('mongoose');

const serviceAreaSchema = new mongoose.Schema({
  partnerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Partner',
    required: true
  },
  
  // Location Details
  country: {
    type: String,
    required: true
  },
  city: {
    type: String,
    required: true
  },
  cityCode: String,      // IATA/UN-LOCODE: 'HAM', 'BER'
  region: String,        // 'Northern Germany', 'Bavaria'
  timezone: String,      // 'Europe/Berlin'
  
  // Service Details
  services: [{
    mode: {
      type: String,
      enum: ['air', 'ocean', 'road'],
      required: true
    },
    
    // Airports/Ports/Terminals
    facilities: [{
      type: String,         // 'airport', 'seaport', 'terminal'
      code: String,         // 'HAM', 'DEHAM'
      name: String,         // 'Hamburg Airport'
      address: String
    }],
    
    // Service capabilities
    capabilities: {
      pickup: { type: Boolean, default: true },
      delivery: { type: Boolean, default: true },
      customsClearance: { type: Boolean, default: false },
      warehousing: { type: Boolean, default: false },
      dangerousGoods: { type: Boolean, default: false },
      temperatureControlled: { type: Boolean, default: false },
      oversized: { type: Boolean, default: false }
    },
    
    // Coverage radius (for road mainly)
    coverageRadius: {
      value: Number,        // 50
      unit: {
        type: String,
        enum: ['km', 'miles'],
        default: 'km'
      }
    },
    
    // Cut-off times
    cutoffTimes: {
      monday: { pickup: String, booking: String },    // '14:00', '12:00'
      tuesday: { pickup: String, booking: String },
      wednesday: { pickup: String, booking: String },
      thursday: { pickup: String, booking: String },
      friday: { pickup: String, booking: String },
      saturday: { pickup: String, booking: String },
      sunday: { pickup: String, booking: String }
    },
    
    // Transit times to major destinations
    transitTimes: [{
      destinationCity: String,
      destinationCountry: String,
      transitDays: Number,
      serviceLevel: String  // 'express', 'standard', 'economy'
    }],
    
    active: { type: Boolean, default: true }
  }],
  
  // Postal codes served (optional, for detailed coverage)
  postalCodes: [{
    code: String,
    zone: String,          // Delivery zone
    surcharge: Number      // Additional charge for this postal code
  }],
  
  // Special notes or restrictions
  notes: String,
  restrictions: [String],  // ['No residential delivery', 'Commercial only']
  
  // Status
  active: {
    type: Boolean,
    default: true
  },
  
  // Approval
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  approvedAt: Date
  
}, {
  timestamps: true
});

// Indexes for efficient querying
serviceAreaSchema.index({ partnerId: 1, country: 1, city: 1 });
serviceAreaSchema.index({ country: 1, city: 1, 'services.mode': 1 });
serviceAreaSchema.index({ cityCode: 1 });

module.exports = mongoose.model('ServiceArea', serviceAreaSchema);
