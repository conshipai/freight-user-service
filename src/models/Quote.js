// src/models/Quote.js
const mongoose = require('mongoose');

const quoteSchema = new mongoose.Schema({
  quoteNumber: {
    type: String,
    required: true,
    unique: true
  },
  
  requestId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Request',
    required: true
  },
  
  costIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Cost'
  }],
  
  // Applied markup rules
  markupRules: [{
    provider: String,
    costId: mongoose.Schema.Types.ObjectId,
    
    // Base markup
    percentage: Number,
    minimumMarkup: Number,
    maximumMarkup: Number,
    flatFee: Number,
    
    // Calculated
    calculatedMarkup: Number,
    appliedMarkup: Number // After min/max constraints
  }],
  
  // Final rates with markup
  rates: [{
    provider: String,
    carrier: String,
    costId: mongoose.Schema.Types.ObjectId,
    
    // Original costs
    originalCost: Number,
    
    // Markup
    markupAmount: Number,
    markupPercentage: Number,
    
    // Additional fees
    additionalFees: [{
      name: String,
      code: String,
      amount: Number
    }],
    totalAdditionalFees: Number,
    
    // Final price
    sellPrice: Number,
    currency: { type: String, default: 'USD' },
    
    // Service details
    service: String,
    serviceType: String,
    transitTime: String,
    validUntil: Date,
    
    // Selection
    selected: { type: Boolean, default: false },
    selectedAt: Date,
    
    // Display order
    sortOrder: Number
  }],
  
  // Selected rate (after customer chooses)
  selectedRateId: mongoose.Schema.Types.ObjectId,
  
  // Status
  status: {
    type: String,
    enum: ['draft', 'pending', 'ready', 'sent', 'accepted', 'expired', 'booked'],
    default: 'draft'
  },
  
  // Validity
  validUntil: Date,
  
  // Customer interaction
  sentToCustomerAt: Date,
  viewedAt: Date,
  acceptedAt: Date,
  
  // Booking details (if booked)
  bookingId: mongoose.Schema.Types.ObjectId,
  
  // Notes
  internalNotes: String,
  customerNotes: String
  
}, {
  timestamps: true
});

// Generate quote number
quoteSchema.pre('save', async function(next) {
  if (!this.quoteNumber) {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const count = await this.constructor.countDocuments({
      createdAt: {
        $gte: new Date(year, date.getMonth(), 1),
        $lt: new Date(year, date.getMonth() + 1, 1)
      }
    });
    const sequence = String(count + 1).padStart(4, '0');
    this.quoteNumber = `Q-${year}${month}-${sequence}`;
  }
  next();
});

// Indexes
quoteSchema.index({ quoteNumber: 1 });
quoteSchema.index({ requestId: 1 });
quoteSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('Quote', quoteSchema);
