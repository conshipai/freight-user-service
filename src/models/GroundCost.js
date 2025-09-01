// src/models/GroundCost.js
const mongoose = require('mongoose');

const groundCostSchema = new mongoose.Schema({
  // Link to the request
  requestId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'GroundRequest',
    required: true
  },
  requestNumber: String,
  
  // Carrier/Provider Information
  provider: {
    type: String,
    required: true // 'FreightForce', 'STG', 'SEFL', 'YRC', 'FedEx', 'UPS', etc.
  },
  carrierName: String, // Actual carrier name
  carrierCode: String, // SCAC code if available
  
  // Service Details
  service: {
    type: String, // 'Standard LTL', 'Priority', 'Guaranteed', etc.
  },
  serviceType: {
    type: String,
    enum: ['ltl', 'ftl', 'expedited']
  },
  
  // Raw Cost Breakdown (all in USD)
  costs: {
    baseFreight: { type: Number, required: true },
    fuelSurcharge: Number,
    fuelPercentage: Number, // Fuel as percentage of base
    
    // Accessorial charges simplified to a number
    accessorials: { type: Number, default: 0 },

    /* Old detailed accessorials object (deprecated):
    accessorials: {
      liftgatePickup: Number,
      liftgateDelivery: Number,
      residentialPickup: Number,
      residentialDelivery: Number,
      insidePickup: Number,
      insideDelivery: Number,
      limitedAccessPickup: Number,
      limitedAccessDelivery: Number,
      appointmentFee: Number,
      notificationFee: Number,
      protectFromFreeze: Number,
      other: [{
        name: String,
        amount: Number
      }]
    },
    */
    
    // Totals
    totalAccessorials: Number,
    discount: Number,
    discountPercentage: Number,
    totalCost: { type: Number, required: true }, // Final raw cost
    currency: { type: String, default: 'USD' }
  },
  
  // Transit Information
  transit: {
    days: Number,
    businessDays: Number,
    estimatedPickup: Date,
    estimatedDelivery: Date,
    guaranteed: { type: Boolean, default: false },
    guaranteedBy: String // Time if guaranteed (e.g., "5:00 PM")
  },
  
  // API Response Data
  apiResponse: {
    quoteId: String, // Carrier's quote ID
    pickupNumber: String, // If provided immediately
    proNumber: String, // If assigned
    bolNumber: String, // If generated
    trackingUrl: String,
    validUntil: Date,
    responseTimeMs: Number, // How long API took
    rawResponse: mongoose.Schema.Types.Mixed // Store full response for debugging
  },
  
  // Equipment (for FTL/Expedited)
  equipment: {
    type: String, // '53_van', 'flatbed', etc.
    quantity: Number,
    requirements: [String] // ['air_ride', 'team_drivers', 'pads', 'straps']
  },
  
  // Status
  status: {
    type: String,
    enum: ['pending', 'completed', 'error', 'expired'],
    default: 'pending'
  },
  error: String,
  
  // Ranking/Scoring (for sorting results)
  ranking: {
    score: Number, // Overall score for this quote
    factors: {
      price: Number,
      transit: Number,
      reliability: Number,
      service: Number
    }
  },
  
  // Metadata
  createdBy: String, // Which API/service created this
  expiresAt: Date

}, {
  timestamps: true,
  collection: 'ground_costs'
});

// Index for fast lookups
groundCostSchema.index({ requestId: 1, provider: 1 });
groundCostSchema.index({ requestNumber: 1 });
groundCostSchema.index({ status: 1 });
groundCostSchema.index({ expiresAt: 1 });

// Method to check if cost is still valid
groundCostSchema.methods.isValid = function() {
  if (this.expiresAt && new Date() > this.expiresAt) {
    return false;
  }
  return this.status === 'completed';
};

// Method to calculate total including simplified accessorials
groundCostSchema.methods.calculateTotal = function() {
  let total = this.costs.baseFreight + (this.costs.fuelSurcharge || 0) + (this.costs.accessorials || 0);
  
  // Apply discount if any
  if (this.costs.discount) {
    total -= this.costs.discount;
  }
  
  return total;
};

module.exports = mongoose.model('GroundCost', groundCostSchema);
