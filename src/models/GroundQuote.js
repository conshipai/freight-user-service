// src/models/GroundQuote.js
const mongoose = require('mongoose');

const groundQuoteSchema = new mongoose.Schema({
  // Link to request and cost
  requestId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'GroundRequest',
    required: true
  },
  costId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'GroundCost',
    required: true
  },
  requestNumber: String,
  quoteNumber: {
    type: String,
    unique: true,
  },
  
  // User/Company Information
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company'
  },
  
  // Carrier Information (copied from cost)
  carrier: {
    name: String,
    code: String,
    service: String,
    logo: String
  },
  
  // Raw Cost (from GroundCost)
  rawCost: {
    baseFreight: Number,
    fuelSurcharge: Number,
    accessorials: Number,
    total: { type: Number, required: true }
  },
  
  // Markup Applied
  markup: {
    type: { 
      type: String, 
      enum: ['percentage', 'flat', 'tiered', 'custom'],
      default: 'percentage'
    },
    percentage: Number, // e.g., 18 for 18%
    flatAmount: Number, // Fixed dollar amount
    
    // Tiered markup based on cost ranges
    tiered: [{
      min: Number,
      max: Number,
      percentage: Number,
      flat: Number
    }],
    
    // Breakdown
    calculation: {
      baseMarkup: Number,
      fuelMarkup: Number,
      accessorialMarkup: Number,
      minimumCharge: Number, // If there's a minimum
      adjustments: Number // Manual adjustments
    },
    
    totalMarkup: { type: Number, required: true }
  },
  
  // Additional Fees (company-specific)
  additionalFees: [{
    name: String,
    code: String,
    amount: Number,
    type: { type: String, enum: ['flat', 'percentage'] }
  }],
  totalFees: Number,
  
  // Final Customer Price
  customerPrice: {
    subtotal: Number, // Raw cost + markup
    fees: Number, // Additional fees
    tax: Number, // If applicable
    total: { type: Number, required: true }, // Final price to customer
    currency: { type: String, default: 'USD' }
  },
  
  // Transit Information (from cost)
  transit: {
    days: Number,
    businessDays: Number,
    estimatedPickup: Date,
    estimatedDelivery: Date,
    guaranteed: Boolean,
    guaranteedBy: String
  },
  
  // Quote Status
  status: {
    type: String,
    enum: ['draft', 'active', 'selected', 'booked', 'expired', 'declined'],
    default: 'active'
  },
  
  // Selection/Booking
  selected: {
    isSelected: { type: Boolean, default: false },
    selectedAt: Date,
    selectedBy: mongoose.Schema.Types.ObjectId
  },
  
  booked: {
    isBooked: { type: Boolean, default: false },
    bookedAt: Date,
    bookingId: mongoose.Schema.Types.ObjectId,
    confirmationNumber: String
  },
  
  // Validity
  validFrom: { type: Date, default: Date.now },
  validUntil: Date,
  
  // Ranking (for display order)
  ranking: {
    position: Number, // 1 = best option
    score: Number,
    recommended: { type: Boolean, default: false },
    badges: [String] // ['Fastest', 'Best Value', 'Cheapest', 'Most Reliable']
  },
  
  // Notes
  internalNotes: String, // Not shown to customer
  customerNotes: String, // Shown to customer
  
  // Metadata
  createdBy: String,
  approvedBy: mongoose.Schema.Types.ObjectId,
  approvedAt: Date

}, {
  timestamps: true,
  collection: 'ground_quotes'
});

// Generate quote number
groundQuoteSchema.pre('save', async function(next) {
  if (!this.quoteNumber) {
    const year = new Date().getFullYear();
    const count = await mongoose.model('GroundQuote').countDocuments();
    const number = String(count + 1).padStart(6, '0');
    this.quoteNumber = `GQ-${year}-${number}`;
  }
  next();
});

// Index for fast lookups
groundQuoteSchema.index({ requestId: 1, status: 1 });
groundQuoteSchema.index({ requestNumber: 1 });
groundQuoteSchema.index({ userId: 1, status: 1 });
groundQuoteSchema.index({ quoteNumber: 1 });
groundQuoteSchema.index({ 'selected.isSelected': 1 });
groundQuoteSchema.index({ validUntil: 1 });

// Method to check if quote is still valid
groundQuoteSchema.methods.isValid = function() {
  if (this.status !== 'active') return false;
  if (this.validUntil && new Date() > this.validUntil) {
    this.status = 'expired';
    return false;
  }
  return true;
};

// Method to select this quote
groundQuoteSchema.methods.select = async function(userId) {
  // Deselect other quotes for this request
  await mongoose.model('GroundQuote').updateMany(
    { requestId: this.requestId, _id: { $ne: this._id } },
    { 
      'selected.isSelected': false,
      status: 'declined' 
    }
  );
  
  // Select this quote
  this.selected = {
    isSelected: true,
    selectedAt: new Date(),
    selectedBy: userId
  };
  this.status = 'selected';
  await this.save();
  
  return this;
};

// Method to calculate final price with specific options
groundQuoteSchema.methods.calculatePrice = function(options = {}) {
  let total = this.rawCost.total + this.markup.totalMarkup;
  
  // Add any additional fees
  if (this.additionalFees && this.additionalFees.length > 0) {
    this.additionalFees.forEach(fee => {
      if (fee.type === 'percentage') {
        total += (total * fee.amount / 100);
      } else {
        total += fee.amount;
      }
    });
  }
  
  // Add tax if applicable
  if (options.taxRate) {
    total += (total * options.taxRate / 100);
  }
  
  return Math.round(total * 100) / 100; // Round to 2 decimals
};

module.exports = mongoose.model('GroundQuote', groundQuoteSchema);
