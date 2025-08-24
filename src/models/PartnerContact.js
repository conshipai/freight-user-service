const mongoose = require('mongoose');

const partnerContactSchema = new mongoose.Schema({
  partnerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Partner',
    required: true
  },
  
  // Contact Information
  name: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true,
    lowercase: true
  },
  phone: String,
  mobile: String,
  position: String,
  department: String,
  
  // What this contact handles
  responsibilities: [{
    mode: {
      type: String,
      enum: ['air', 'ocean', 'road'],
      required: true
    },
    cities: [String],        // ['Hamburg', 'Berlin', 'Munich'] or ['all']
    regions: [String],       // ['Northern Germany', 'Bavaria'] or ['all']
    isDefault: Boolean,      // Fallback contact for this mode
    notes: String           // Special instructions
  }],
  
  // Contact Type
  contactType: {
    type: String,
    enum: ['primary', 'quotes', 'operations', 'finance', 'escalation'],
    default: 'quotes'
  },
  
  // Escalation Level (for escalation contacts)
  escalationLevel: {
    type: Number,
    min: 1,
    max: 3
  },
  responseTimeSLA: {
    type: Number,  // in hours
    default: 24
  },
  
  // Authentication for partner portal
  hasPortalAccess: {
    type: Boolean,
    default: false
  },
  portalRole: {
    type: String,
    enum: ['admin', 'user', 'viewer'],
    default: 'user'
  },
  magicLinkToken: String,
  magicLinkExpiry: Date,
  lastLogin: Date,
  
  // Preferences
  preferredLanguage: {
    type: String,
    default: 'en'
  },
  communicationPreferences: {
    email: { type: Boolean, default: true },
    sms: { type: Boolean, default: false },
    whatsapp: { type: Boolean, default: false }
  },
  
  // Status
  active: {
    type: Boolean,
    default: true
  }
  
}, {
  timestamps: true
});

// Indexes
partnerContactSchema.index({ partnerId: 1, contactType: 1 });
partnerContactSchema.index({ email: 1 });
partnerContactSchema.index({ 'responsibilities.mode': 1, 'responsibilities.cities': 1 });

module.exports = mongoose.model('PartnerContact', partnerContactSchema);
