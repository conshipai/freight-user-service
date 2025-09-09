// src/models/GroundRequest.js - UPDATED
const mongoose = require('mongoose');

const groundRequestSchema = new mongoose.Schema({
  requestNumber: String,
  userId: mongoose.Schema.Types.ObjectId,
  serviceType: String,
  status: {
    type: String,
    enum: ['processing', 'pending_carrier_response', 'quoted', 'failed', 'booked'],
    default: 'processing'
  },
  
  // NEW: Carrier invitation tracking
  carrierInvitations: [{
    carrierId: String,           // From carrier management
    carrierName: String,
    carrierEmail: String,
    magicToken: String,          // Unique token for this carrier
    tokenExpiry: Date,           // 2 hours from creation
    responseDeadline: Date,      // 1 hour for FTL, 15 min for expedited
    
    // KPI Tracking
    emailSentAt: Date,
    linkClickedAt: Date,         // When they first viewed
    submittedAt: Date,           // When they submitted
    responseTimeMinutes: Number, // Calculated on submission
    
    status: {
      type: String,
      enum: ['invited', 'viewed', 'submitted', 'declined', 'expired'],
      default: 'invited'
    }
  }],
  
  // Milk run support (multiple stops)
  additionalStops: [{
    type: { type: String, enum: ['pickup', 'delivery'] },
    city: String,
    state: String,
    zipCode: String,
    sequence: Number  // Order of stops
  }],
  
  formData: Object,
  error: String
}, {
  timestamps: true
});

// Auto-generate requestNumber
groundRequestSchema.pre('save', async function(next) {
  if (!this.requestNumber) {
    this.requestNumber = `GRQ-${Date.now()}`;
  }
  next();
});

module.exports = mongoose.model('GroundRequest', groundRequestSchema);
