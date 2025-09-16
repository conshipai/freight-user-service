// src/models/QuoteCache.js
const mongoose = require('mongoose');

const quoteCacheSchema = new mongoose.Schema({
  // The key that was used in localStorage
  cacheKey: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  
  // The type of data being cached
  cacheType: {
    type: String,
    enum: ['formdata', 'complete', 'ground_quotes', 'booking'],
    required: true
  },
  
  // The actual data (flexible - can store any JSON)
  data: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  
  // Who owns this cache entry
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false // Some quotes might be anonymous
  },
  
  // Auto-expire after 7 days (adjust as needed)
  expiresAt: {
    type: Date,
    default: Date.now,
    expires: 604800 // 7 days in seconds
  }
}, {
  timestamps: true
});

// Index for fast lookups
quoteCacheSchema.index({ cacheKey: 1 });
quoteCacheSchema.index({ userId: 1 });

module.exports = mongoose.model('QuoteCache', quoteCacheSchema);
