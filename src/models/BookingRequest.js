// backend/models/BookingRequest.js
const mongoose = require('mongoose');

const bookingRequestSchema = new mongoose.Schema({
  // Link to original quote
  quoteId: { type: String, required: true },
  requestNumber: { type: String, required: true, unique: true },
  
  // Status tracking
  status: {
    type: String,
    enum: ['pending_review', 'approved', 'needs_info', 'rejected', 'converted'],
    default: 'pending_review'
  },
  
  // Pickup Information
  pickup: {
    company: { type: String, required: true },
    address: { type: String, required: true },
    city: { type: String, required: true },
    state: { type: String, required: true },
    zip: { type: String, required: true },
    contactName: { type: String, required: true },
    contactPhone: { type: String, required: true },
    contactEmail: { type: String },
    hours: { type: String, default: 'business' },
    customHours: {
      open: String,
      close: String
    },
    readyDate: { type: Date, required: true },
    readyTime: { type: String }
  },
  
  // Delivery Information
  delivery: {
    company: { type: String, required: true },
    address: { type: String, required: true },
    city: { type: String, required: true },
    state: { type: String, required: true },
    zip: { type: String, required: true },
    contactName: { type: String, required: true },
    contactPhone: { type: String, required: true },
    contactEmail: { type: String },
    hours: { type: String, default: 'business' },
    customHours: {
      open: String,
      close: String
    },
    requiredDate: { type: Date },
    requiredTime: { type: String },
    guaranteed: { type: Boolean, default: false }
  },
  
  // Cargo Details
  cargo: {
    pieces: [{
      quantity: Number,
      weight: Number,
      length: Number,
      width: Number,
      height: Number,
      description: String,
      packagingType: String
    }],
    totalWeight: { type: Number, required: true },
    totalPieces: { type: Number, required: true },
    description: String,
    hazmat: { type: Boolean, default: false },
    hazmatDetails: {
      unNumber: String,
      properShippingName: String,
      hazardClass: String,
      packingGroup: String,
      emergencyPhone: String
    }
  },
  
  // Services & Pricing
  services: {
    insurance: { type: Boolean, default: false },
    insuranceValue: Number,
    liftgatePickup: { type: Boolean, default: false },
    liftgateDelivery: { type: Boolean, default: false },
    insidePickup: { type: Boolean, default: false },
    insideDelivery: { type: Boolean, default: false },
    appointmentRequired: { type: Boolean, default: false },
    notifications: [String]
  },
  
  // Pricing from original quote
  pricing: {
    baseRate: Number,
    accessorials: Number,
    insurance: Number,
    total: { type: Number, required: true },
    carrier: String,
    transitDays: Number
  },
  
  // Documents
  documents: [{
    type: String,
    name: String,
    key: String, // R2 storage key
    uploadedAt: Date
  }],
  
  // Meta
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  customerEmail: String,
  specialInstructions: String,
  internalNotes: String,
  
  // Tracking
  createdAt: { type: Date, default: Date.now },
  createdBy: String,
  reviewedAt: Date,
  reviewedBy: String,
  convertedAt: Date,
  shipmentId: String
});

// Generate unique booking request number
bookingRequestSchema.pre('save', async function(next) {
  if (!this.requestNumber) {
    const count = await this.constructor.countDocuments();
    this.requestNumber = `BR-${Date.now()}-${String(count + 1).padStart(4, '0')}`;
  }
  next();
});

module.exports = mongoose.model('BookingRequest', bookingRequestSchema);
