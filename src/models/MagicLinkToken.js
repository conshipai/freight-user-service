// src/models/MagicLinkToken.js - NEW
const mongoose = require('mongoose');
const crypto = require('crypto');

const magicLinkTokenSchema = new mongoose.Schema({
  token: {
    type: String,
    required: true,
    unique: true,
    default: () => crypto.randomBytes(32).toString('hex')
  },
  
  requestId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'GroundRequest',
    required: true
  },
  
  carrierId: String,
  carrierName: String,
  carrierEmail: String,
  
  serviceType: String,  // 'ftl' or 'expedited'
  responseDeadline: Date,
  
  // Usage tracking
  used: { type: Boolean, default: false },
  usedAt: Date,
  clickCount: { type: Number, default: 0 },
  firstClickAt: Date,
  ipAddresses: [String],  // Track IPs for security
  
  expiresAt: {
    type: Date,
    required: true,
    index: { expireAfterSeconds: 0 }  // Auto-delete expired tokens
  }
}, {
  timestamps: true
});

// Index for fast lookup
magicLinkTokenSchema.index({ token: 1 });
magicLinkTokenSchema.index({ requestId: 1, carrierId: 1 });

module.exports = mongoose.model('MagicLinkToken', magicLinkTokenSchema);
