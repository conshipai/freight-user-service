// src/models/GroundCost.js
const mongoose = require('mongoose');
const { ShipmentLifecycle } = require('../constants/shipmentLifecycle'); // ADD THIS LINE

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
    
    // Totals
    totalAccessorials: Number,
    discount: Number,
    discountPercentage: Number,
    totalCost: { type: Number, required: true }, // Final raw cost
    currency: { type: String, default: 'USD' }
  },

  // NEW: Carrier submission tracking
  submissionSource: {
    type: String,
    enum: ['api', 'magic_link', 'manual_entry', 'phone'],
    default: 'api'
  },
  
  submittedBy: {
    carrierId: String,
    carrierName: String,
    carrierEmail: String,
    magicToken: String,     // Link back to invitation
    employeeId: mongoose.Schema.Types.ObjectId, // If manual entry
    employeeName: String
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

  // NEW: FTL/Expedited specific fields
  carrierQuoteDetails: {
    // Pricing breakdown (all optional - carrier can enter just total)
    linehaul: Number,
    fuelSurcharge: Number,
    fuelPercentage: Number,
    
    // Individual accessorials
    detention: Number,
    layover: Number,
    tarp: Number,
    teamDriver: Number,
    
    // Or just lump sum
    totalAccessorials: Number,
    
    // Free time
    freeTimeLoadingHours: { type: Number, default: 2 },
    freeTimeUnloadingHours: { type: Number, default: 2 },
    detentionRatePerHour: Number,
    
    // Equipment confirmation
    equipmentType: String,
    equipmentNotes: String,
    
    // Other
    specialConditions: String,
    internalNotes: String  // Not shown to customer
  },
  
  // UPDATED STATUS FIELD - THIS IS THE MAIN CHANGE
  status: {
    type: String,
    enum: [
      ShipmentLifecycle.QUOTE_REQUESTED,  // Maps to 'pending'
      ShipmentLifecycle.QUOTE_READY,       // Maps to 'completed'
      ShipmentLifecycle.QUOTE_EXPIRED      // Maps to 'error' and 'expired'
    ],
    default: ShipmentLifecycle.QUOTE_REQUESTED
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
  return this.status === ShipmentLifecycle.QUOTE_READY; // UPDATED TO USE CONSTANT
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
