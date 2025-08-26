// src/models/Airport.js
const mongoose = require('mongoose');

const airportSchema = new mongoose.Schema({
  code: {
    type: String,
    required: true,
    uppercase: true,
    unique: true,
    index: true
  },
  name: {
    type: String,
    required: true
  },
  city: String,
  state: String, // For US airports
  country: {
    type: String,
    required: true
  },
  region: String,
  type: {
    type: String,
    enum: ['domestic', 'foreign'],
    required: true
  },
  coordinates: {
    lat: Number,
    lng: Number
  },
  services: {
    pelicargo: Boolean,
    freightForce: Boolean,
    ocean: Boolean
  },
  gatewayFor: [String],
  active: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Determine which collection to use based on type
airportSchema.statics.findDomestic = function(query = {}) {
  return mongoose.connection.db.collection('us_gateways').find({
    ...query,
    type: 'domestic'
  }).toArray();
};

airportSchema.statics.findForeign = function(query = {}) {
  return mongoose.connection.db.collection('foreign_gateways').find({
    ...query,
    type: 'foreign'
  }).toArray();
};

// Override the default findOne to check both collections
airportSchema.statics.findOne = async function(query) {
  // First check if it's explicitly looking for US or foreign
  if (query.country === 'US') {
    const result = await mongoose.connection.db.collection('us_gateways').findOne(query);
    return result;
  } else if (query.country && query.country !== 'US') {
    const result = await mongoose.connection.db.collection('foreign_gateways').findOne(query);
    return result;
  }
  
  // Otherwise check both collections
  let result = await mongoose.connection.db.collection('us_gateways').findOne(query);
  if (!result) {
    result = await mongoose.connection.db.collection('foreign_gateways').findOne(query);
  }
  return result;
};

// Override find to check both collections
airportSchema.statics.find = async function(query) {
  const conditions = { ...query };
  
  // If looking for US airports
  if (conditions.country === 'US') {
    return mongoose.connection.db.collection('us_gateways').find(conditions).toArray();
  }
  
  // If looking for non-US airports
  if (conditions.country && conditions.country.$ne === 'US') {
    return mongoose.connection.db.collection('foreign_gateways').find(conditions).toArray();
  }
  
  // Otherwise get from both collections
  const [domestic, foreign] = await Promise.all([
    mongoose.connection.db.collection('us_gateways').find(conditions).toArray(),
    mongoose.connection.db.collection('foreign_gateways').find(conditions).toArray()
  ]);
  
  return [...domestic, ...foreign];
};

module.exports = mongoose.model('Airport', airportSchema);
