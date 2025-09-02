const mongoose = require('mongoose');
const { Schema } = mongoose;

const UserSchema = new Schema({
  // Basic Info
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  name: { type: String, required: true },
  
  // User Role (within their organization)
  role: {
    type: String,
    enum: [
      'system_admin',      // Conship super admin
      'conship_employee',  // Conship staff
      'partner_admin',     // Main account holder for partner
      'partner_user',      // Sub-user under partner
      'vendor_admin',      // Main account for vendor
      'vendor_user'        // Sub-user under vendor
    ],
    required: true
  },
  
  // Relationship to Partner
  partnerId: {
    type: Schema.Types.ObjectId,
    ref: 'Partner',
    required: function() {
      return !['system_admin'].includes(this.role);
    }
  },
  
  // Permissions (override defaults based on role)
  permissions: {
    createQuotes: { type: Boolean, default: true },
    viewAllQuotes: { type: Boolean, default: false },
    editPricing: { type: Boolean, default: false },
    manageUsers: { type: Boolean, default: false },
    viewTrueCosts: { type: Boolean, default: false },
    managePartners: { type: Boolean, default: false },
    accessReports: { type: Boolean, default: false },
    manageRates: { type: Boolean, default: false } // For vendors
  },
  
  // User Status
  status: {
    type: String,
    enum: ['active', 'inactive', 'suspended', 'pending'],
    default: 'active'
  },
  
  // Contact Info
  phone: String,
  timezone: String,
  language: { type: String, default: 'en' },
  
  // Activity Tracking
  lastLoginAt: Date,
  loginCount: { type: Number, default: 0 },
  
  // Metadata
  createdAt: { type: Date, default: Date.now },
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  invitedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  }
});
module.exports = mongoose.model('User', UserSchema);
