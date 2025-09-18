// src/models/Booking.js
const mongoose = require('mongoose');
const { ShipmentLifecycle } = require('../constants/shipmentLifecycle'); // ADD THIS LINE

const BookingSchema = new mongoose.Schema({
  // Existing unique identifiers (keep as is)
  bookingId: { 
    type: String, 
    unique: true, 
    required: true 
  },
  confirmationNumber: { 
    type: String, 
    required: true 
  },
  pickupNumber: { 
    type: String,
    required: function () {
      // Only required if carrier is assigned or in transit
      return this.status === ShipmentLifecycle.BOOKING_CARRIER_ASSIGNED || 
             this.status === ShipmentLifecycle.SHIPMENT_IN_TRANSIT;
    }
  },

  // Link to original quote request (keep as is)
  requestId: {
    type: String,
  },

  // Booking details (keep existing, add some new)
  mode: {
    type: String,
    enum: ['ground', 'air', 'ocean'],
    required: true
  },
  serviceType: String, // 'ltl', 'ftl', 'expedited', etc.
  carrier: String,
  price: Number,

  // UPDATED STATUS FIELD
  // Include CANCELLED and DELIVERED so routes that set those values don't fail enum validation.
  status: {
    type: String,
    enum: [
      ShipmentLifecycle.BOOKING_CREATED,
      ShipmentLifecycle.BOOKING_CONFIRMED,
      ShipmentLifecycle.BOOKING_CARRIER_ASSIGNED,
      ShipmentLifecycle.SHIPMENT_IN_TRANSIT,
      // Allow these terminal states (the routes use plain strings):
      'CANCELLED',
      'DELIVERED'
    ],
    default: ShipmentLifecycle.BOOKING_CREATED
  },

  // Detailed origin information (optional for backward compatibility)
  origin: {
    city: String,
    state: String,
    zip: String,
    company: String,
    address: String,
    address2: String,
    contactName: String,
    contactPhone: String,
    contactEmail: String,
    dockHours: String,
    notes: String
  },

  // Detailed destination information
  destination: {
    city: String,
    state: String,
    zip: String,
    company: String,
    address: String,
    address2: String,
    contactName: String,
    contactPhone: String,
    contactEmail: String,
    dockHours: String,
    notes: String
  },

  // Enhanced commodity information
  totalWeight: Number,
  totalPieces: Number,
  description: String,
  commodityClass: String,

  // Individual items (if provided)
  items: [{
    pieces: Number,
    weight: Number,
    length: Number,
    width: Number,
    height: Number,
    description: String
  }],

  // Reference numbers (max 4)
  referenceNumbers: [{
    type: String,
    value: String
  }],

  // Special instructions
  specialInstructions: String,

  // Carrier assignment fields
  rate: Number,
  etaToPickup: Date,
  carrierNotes: String,
  assignedBy: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User' 
  },
  assignedAt: Date,

  // Store all the original form data (keep for backward compatibility)
  shipmentData: mongoose.Schema.Types.Mixed,

  // User info (keep existing)
  userId: {
    type: String,
  },
  userEmail: String,

  // Documents (keep existing)
  documents: [{
    type: String,
    name: String,
    url: String,
    createdAt: Date
  }],

  // Dates
  pickupDate: Date,
  deliveryDate: Date,

  // 🚨 NEW: Cancellation metadata (for cancel endpoints)
  cancelledAt: Date,
  cancelledBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  cancellationReason: String
}, {
  timestamps: true
});

// Indexes for better query performance
BookingSchema.index({ status: 1, createdAt: -1 });
BookingSchema.index({ userId: 1, createdAt: -1 });
BookingSchema.index({ 'origin.zip': 1, 'destination.zip': 1 });

module.exports = mongoose.model('Booking', BookingSchema);
