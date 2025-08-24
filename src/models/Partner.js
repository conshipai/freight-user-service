const mongoose = require('mongoose');

const partnerSchema = new mongoose.Schema({
  // Basic Information
  companyName: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  companyCode: {
    type: String,
    required: true,
    unique: true,
    uppercase: true, // e.g., 'DHL', 'KWE', 'CEVA'
    trim: true
  },
  country: {
    type: String,
    required: true
  },
  address: {
    street: String,
    city: String,
    state: String,
    postalCode: String,
    country: String
  },
  phone: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true,
    lowercase: true
  },
  taxVatNumber: String,
  
  // Status
  status: {
    type: String,
    enum: ['pending', 'approved', 'suspended', 'inactive'],
    default: 'pending'
  },
  
  // Markup Settings - Based on THIS partner's rates
  markupSettings: {
    air: {
      percentage: { type: Number, default: 25 }, // 25%
      minimumFee: { type: Number, default: 50 }  // $50 minimum
    },
    ocean: {
      percentage: { type: Number, default: 20 },
      minimumFee: { type: Number, default: 75 }
    },
    road: {
      percentage: { type: Number, default: 30 },
      minimumFee: { type: Number, default: 40 }
    }
  },
  
  // Additional Fees by Service Type
  additionalFees: [{
    name: String,        // e.g., "AWB Fee", "Documentation"
    amount: Number,      // e.g., 35
    serviceType: {
      type: String,
      enum: ['air', 'ocean', 'road', 'all']
    },
    feeType: {
      type: String,
      enum: ['fixed', 'percentage'],
      default: 'fixed'
    },
    active: { type: Boolean, default: true }
  }],
  
  // KYC/Compliance
  kycStatus: {
    type: String,
    enum: ['pending', 'verified', 'rejected'],
    default: 'pending'
  },
  kycDocuments: [{
    documentType: String, // 'business_license', 'tax_certificate', etc.
    fileName: String,
    uploadedAt: Date,
    verifiedAt: Date
  }],
  
  // Finance Information
  paymentTerms: {
    type: String,
    default: 'NET30'
  },
  currency: {
    type: String,
    default: 'USD'
  },
  bankDetails: {
    bankName: String,
    accountNumber: String,
    routingNumber: String,
    swiftCode: String,
    iban: String
  },
  
  // Operational Details
  operatingHours: {
    timezone: String,
    monday: { open: String, close: String },
    tuesday: { open: String, close: String },
    wednesday: { open: String, close: String },
    thursday: { open: String, close: String },
    friday: { open: String, close: String },
    saturday: { open: String, close: String },
    sunday: { open: String, close: String }
  },
  
  // Metadata
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  approvedAt: Date,
  invitedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  notes: String,
  
}, {
  timestamps: true
});

// Indexes for better query performance
partnerSchema.index({ companyCode: 1 });
partnerSchema.index({ country: 1 });
partnerSchema.index({ status: 1 });

module.exports = mongoose.model('Partner', partnerSchema);
