// src/models/GroundRequest.js - SIMPLE
const mongoose = require('mongoose');

const groundRequestSchema = new mongoose.Schema({
  requestNumber: String,  // Not required, generated automatically
  userId: mongoose.Schema.Types.ObjectId,
  serviceType: String,
  status: {
    type: String,
    default: 'processing'
  },
  formData: Object,
  error: String
}, {
  timestamps: true
});

// Auto-generate requestNumber
groundRequestSchema.pre('save', async function(next) {
  if (!this.requestNumber) {
    this.requestNumber = `REQ-${Date.now()}`;
  }
  next();
});

module.exports = mongoose.model('GroundRequest', groundRequestSchema);
