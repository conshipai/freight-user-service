// src/models/Airport.js
const mongoose = require('mongoose');

const airportSchema = new mongoose.Schema({
  code: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true,
    minLength: 3,
    maxLength: 3
  },
  name: {
    type: String,
    required: true
  },
  city: {
    type: String,
    required: true
  },
  state: String,
  country: {
    type: String,
    required: true,
    uppercase: true,
    minLength: 2,
    maxLength: 2
  },
  type: {
    type: String,
    enum: ['domestic', 'international', 'both'],
    default: 'both'
  },
  latitude: Number,
  longitude: Number,
  timezone: String,
  active: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Indexes
airportSchema.index({ code: 1 });
airportSchema.index({ country: 1, city: 1 });
airportSchema.index({ type: 1 });

module.exports = mongoose.model('Airport', airportSchema);
