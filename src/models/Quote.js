const mongoose = require('mongoose');

const quoteSchema = new mongoose.Schema({
  quoteNumber: {
    type: String,
    required: true,
    unique: true
  },
  
  // Request Information
  requestedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  customerEmail: String,
  customerCompany: String,
  
  // Shipment Details
  shipment: {
    origin: {
      country: String,
      city: String,
      postalCode: String,
      address: String
    },
    destination: {
      country: String,
      city: String,
      postalCode: String,
      address: String
    },
    mode: {
      type: String,
      enum: ['air', 'ocean', 'road']
    },
    serviceType: String, // 'express', 'standard', 'economy'
    
    // Cargo details
    cargo: {
      pieces: Number,
      weight: Number,
      weightUnit: { type: String, default: 'kg' },
      volume: Number,
      volumeUnit: { type: String, default: 'cbm' },
      description: String,
      hsCode: String,
      value: Number,
      currency: { type: String, default: 'USD' },
      dangerousGoods: { type: Boolean, default: false },
      temperatureControlled: { type: Boolean, default: false }
    },
    
    // Dates
    readyDate: Date,
    requiredDeliveryDate: Date
  },
  
  // Rates from different providers
  rates: [{
    providerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'RateProvider'
    },
    providerName: String,
    providerCode: String,
    
    // Original costs from provider
    costs: {
      freight: Number,
      fuel: Number,
      security: Number,
      handling: Number,
      documentation: Number,
      other: [{ name: String, amount: Number }],
      totalCost: Number
    },
    
    // Markup calculation
    markup: {
      percentage: Number,
      amount: Number,
      flatFee: Number,
      totalMarkup: Number
    },
    
    // Additional fees (AWB, ISF, etc.)
    additionalFees: [{
      name: String,
      code: String,
      amount: Number
    }],
    
    // Final sell rates
    sellRates: {
      freight: Number,
      fuel: Number,
      security: Number,
      handling: Number,
      documentation: Number,
      additionalFees: Number,
      totalSell: Number
    },
    
    // Transit and validity
    transitTime: Number, // days
    validUntil: Date,
    
    // Routing information
    routing: {
      pickup: { location: String, date: Date },
      origin: { location: String, date: Date },
      destination: { location: String, date: Date },
      delivery: { location: String, date: Date },
      transhipments: [{ location: String, date: Date }]
    },
    
    selected: { type: Boolean, default: false },
    responseTime: Number, // milliseconds
    quotedAt: { type: Date, default: Date.now }
  }],
  
  // Selected rate (after customer chooses)
  selectedRate: {
    type: mongoose.Schema.Types.ObjectId
  },
  
  // Quote status
  status: {
    type: String,
    enum: ['draft', 'quoted', 'accepted', 'expired', 'rejected', 'booked'],
    default: 'draft'
  },
  
  // Validity
  validUntil: Date,
  
  // Audit trail
  history: [{
    action: String,
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    timestamp: { type: Date, default: Date.now },
    details: mongoose.Schema.Types.Mixed
  }],
  
  // Notes
  internalNotes: String,
  customerNotes: String
  
}, {
  timestamps: true
});

// Generate quote number
quoteSchema.pre('save', async function(next) {
  if (!this.quoteNumber) {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    this.quoteNumber = `Q${year}${month}${random}`;
  }
  next();
});

// Index for efficient queries
quoteSchema.index({ quoteNumber: 1 });
quoteSchema.index({ status: 1, createdAt: -1 });
quoteSchema.index({ 'shipment.origin.country': 1, 'shipment.destination.country': 1 });

module.exports = mongoose.model('Quote', quoteSchema);
