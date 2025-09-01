// src/models/Booking.js
const mongoose = require('mongoose');

const BookingSchema = new mongoose.Schema({
  // Unique identifiers
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
    required: true 
  },
  
  // Link to original quote request
  requestId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Request'
  },
  
  // Booking details
  mode: {
    type: String,
    enum: ['ground', 'air', 'ocean'],
    required: true
  },
  serviceType: String, // 'ltl', 'ftl', 'expedited', etc.
  carrier: String,
  price: Number,
  
  // Status tracking
  status: {
    type: String,
    enum: ['CONFIRMED', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED'],
    default: 'CONFIRMED'
  },
  
  // Store all the original form data
  shipmentData: mongoose.Schema.Types.Mixed,
  
  // User info
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  userEmail: String,
  
  // Documents
  documents: [{
    type: String,
    name: String,
    url: String,
    createdAt: Date
  }]
  
}, {
  timestamps: true
});

module.exports = mongoose.model('Booking', BookingSchema);
