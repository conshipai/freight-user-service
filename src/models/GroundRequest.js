// src/models/GroundRequest.js
const mongoose = require('mongoose');

const groundRequestSchema = new mongoose.Schema({
  requestNumber: {
    type: String,
    required: true,
    unique: true
  },
  
  // User information
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  userEmail: String,
  company: String,
  
  // Service Type
  serviceType: {
    type: String,
    enum: ['ltl', 'ftl', 'expedited'],
    required: true
  },
  
  // Origin & Destination (Ground uses ZIP codes, not airports!)
  origin: {
    zipCode: { type: String, required: true },
    city: String,
    state: String,
    address: String,
    company: String,
    contact: String,
    phone: String
  },
  
  destination: {
    zipCode: { type: String, required: true },
    city: String,
    state: String,
    address: String,
    company: String,
    contact: String,
    phone: String
  },
  
  // LTL Specific - Commodities with freight class
  ltlDetails: {
    commodities: [{
      unitType: String, // Pallets, Boxes, Crates, etc.
      quantity: Number,
      weight: Number,
      length: Number,
      width: Number,
      height: Number,
      description: String,
      nmfc: String,
      freightClass: String, // 50, 55, 60, 65, 70, 77.5, 85, etc.
      hazmat: Boolean,
      stackable: Boolean
    }]
  },
  
  // FTL Specific - Truck type
  ftlDetails: {
    truckType: {
      type: String,
      enum: ['53_van', 'flatbed', 'stepdeck', 'rgn', 'reefer', 'minifloat', 'other']
    },
    totalWeight: Number,
    palletCount: Number,
    linearFeet: Number,
    temperatureControlled: Boolean,
    targetTemperature: Number
  },
  
  // Expedited Specific
  expeditedDetails: {
    vehicleType: {
      type: String,
      enum: ['sprinter_van', 'cargo_van', 'box_truck', '53_van', 'flatbed', 'minifloat']
    },
    teamDrivers: { type: Boolean, default: false },
    exclusiveUse: { type: Boolean, default: true }
  },
  
  // Common Ground Fields
  pickupDate: Date,
  deliveryDate: Date,
  
  // Accessorials (services)
  accessorials: {
    liftgatePickup: Boolean,
    liftgateDelivery: Boolean,
    residentialPickup: Boolean,
    residentialDelivery: Boolean,
    insidePickup: Boolean,
    insideDelivery: Boolean,
    limitedAccessPickup: Boolean,
    limitedAccessDelivery: Boolean,
    appointmentRequired: Boolean,
    notifyBeforeDelivery: Boolean,
    protectFromFreeze: Boolean
  },
  
  // Insurance
  insurance: {
    requested: { type: Boolean, default: false },
    value: Number,
    commodity: String
  },
  
  // Special Instructions
  specialInstructions: String,
  referenceNumbers: [String],
  poNumber: String,
  
  // Status tracking
  status: {
    type: String,
    enum: ['draft', 'pending', 'processing', 'quoted', 'expired', 'booked', 'failed'],
    default: 'pending'
  },
  
  // Metadata
  expiresAt: Date,
  error: String,
  quotedAt: Date,
  bookedAt: Date
  
}, {
  timestamps: true,
  collection: 'ground_requests' // Explicit collection name
});

// Generate request number with GRD prefix
groundRequestSchema.pre('save', async function(next) {
  if (!this.requestNumber) {
    const count = await mongoose.model('GroundRequest').countDocuments();
    const year = new Date().getFullYear();
    const number = String(count + 1).padStart(5, '0');
    this.requestNumber = `GRD-${year}-${number}`;
  }
  next();
});

module.exports = mongoose.model('GroundRequest', groundRequestSchema);
