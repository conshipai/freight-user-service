const PartnerSchema = new Schema({
  // Company Information
  companyName: { type: String, required: true },
  companyCode: { type: String, unique: true, maxLength: 4 },
  
  // Partner Type (determines access and features)
  partnerType: {
    type: String,
    enum: [
      'system',           // Conship itself
      'foreign_partner',  // Foreign Business Partners (resellers)
      'customer',         // Direct Business Partners/Customers
      'vendor'           // Vendors/Carriers (future)
    ],
    required: true
  },
  
  // Contact Info
  email: String,
  phone: String,
  country: String,
  
  // Status
  status: {
    type: String,
    enum: ['active', 'inactive', 'suspended'],
    default: 'active'
  },
  
  // Pricing Configuration (not applicable to vendors)
  pricingConfig: {
    showTrueCost: { type: Boolean, default: false },
    defaultMarkups: {
      ground: Number,
      air: Number,
      ocean: Number
    },
    vendorOverrides: {
      type: Map,
      of: Number
    },
    additionalCharges: {
      ground: [/* ... */],
      air: [/* ... */],
      ocean: [/* ... */]
    }
  },
  
  // User Management
  userLimit: { type: Number, default: 5 }, // Max sub-users
  primaryContactId: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  
  // Feature Access
  features: {
    quoting: { type: Boolean, default: true },
    booking: { type: Boolean, default: false },
    tracking: { type: Boolean, default: true },
    reporting: { type: Boolean, default: false },
    rateManagement: { type: Boolean, default: false }, // For vendors
    invoicing: { type: Boolean, default: false }
  },
  
  // Relationships
  parentPartnerId: {  // For sub-partners or franchises
    type: Schema.Types.ObjectId,
    ref: 'Partner'
  },
  
  // Metadata
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  }
});
