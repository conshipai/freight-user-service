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
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true,
  collection: 'zipcodeairports' // Explicitly use your collection name
});

// Static method to find the best airport (closest delivery zone)
zipCodeAirportSchema.statics.findBestAirport = async function(zipCode) {
  const airports = await this.find({ 
    zipCode: zipCode,
    isActive: true 
  }).sort({ deliveryZone: 1 }).limit(1); // A is better than B, B better than C
  
  return airports.length > 0 ? airports[0] : null;
};

const ZipCodeAirport = mongoose.model('ZipCodeAirport', zipCodeAirportSchema);

module.exports = ZipCodeAirport;
