// src/models/ZipCodeAirport.js
const mongoose = require('mongoose');

const zipCodeAirportSchema = new mongoose.Schema({
  zipCode: {
    type: String,
    required: true,
    index: true
  },
  airportCode: {
    type: String,
    required: true,
    uppercase: true
  },
  city: String,
  state: String,
  deliveryZone: {
    type: String,
    uppercase: true,
    default: 'E'
  },
  distance: Number, // Optional: miles from ZIP to airport
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true,
  collection: 'zipcodeairports' // Explicitly set collection name
});

// Add index for faster lookups
zipCodeAirportSchema.index({ zipCode: 1, deliveryZone: 1 });

// Method to find the best airport for a ZIP (closest delivery zone)
zipCodeAirportSchema.statics.findBestAirport = async function(zipCode) {
  const airports = await this.find({ 
    zipCode: zipCode,
    isActive: true 
  }).sort({ deliveryZone: 1 }); // A comes before B, B before C, etc.
  
  return airports.length > 0 ? airports[0] : null;
};

module.exports = mongoose.model('ZipCodeAirport', zipCodeAirportSchema);
