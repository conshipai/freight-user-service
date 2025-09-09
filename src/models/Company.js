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
// src/models/Company.js - Update the markupRules provider enum
    markupRules: [{
      provider: {
        type: String,
        enum: [
          // API Providers
          'FreightForce', 'Pelicargo', 'ECULines',
          // Ground Carriers  
          'STG', 'SEFL', 'FEDEX_FREIGHT', 'OLD_DOMINION',
          'XPO', 'ESTES', 'RL_CARRIERS', 'TFORCE',
          'SAIA', 'ABF', 'AVERITT',
          // Parcel
          'FEDEX_EXPRESS', 'UPS',
          // Regional
          'CENTRAL_TRANSPORT', 'DAYTON', 'PITT_OHIO',
          // Catch-all
          'ALL'
        ],
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
  
  // Carrier settings and preferences
  carrierSettings: {
    preferredCarriers: [{
      type: String,
      enum: ['FEDEX_FREIGHT', 'OLD_DOMINION', 'XPO', 'ESTES', 'RL_CARRIERS', 
             'TFORCE', 'SAIA', 'ABF', 'SEFL', 'AVERITT', 'FEDEX_EXPRESS', 
             'UPS', 'CENTRAL_TRANSPORT', 'DAYTON', 'PITT_OHIO']
    }],
    blockedCarriers: [{
      type: String,
      enum: ['FEDEX_FREIGHT', 'OLD_DOMINION', 'XPO', 'ESTES', 'RL_CARRIERS', 
             'TFORCE', 'SAIA', 'ABF', 'SEFL', 'AVERITT', 'FEDEX_EXPRESS', 
             'UPS', 'CENTRAL_TRANSPORT', 'DAYTON', 'PITT_OHIO']
    }],
    useOwnAccountsFirst: { type: Boolean, default: false },
    showBothOptions: { type: Boolean, default: true },  // Show both company and customer rates
    autoSelectCheapest: { type: Boolean, default: false },
    maxCarriersToShow: { type: Number, default: 10 }
  },
  
  active: { type: Boolean, default: true }
}, {
  timestamps: true
});

module.exports = mongoose.model('Company', companySchema);
