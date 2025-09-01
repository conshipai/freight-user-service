// src/models/BOL.js
const mongoose = require('mongoose');

const bolSchema = new mongoose.Schema({
  bolNumber: {
    type: String,
    unique: true,
    required: true
  },
  
  bookingId: {
    type: String,
    required: true
  },
  
  confirmationNumber: String,
  pickupNumber: String,
  carrier: String,
  
  // Parties
  shipper: {
    name: String,
    address: String,
    city: String,
    state: String,
    zip: String,
    phone: String,
    contact: String,
    email: String
  },
  
  consignee: {
    name: String,
    address: String,
    city: String,
    state: String,
    zip: String,
    phone: String,
    contact: String,
    email: String
  },
  
  thirdParty: {
    name: String,
    address: String,
    city: String,
    state: String,
    zip: String,
    phone: String
  },
  
  // Line items
  items: [{
    quantity: Number,
    unitType: String,
    description: String,
    weight: Number,
    class: String,
    nmfc: String,
    hazmat: Boolean
  }],
  
  // References
  poNumber: String,
  referenceNumbers: [String],
  specialInstructions: String,
  
  // Dates
  pickupDate: Date,
  deliveryDate: Date,
  
  // PDF Storage
  pdfUrl: String,
  pdfKey: String, // S3/storage key
  
  // Status
  status: {
    type: String,
    enum: ['draft', 'final', 'void'],
    default: 'draft'
  },
  
  createdBy: mongoose.Schema.Types.ObjectId

}, {
  timestamps: true
});

// Generate BOL number
bolSchema.pre('save', async function(next) {
  if (!this.bolNumber) {
    const count = await mongoose.model('BOL').countDocuments();
    this.bolNumber = `BOL-${Date.now()}-${String(count + 1).padStart(4, '0')}`;
  }
  next();
});

module.exports = mongoose.model('BOL', bolSchema);
