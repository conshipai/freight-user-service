// ============================================
// 2. src/models/Carrier.js
// ============================================
const mongoose = require('mongoose');

const carrierSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true
  },
  email: {
    type: String,
    required: true
  },
  phone: String,
  services: [{
    type: String,
    enum: ['ltl', 'ftl', 'expedited', 'flatbed', 'refrigerated']
  }],
  equipment: [{
    type: String,
    enum: ['dry_van', 'reefer', 'flatbed', 'step_deck', 'box_truck', 'sprinter']
  }],
  operatingRegions: [{
    type: String,
    enum: ['northeast', 'southeast', 'midwest', 'southwest', 'west', 'nationwide', 'canada', 'mexico']
  }],
  mcNumber: String,
  dotNumber: String,
  scac: String,
  insurance: {
    liability: Number,
    cargo: Number,
    expiresAt: Date
  },
  rating: {
    type: Number,
    min: 1,
    max: 5
  },
  active: {
    type: Boolean,
    default: true
  },
  notes: String,
  apiEnabled: {
    type: Boolean,
    default: false
  },
  apiCredentials: {
    endpoint: String,
    username: String,
    password: String,
    apiKey: String
  },
  performanceMetrics: {
    onTimePercentage: Number,
    claimsRatio: Number,
    quotesSubmitted: { type: Number, default: 0 },
    quotesWon: { type: Number, default: 0 },
    lastQuoteAt: Date
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  deletedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  deletedAt: Date
}, {
  timestamps: true
});

// Indexes
carrierSchema.index({ active: 1, services: 1 });
carrierSchema.index({ name: 'text' });
carrierSchema.index({ mcNumber: 1 });

module.exports = mongoose.model('Carrier', carrierSchema);
