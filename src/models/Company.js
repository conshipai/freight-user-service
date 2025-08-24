// src/models/Company.js
const mongoose = require('mongoose');

const companySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true
  },
  type: {
    type: String,
    enum: ['customer', 'foreign_partner'],
    required: true
  },
  
  // Company details
  address: String,
  city: String,
  state: String,
  country: String,
  phone: String,
  
  // Main contact (first user created)
  primaryUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  
  // MARKUP CONFIGURATION PER COMPANY
  markupRules: [{
    provider: {
      type: String,
      enum: ['FreightForce', 'Pelicargo', 'ECULines', 'ALL'],
      default: 'ALL'
    },
    mode: {
      type: String,
      enum: ['air', 'ocean', 'road', 'all'],
      default: 'all'
    },
    percentage: { type: Number, default: 0 },
    minimumMarkup: { type: Number, default: 0 },
    maximumMarkup: { type: Number, default: 999999 },
    flatFee: { type: Number, default: 0 },
    active: { type: Boolean, default: true }
  }],
  
  // Additional fees this company sees
  additionalFees: [{
    name: String,
    code: String,
    amount: Number,
    feeType: { 
      type: String, 
      enum: ['fixed', 'percentage'], 
      default: 'fixed' 
    },
    appliesTo: {
      type: String,
      enum: ['air', 'ocean', 'road', 'all'],
      default: 'all'
    },
    active: { type: Boolean, default: true }
  }],
  
  // Special privileges
  canSeeDirectCosts: { type: Boolean, default: false },
  
  active: { type: Boolean, default: true }
}, {
  timestamps: true
});

module.exports = mongoose.model('Company', companySchema);
