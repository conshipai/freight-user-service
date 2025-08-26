// src/models/Sequence.js
const mongoose = require('mongoose');

const sequenceSchema = new mongoose.Schema({
  type: { type: String, required: true },     // e.g., 'REQ', 'Q', 'COST'
  year: { type: Number, required: true },     
  counter: { type: Number, default: 10000 },  // start at 10000 (-> 10001 next)
}, {
  timestamps: true
});

// Compound index for uniqueness
sequenceSchema.index({ type: 1, year: 1 }, { unique: true });

module.exports = mongoose.model('Sequence', sequenceSchema);
