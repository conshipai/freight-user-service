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
  
  // NEW: Partner Type
  type: {
    type: String,
    enum: ['customer', 'foreign_partner'],
    required: true
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
  
  // NEW: API Markup Settings (replaces old markupSettings)
  apiMarkups: {
    pelicargo: { type: Number, default: 15 },
    freightForce: { type: Number, default: 18 },
    ecuLines: { type: Number, default: 20 }
  },
  
  // NEW: Mode-specific Charges
  modeCharges: {
    air: [{
      name: String,
      amount: Number
    }],
    ocean: [{
      name: String,
      amount: Number
    }],
    ground: [{
      name: String,
      amount: Number
    }]
  },
  
  // NEW: Modules the partner has access to
  modules: [{
    type: String,
    default: ['Pricing Portal']
  }],
  
  // Additional Fees (keeping this from original)
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
  notes: String,
  
}, {
  timestamps: true
});

// Indexes for better query performance
partnerSchema.index({ companyCode: 1 });
partnerSchema.index({ country: 1 });
partnerSchema.index({ status: 1 });
partnerSchema.index({ type: 1 }); // NEW index for partner type

module.exports = mongoose.model('Partner', partnerSchema);
