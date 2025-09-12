// ============================================
// 3. src/models/Product.js
// ============================================
const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  productName: {
    type: String,
    required: true
  },
  productCode: String,
  nmfc: String,
  freightClass: {
    type: String,
    enum: ['50', '55', '60', '65', '70', '77.5', '85', '92.5', '100', '110', '125', '150', '175', '200', '250', '300', '400', '500']
  },
  defaultWeight: {
    type: Number,
    default: 0
  },
  defaultLength: {
    type: Number,
    default: 0
  },
  defaultWidth: {
    type: Number,
    default: 0
  },
  defaultHeight: {
    type: Number,
    default: 0
  },
  unitType: {
    type: String,
    enum: ['Pallets', 'Boxes', 'Crates', 'Bundles', 'Rolls', 'Bags', 'Drums', 'Totes'],
    default: 'Pallets'
  },
  hazmat: {
    type: Boolean,
    default: false
  },
  hazmatClass: String,
  hazmatUN: String,
  hazmatPackingGroup: String,
  category: String,
  description: String,
  notes: String,
  stackable: {
    type: Boolean,
    default: true
  },
  images: [{
    url: String,
    caption: String
  }],
  deleted: {
    type: Boolean,
    default: false
  },
  deletedAt: Date,
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Indexes
productSchema.index({ userId: 1, deleted: 1 });
productSchema.index({ productName: 'text', description: 'text' });
productSchema.index({ nmfc: 1 });
productSchema.index({ category: 1 });

module.exports = mongoose.model('Product', productSchema);
