// src/models/ZipCodeAirport.js
const mongoose = require('mongoose');

const zipCodeAirportSchema = new mongoose.Schema({
  zipCode: {
    type: String,
    required: true,
    trim: true,
    minLength: 5,
    maxLength: 5,
    index: true
  },
  airportCode: {
    type: String,
    required: true,
    uppercase: true,
    trim: true,
    minLength: 3,
    maxLength: 3
  },
  city: {
    type: String,
    required: true
  },
  state: {
    type: String,
    required: true,
    uppercase: true,
    minLength: 2,
    maxLength: 2
  },
  distance: {
    type: Number,  // Distance in miles from ZIP to airport
    default: 0
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Create compound index for unique ZIP-Airport combinations
zipCodeAirportSchema.index({ zipCode: 1, airportCode: 1 }, { unique: true });
zipCodeAirportSchema.index({ airportCode: 1 });
zipCodeAirportSchema.index({ state: 1 });

module.exports = mongoose.model('ZipCodeAirport', zipCodeAirportSchema);
