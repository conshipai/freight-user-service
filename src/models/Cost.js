// src/models/Cost.js
const mongoose = require('mongoose');
const { ShipmentLifecycle } = require('../constants/shipmentLifecycle'); // ADD THIS LINE

const costSchema = new mongoose.Schema({
  requestId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Request',
    required: true
  },
  
  provider: {
    type: String,
    enum: ['FreightForce', 'Pelicargo', 'ECULines'],
    required: true
  },
  
  providerRequestId: String, // For async providers like Pelicargo
  
  // What we sent to provider
  rawRequest: mongoose.Schema.Types.Mixed,
  
  // What provider returned
  rawResponse: mongoose.Schema.Types.Mixed,
  
  // Parsed costs (all in base currency, no markup)
  costs: {
    freight: { type: Number, default: 0 },
    fuel: { type: Number, default: 0 },
    screening: { type: Number, default: 0 },
    security: { type: Number, default: 0 },
    handling: { type: Number, default: 0 },
    documentation: { type: Number, default: 0 },
    airportTransfer: { type: Number, default: 0 },
    accessorials: { type: Number, default: 0 },
    other: { type: Number, default: 0 },
    totalCost: { type: Number, required: true },
    currency: { type: String, default: 'USD' }
  },
  
  // Service details
  service: String, // 'Ground', 'Air', 'Ocean'
  serviceType: String, // 'express', 'standard', 'economy'
  carrier: String, // Airline/carrier name
  carrierCode: String,
  
  // Transit info
  transitTime: String, // '1 day', '3-5 days'
  transitDays: Number,
  validUntil: Date,
  
  // Routing (for air)
  routing: {
    origin: String,
    destination: String,
    transhipments: [String]
  },
  
  // Performance
  responseTimeMs: Number,
  
  // UPDATED STATUS FIELD - THIS IS THE MAIN CHANGE
  status: {
    type: String,
    enum: [
      ShipmentLifecycle.QUOTE_REQUESTED,  // Maps to 'pending'
      ShipmentLifecycle.QUOTE_PROCESSING,  // Maps to 'processing'
      ShipmentLifecycle.QUOTE_READY,       // Maps to 'completed'
      ShipmentLifecycle.QUOTE_EXPIRED      // Maps to 'failed'
    ],
    default: ShipmentLifecycle.QUOTE_REQUESTED
  },
  error: String,
  retryCount: { type: Number, default: 0 },
  lastRetryAt: Date
  
}, {
  timestamps: true
});

// Indexes
costSchema.index({ requestId: 1, provider: 1 });
costSchema.index({ status: 1, createdAt: -1 });
costSchema.index({ providerRequestId: 1 });

module.exports = mongoose.model('Cost', costSchema);
