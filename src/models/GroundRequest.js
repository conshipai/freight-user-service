// src/models/GroundRequest.js - UPDATED
const mongoose = require('mongoose');
const { ShipmentLifecycle } = require('../constants/shipmentLifecycle'); // ADD THIS LINE

const groundRequestSchema = new mongoose.Schema({
  requestNumber: String,
  userId: mongoose.Schema.Types.ObjectId,
  serviceType: String,
  
  // UPDATED STATUS FIELD - THIS IS THE MAIN CHANGE
  status: {
    type: String,
    enum: [
      ShipmentLifecycle.QUOTE_REQUESTED,
      ShipmentLifecycle.QUOTE_PROCESSING,
      ShipmentLifecycle.QUOTE_READY,
      ShipmentLifecycle.QUOTE_EXPIRED,
      ShipmentLifecycle.BOOKING_CREATED  // For 'booked' status
    ],
    default: ShipmentLifecycle.QUOTE_PROCESSING
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
