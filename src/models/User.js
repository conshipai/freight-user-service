// src/models/User.js
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  name: { type: String, required: true },

  role: {
    type: String,
    enum: [
      'system_admin',
      'conship_employee',    // ✅ internal role
      'conship_management',  // ✅ internal role
      'customer',            // ✅ partner role
      'foreign_partner'      // ✅ partner role
    ],
    required: true
  },

  // Link a partner user to its Partner record (used only for partner users)
  partnerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Partner',
    required: false
  },

  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: false
  },

  // If this is a sub-user, who created them
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },

  // Force password reset on first login (helpful for partner accounts)
  mustChangePassword: { type: Boolean, default: true },

  // Override company settings
  canSeeDirectCosts: { type: Boolean, default: false },

  active: { type: Boolean, default: true }
}, {
  timestamps: true
});

module.exports = mongoose.model('User', userSchema);
