// src/models/Request.js
const mongoose = require('mongoose');

const requestSchema = new mongoose.Schema({
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
  
  // Shipment details
  shipment: {
    origin: {
      airport: String,
      city: String,
      state: String,
      zipCode: String
    },
    destination: {
      airport: String,
      city: String,
      country: String
    },
    cargo: {
      pieces: [{
        id: String,
        quantity: Number,
        weight: Number,
        weightKg: Number,
        length: Number,
        width: Number,
        height: Number,
        lengthCm: Number,
        widthCm: Number,
        heightCm: Number,
        cargoType: {
          type: String,
          enum: ['General', 'Batteries', 'Dangerous Goods'],
          default: 'General'
        },
        commodity: String,
        stackable: { type: Boolean, default: true },
        handling: [String] // ['Stackable', 'NonStackable']
      }],
      totalPieces: Number,
      totalWeight: Number,
      totalWeightKg: Number
    },
    services: [String], // ['liftgate', 'residential', 'appointment']
    pickupDate: Date,
    deliveryDate: Date
  },
  
  // Insurance
  insurance: {
    requested: { type: Boolean, default: false },
    commodity: String,
    insuredValue: Number
  },
  
  // Special cargo details
  dangerousGoods: {
    unNumber: String,
    properName: String,
    classDivision: String,
    packingGroup: String,
    quantity: String,
    notes: String,
    aircraftType: String,
    sdsKey: String, // S3/R2 key for SDS file
    
    // Pelicargo format
    pelicargo: {
      cargo_type: String,
      un_number: Number,
      class: Number,
      packing_group: String,
      proper_shipping_name: String,
      aircraft_variant: String
    }
  },
  
  batteryDetails: {
    mode: {
      type: String,
      enum: ['nonrestricted', 'dg']
    },
    nonRestrictedCode: String, // 'UN3481_PI967_SecII'
    aircraftType: String,
    
    // Pelicargo format
    pelicargo: {
      packing_instruction: String,
      battery_type: String,
      section: String,
      un_number: Number,
      class: Number,
      aircraft_variant: String
    }
  },
  
  // Flags
  hasDangerousGoods: { type: Boolean, default: false },
  hasBatteries: { type: Boolean, default: false },
  requestLCLQuote: { type: Boolean, default: false },
  
  // Status
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed'],
    default: 'pending'
  },
  
  // Metadata
  error: String,
  completedAt: Date
  
}, {
  timestamps: true
});

// Generate request number
requestSchema.pre('save', async function(next) {
  if (!this.requestNumber) {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    this.requestNumber = `REQ-${year}${month}${day}-${random}`;
  }
  next();
});

module.exports = mongoose.model('Request', requestSchema);
