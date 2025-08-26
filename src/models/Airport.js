// src/models/Airport.js
const mongoose = require('mongoose');

// We won't use a schema since we're directly querying existing collections
class AirportModel {
  static async findOne(query) {
    const db = mongoose.connection.db;
    
    // Determine which collection to query
    if (query.country === 'US' || query.type === 'domestic') {
      return await db.collection('us_gateways').findOne(query);
    } else if (query.country && query.country !== 'US' || query.type === 'foreign') {
      return await db.collection('foreign_gateways').findOne(query);
    }
    
    // Try both collections
    let result = await db.collection('us_gateways').findOne(query);
    if (!result) {
      result = await db.collection('foreign_gateways').findOne(query);
    }
    return result;
  }
  
  static async find(query, options = {}) {
    const db = mongoose.connection.db;
    let cursor;
    
    if (query.country === 'US' || query.type === 'domestic') {
      cursor = db.collection('us_gateways').find(query);
    } else if ((query.country && query.country.$ne === 'US') || query.type === 'foreign') {
      cursor = db.collection('foreign_gateways').find(query);
    } else {
      // Query both collections
      const [domestic, foreign] = await Promise.all([
        db.collection('us_gateways').find(query).toArray(),
        db.collection('foreign_gateways').find(query).toArray()
      ]);
      return [...domestic, ...foreign];
    }
    
    // Apply options
    if (options.limit) cursor = cursor.limit(options.limit);
    if (options.sort) cursor = cursor.sort(options.sort);
    if (options.select) {
      const projection = {};
      options.select.split(' ').forEach(field => {
        if (field.startsWith('-')) {
          projection[field.substring(1)] = 0;
        } else {
          projection[field] = 1;
        }
      });
      cursor = cursor.project(projection);
    }
    
    return await cursor.toArray();
  }
}

module.exports = AirportModel;
