const mongoose = require('mongoose');

const groundRequestSchema = new mongoose.Schema({
  requestNumber: {
    type: String,
    unique: true,
    required: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  serviceType: {
    type: String,
    enum: ['ltl', 'ftl', 'expedited'],
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'processing', 'quoted', 'failed'],
    default: 'processing'
  },
  formData: {
    type: Object,
    required: true
  },
  error: String
}, {
  timestamps: true,
  collection: 'ground_requests'
});

// Generate request number
groundRequestSchema.pre('save', async function(next) {
  if (!this.requestNumber) {
    const year = new Date().getFullYear();
    const month = String(new Date().getMonth() + 1).padStart(2, '0');
    const count = await mongoose.model('GroundRequest').countDocuments() + 1;
    const number = String(count).padStart(4, '0');
    this.requestNumber = `REQ-${year}${month}-${number}`;
  }
  next();
});

module.exports = mongoose.model('GroundRequest', groundRequestSchema);
