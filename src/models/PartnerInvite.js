const mongoose = require('mongoose');

const partnerInviteSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    lowercase: true
  },
  companyName: {
    type: String,
    required: true
  },
  country: {
    type: String,
    required: true
  },
  invitedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  token: {
    type: String,
    required: true,
    unique: true
  },
  tokenExpiry: {
    type: Date,
    required: true,
    default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
  },
  status: {
    type: String,
    enum: ['pending', 'completed', 'expired'],
    default: 'pending'
  },
  completedAt: Date,
  
  // Optional pre-filled data
  preFillData: {
    contactName: String,
    contactPhone: String,
    notes: String
  }
}, {
  timestamps: true
});

// Index for token lookup
partnerInviteSchema.index({ token: 1 });
partnerInviteSchema.index({ email: 1 });

module.exports = mongoose.model('PartnerInvite', partnerInviteSchema);
