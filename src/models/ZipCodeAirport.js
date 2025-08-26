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
    default: null  // Some may not have zones
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true,
  collection: 'zipcodeairports' // Explicitly use your collection name
});

// Static method to find the best airport (closest delivery zone to 'A')
zipCodeAirportSchema.statics.findBestAirport = async function(zipCode) {
  const airports = await this.find({ 
    zipCode: zipCode,
    isActive: true 
  });
  
  if (airports.length === 0) return null;
  if (airports.length === 1) return airports[0];
  
  // Sort airports to find best one:
  // 1. Those with delivery zones come first (A, B, C, etc.)
  // 2. Within those with zones, sort alphabetically (A is best)
  // 3. Those without zones come last
  airports.sort((a, b) => {
    // Both have zones - sort alphabetically
    if (a.deliveryZone && b.deliveryZone) {
      return a.deliveryZone.localeCompare(b.deliveryZone);
    }
    // Only a has zone - a comes first
    if (a.deliveryZone && !b.deliveryZone) return -1;
    // Only b has zone - b comes first
    if (!a.deliveryZone && b.deliveryZone) return 1;
    // Neither has zone - keep original order
    return 0;
  });
  
  return airports[0];
};

const ZipCodeAirport = mongoose.model('ZipCodeAirport', zipCodeAirportSchema);

module.exports = ZipCodeAirport;
