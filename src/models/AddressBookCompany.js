// ============================================
// 1. src/models/AddressBookCompany.js
// ============================================
const mongoose = require('mongoose');

const addressBookCompanySchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  types: [{
    type: String,
    enum: ['shipper', 'consignee', 'third_party', 'broker']
  }],
  name: {
    type: String,
    required: true
  },
  address: String,
  address2: String,
  city: String,
  state: String,
  zip: String,
  country: {
    type: String,
    default: 'USA'
  },
  phone: String,
  fax: String,
  contact: String,
  email: String,
  notes: String,
  isDefault: {
    type: Boolean,
    default: false
  },
  taxId: String,
  accountNumber: String,
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
addressBookCompanySchema.index({ userId: 1, deleted: 1 });
addressBookCompanySchema.index({ userId: 1, isDefault: 1 });
addressBookCompanySchema.index({ name: 'text', contact: 'text' });

module.exports = mongoose.model('AddressBookCompany', addressBookCompanySchema);
