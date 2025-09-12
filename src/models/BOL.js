// ============================================
// 4. src/models/BOL.js - UPDATED
// ============================================
const mongoose = require('mongoose');

const bolSchema = new mongoose.Schema({
  bookingId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Booking',
    required: true,
    index: true
  },
  requestId: {
    type: String,
    required: true,
    index: true
  },
  bolNumber: {
    type: String,
    required: true,
    unique: true
  },
  fileUrl: {
    type: String,
    required: true
  },
  fileKey: {
    type: String,
    required: true
  },
  documentType: {
    type: String,
    default: 'bol'
  },
  version: {
    type: Number,
    default: 1
  },
  status: {
    type: String,
    enum: ['draft', 'final', 'void', 'amended'],
    default: 'final'
  },
  metadata: {
    shipper: {
      name: String,
      address: String,
      city: String,
      state: String,
      zip: String,
      contact: String,
      phone: String
    },
    consignee: {
      name: String,
      address: String,
      city: String,
      state: String,
      zip: String,
      contact: String,
      phone: String
    },
    carrier: {
      name: String,
      proNumber: String,
      trailerNumber: String,
      sealNumber: String
    },
    commodities: [{
      quantity: Number,
      unitType: String,
      weight: Number,
      class: String,
      description: String,
      nmfc: String,
      hazmat: Boolean
    }],
    specialInstructions: String,
    termsConditions: String
  },
  signedBy: {
    shipper: {
      name: String,
      signedAt: Date,
      signature: String // Base64 or URL to signature image
    },
    carrier: {
      name: String,
      signedAt: Date,
      signature: String
    },
    consignee: {
      name: String,
      signedAt: Date,
      signature: String,
      notes: String
    }
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  lastModifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Indexes
bolSchema.index({ bookingId: 1 });
bolSchema.index({ requestId: 1 });
bolSchema.index({ bolNumber: 1 });
bolSchema.index({ status: 1 });

module.exports = mongoose.model('BOL', bolSchema);
