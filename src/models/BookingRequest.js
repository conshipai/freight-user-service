// src/models/BookingRequest.js
const mongoose = require('mongoose');

const bookingRequestSchema = new mongoose.Schema({
  quoteId: { type: String, required: true },
  requestNumber: { type: String, unique: true },
  status: {
    type: String,
    enum: ['pending_review', 'approved', 'needs_info', 'rejected', 'converted'],
    default: 'pending_review'
  },
  
  pickup: {
    company: String,
    address: String,
    city: String,
    state: String,
    zip: String,
    contactName: String,
    contactPhone: String,
    contactEmail: String,
    readyDate: Date,
    readyTime: String
  },
  
  delivery: {
    company: String,
    address: String,
    city: String,
    state: String,
    zip: String,
    contactName: String,
    contactPhone: String,
    contactEmail: String,
    requiredDate: Date,
    guaranteed: Boolean
  },
  
  cargo: {
    totalWeight: Number,
    totalPieces: Number,
    description: String
  },
  
  pricing: {
    total: Number
  },
  
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  customerEmail: String,
  createdBy: String,
  createdAt: { type: Date, default: Date.now }
});

// Generate unique booking request number
bookingRequestSchema.pre('save', async function(next) {
  if (!this.requestNumber) {
    const count = await this.constructor.countDocuments();
    this.requestNumber = `BR-${Date.now()}`;
  }
  next();
});

module.exports = mongoose.model('BookingRequest', bookingRequestSchema);
