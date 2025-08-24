// src/models/MarkupProfile.js - NEW
const mongoose = require('mongoose');

const markupProfileSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true
  },
  
  description: String,
  
  // Who can use this profile
  applicableRoles: [{
    type: String,
    enum: ['system_admin', 'conship_employee', 'customer', 'foreign_partner']
  }],
  
  // Show direct costs without markup
  showDirectCosts: {
    type: Boolean,
    default: false
  },
  
  // Markup rules by provider and mode
  markupRules: [{
    provider: String, // 'FreightForce', 'Pelicargo', 'ECULines', or 'ALL'
    mode: {
      type: String,
      enum: ['air', 'ocean', 'road', 'all']
    },
    
    percentage: { type: Number, default: 0 },
    minimumMarkup: { type: Number, default: 0 },
    maximumMarkup: { type: Number, default: Infinity },
    flatFee: { type: Number, default: 0 }
  }],
  
  // Additional fees to add
  additionalFees: [{
    name: String,
    code: String,
    amount: Number,
    feeType: { type: String, enum: ['fixed', 'percentage'], default: 'fixed' },
    serviceType: { type: String, enum: ['air', 'ocean', 'road', 'all'] },
    mandatory: { type: Boolean, default: true },
    active: { type: Boolean, default: true }
  }],
  
  // Priority (higher priority profiles override lower)
  priority: {
    type: Number,
    default: 100
  },
  
  active: {
    type: Boolean,
    default: true
  }
}, { timestamps: true });

module.exports = mongoose.model('MarkupProfile', markupProfileSchema);
