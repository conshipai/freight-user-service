//backend/src/models/Shipment.js
const mongoose = require('mongoose');
const { ShipmentLifecycle } = require('../constants/shipmentLifecycle'); // ADD THIS LINE

const ShipmentSchema = new mongoose.Schema({
  // Reference to original booking
  bookingId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Booking',
    required: true
  },
  
  // Unique identifiers
  shipmentNumber: {
    type: String,
    unique: true,
    required: true
  },
  proNumber: String,
  
  // UPDATED STATUS FIELD - THIS IS THE MAIN CHANGE
  status: {
    type: String,
    enum: [
      ShipmentLifecycle.SHIPMENT_CREATED,
      ShipmentLifecycle.SHIPMENT_IN_TRANSIT,
      ShipmentLifecycle.SHIPMENT_DELIVERED
    ],
    default: ShipmentLifecycle.SHIPMENT_CREATED
  },
  
  // Parties
  customerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Carrier Information
  carrier: {
    name: String,
    contact: String,
    phone: String,
    email: String,
    driverId: String,
    truckNumber: String,
    trailerNumber: String
  },
  
  // Locations (denormalized for performance)
  origin: {
    company: String,
    address: String,
    city: String,
    state: String,
    zip: String,
    contact: String,
    phone: String,
    notes: String
  },
  
  destination: {
    company: String,
    address: String,
    city: String,
    state: String,
    zip: String,
    contact: String,
    phone: String,
    notes: String
  },
  
  // Dates
  scheduledPickup: Date,
  scheduledDelivery: Date,
  actualPickup: Date,
  actualDelivery: Date,
  
  // Cargo Details
  cargo: {
    pieces: Number,
    weight: Number,
    dimensions: String,
    description: String,
    value: Number,
    hazmat: Boolean,
    stackable: Boolean,
    specialInstructions: String
  },
  
  // Financial (Override capability)
  costs: {
    originalQuote: Number,      // From booking
    carrierCost: Number,        // Actual cost to carrier
    customerPrice: Number,      // Final price to customer
    additionalCharges: [{
      type: String,
      description: String,
      amount: Number,
      addedBy: mongoose.Schema.Types.ObjectId,
      addedAt: Date
    }],
    profitMargin: Number        // Auto-calculated
  },
  
  // Milestones/Events - NOTE: These use different status values than the main status
  milestones: [{
    type: {
      type: String,
      enum: ['DISPATCHED', 'ONSITE', 'LOADING', 'IN_TRANSIT', 'AT_DESTINATION', 'DELIVERED']
    },
    timestamp: Date,
    location: String,
    notes: String,
    recordedBy: mongoose.Schema.Types.ObjectId,
    gpsCoordinates: {
      lat: Number,
      lng: Number
    }
  }],
  
  // Documents
  documents: [{
    type: {
      type: String,
      enum: ['BOL', 'POD', 'INVOICE', 'RATE_CONFIRMATION', 'OTHER']
    },
    name: String,
    url: String,
    uploadedBy: mongoose.Schema.Types.ObjectId,
    uploadedAt: Date
  }],
  
  // Communication Log
  notes: [{
    text: String,
    createdBy: mongoose.Schema.Types.ObjectId,
    createdAt: Date,
    isInternal: Boolean  // true = ConShip only, false = customer visible
  }],
  
  // BOL Data
  bol: {
    number: String,
    generatedAt: Date,
    url: String,
    signedUrl: String,
    signedBy: String,
    signedAt: Date
  }
  
}, {
  timestamps: true
});

// Auto-generate shipment number
ShipmentSchema.pre('save', async function(next) {
  if (!this.shipmentNumber) {
    const year = new Date().getFullYear();
    const count = await this.constructor.countDocuments({ 
      createdAt: { 
        $gte: new Date(year, 0, 1),
        $lt: new Date(year + 1, 0, 1)
      }
    });
    this.shipmentNumber = `SHP-${year}-${String(count + 1).padStart(6, '0')}`;
  }
  
  // Calculate profit margin
  if (this.costs.customerPrice && this.costs.carrierCost) {
    this.costs.profitMargin = this.costs.customerPrice - this.costs.carrierCost;
  }
  
  next();
});

module.exports = mongoose.model('Shipment', ShipmentSchema);
