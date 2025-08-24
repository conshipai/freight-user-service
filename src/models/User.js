const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true
  },
  password: {
    type: String,
    required: true
  },
  name: {
    type: String,
    required: true
  },
  role: {
    type: String,
    enum: [
      'system_admin',
      'conship_employee',
      'customer',
      'customer_user',
      'foreign_partner',
      'foreign_partner_user'
    ],
    required: true
  },
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: false
  },
  parentAccountId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  modules: [{
    moduleId: String,
    name: String,
    permissions: [String],
    grantedBy: mongoose.Schema.Types.ObjectId,
    grantedAt: {
      type: Date,
      default: Date.now
    }
  }],

  // --- NEW: markup profile reference + direct-costs override ---
  markupProfileId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'MarkupProfile'
  },
  alwaysShowDirectCosts: {
    type: Boolean,
    default: false
  },
  // ------------------------------------------------------------

  active: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Helpful indexes
userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ companyId: 1 });
userSchema.index({ role: 1 });

module.exports = mongoose.model('User', userSchema);
