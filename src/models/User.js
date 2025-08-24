// src/models/User.js
const mongoose = require('mongoose');  // THIS WAS MISSING!

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  name: { type: String, required: true },
  
  role: {
    type: String,
    enum: ['system_admin', 'company_admin', 'company_user'],
    required: true
  },
  
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company'
  },
  
  // If this is a sub-user, who created them
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  
  // Override company settings
  canSeeDirectCosts: { type: Boolean, default: false },
  
  active: { type: Boolean, default: true }
}, {
  timestamps: true
});

module.exports = mongoose.model('User', userSchema);
