// /src/models/User.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const { Schema } = mongoose;

const ModuleGrantSchema = new Schema(
  {
    moduleId: { type: String, required: true },
    name: { type: String, required: true },
    permissions: [{ type: String, enum: ['read', 'write'] }],
    grantedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    grantedAt: { type: Date, default: Date.now }
  },
  { _id: false }
);

const UserSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, index: true },
    password: { type: String, required: true, select: false },
    name: { type: String, required: true },

    // account on/off
    active: { type: Boolean, default: true },

    role: {
      type: String,
      enum: [
        'system_admin',
        'conship_employee',
        'partner_admin',
        'partner_user',
        'vendor_admin',
        'vendor_user'
      ],
      required: true
    },

    partnerId: { type: Schema.Types.ObjectId, ref: 'Partner', default: null },
    parentAccountId: { type: Schema.Types.ObjectId, ref: 'User', default: null },

    modules: { type: [ModuleGrantSchema], default: [] },

    // explicit feature flags
    permissions: {
      createQuotes:   { type: Boolean, default: true  },
      viewAllQuotes:  { type: Boolean, default: false },
      editPricing:    { type: Boolean, default: false },
      manageUsers:    { type: Boolean, default: false },
      viewTrueCosts:  { type: Boolean, default: false },
      managePartners: { type: Boolean, default: false },
      accessReports:  { type: Boolean, default: false },
      manageRates:    { type: Boolean, default: false }
    },

    phone: { type: String },
    passwordManagerRole: {  // ADD THIS NEW FIELD
      type: String,
      enum: ['admin', 'manager', 'user'],
      default: 'user'
    },
    
    lastLoginAt: { type: Date }
  },
  { timestamps: true }
);

UserSchema.pre('save', async function (next) {
  try {
    if (!this.isModified('password')) return next();
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (err) {
    next(err);
  }
});

UserSchema.methods.comparePassword = async function (candidate) {
  if (!this.password) return false;
  return bcrypt.compare(candidate, this.password);
};

UserSchema.set('toJSON', {
  transform: (_, ret) => { delete ret.password; delete ret.__v; return ret; }
});
UserSchema.set('toObject', {
  transform: (_, ret) => { delete ret.password; delete ret.__v; return ret; }
});

const MODEL_NAME = 'User';

// ✅ Overwrite-safe export: never re-compile if it exists
let User;
try {
  User = mongoose.model(MODEL_NAME);
} catch (_err) {
  User = mongoose.model(MODEL_NAME, UserSchema);
}
module.exports = User;
