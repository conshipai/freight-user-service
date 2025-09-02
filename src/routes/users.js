// /src/models/User.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const { Schema } = mongoose;

const ModuleGrantSchema = new Schema(
  {
    moduleId: { type: String, required: true },          // e.g. "quotes", "tracking"
    name: { type: String, required: true },              // human-friendly label
    permissions: [{ type: String, enum: ['read', 'write'] }],
    grantedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    grantedAt: { type: Date, default: Date.now }
  },
  { _id: false }
);

const UserSchema = new Schema(
  {
    // Basic Info
    email: { type: String, required: true, unique: true, index: true },
    password: { type: String, required: true, select: false },
    name: { type: String, required: true },

    // ✅ ADD THIS FIELD (account on/off switch)
    active: { type: Boolean, default: true },

    // Role within organization
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

    // Relationship fields
    partnerId: { type: Schema.Types.ObjectId, ref: 'Partner', default: null },
    parentAccountId: { type: Schema.Types.ObjectId, ref: 'User', default: null }, // creator/manager for *_user roles

    // Feature access (managed via routes)
    modules: { type: [ModuleGrantSchema], default: [] },

    // Optional metadata
    phone: { type: String },
    lastLoginAt: { type: Date }
  },
  { timestamps: true }
);

// Hash password when created/changed
UserSchema.pre('save', async function (next) {
  try {
    if (!this.isModified('password')) return next();
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    return next();
  } catch (err) {
    return next(err);
  }
});

// Convenience method for auth flows
UserSchema.methods.comparePassword = async function (candidate) {
  // password may be deselected in queries elsewhere; ensure it's present if you need to compare
  if (!this.password) return false;
  return bcrypt.compare(candidate, this.password);
};

// Clean JSON output (hide password & __v)
UserSchema.set('toJSON', {
  transform: function (doc, ret) {
    delete ret.password;
    delete ret.__v;
    return ret;
  }
});

// Also hide password on toObject by default
UserSchema.set('toObject', {
  transform: function (doc, ret) {
    delete ret.password;
    delete ret.__v;
    return ret;
  }
});

module.exports = mongoose.models.User || mongoose.model('User', UserSchema);
