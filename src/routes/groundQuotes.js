// src/models/GroundRequest.js
const mongoose = require('mongoose');

const groundRequestSchema = new mongoose.Schema({
  // User information
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  userEmail: {
    type: String,
    required: true
  },
  company: {
    type: String,
    required: true
  },
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company'
  },
  
  // Request metadata
  requestNumber: {
    type: String,
    unique: true,
    required: true
  },
  serviceType: {
    type: String,
    enum: ['ltl', 'ftl', 'partial'],
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed'],
    default: 'pending'
  },
  
  // ✅ ADD THIS: Store original form data for UI navigation and history
  formData: {
    type: mongoose.Schema.Types.Mixed,
    required: false // Optional to maintain backward compatibility
  },
  
  // Origin information
  origin: {
    zipCode: {
      type: String,
      required: true
    },
    city: String,
    state: String,
    country: {
      type: String,
      default: 'US'
    }
  },
  
  // Destination information
  destination: {
    zipCode: {
      type: String,
      required: true
    },
    city: String,
    state: String,
    country: {
      type: String,
      default: 'US'
    }
  },
  
  // Pickup date
  pickupDate: {
    type: Date,
    required: true
  },
  
  // LTL specific details
  ltlDetails: {
    commodities: [{
      unitType: {
        type: String,
        enum: ['pallet', 'crate', 'box', 'bundle', 'roll', 'other']
      },
      quantity: Number,
      weight: Number,
      length: Number,
      width: Number,
      height: Number,
      description: String,
      freightClass: String,
      stackable: {
        type: Boolean,
        default: true
      }
    }]
  },
  
  // FTL specific details
  ftlDetails: {
    equipmentType: String,
    weight: Number,
    specialRequirements: [String]
  },
  
  // Accessorial services
  accessorials: {
    liftgatePickup: {
      type: Boolean,
      default: false
    },
    liftgateDelivery: {
      type: Boolean,
      default: false
    },
    residentialPickup: {
      type: Boolean,
      default: false
    },
    residentialDelivery: {
      type: Boolean,
      default: false
    },
    insidePickup: {
      type: Boolean,
      default: false
    },
    insideDelivery: {
      type: Boolean,
      default: false
    },
    limitedAccessPickup: {
      type: Boolean,
      default: false
    },
    limitedAccessDelivery: {
      type: Boolean,
      default: false
    },
    appointmentRequired: {
      type: Boolean,
      default: false
    },
    notifyBeforeDelivery: {
      type: Boolean,
      default: false
    }
  },
  
  // Error tracking
  errors: [{
    carrier: String,
    message: String,
    timestamp: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Indexes for performance
groundRequestSchema.index({ userId: 1, createdAt: -1 });
groundRequestSchema.index({ requestNumber: 1 });
groundRequestSchema.index({ status: 1 });
groundRequestSchema.index({ companyId: 1, createdAt: -1 });

// Auto-generate request number if not provided
groundRequestSchema.pre('save', async function(next) {
  if (!this.requestNumber) {
    const count = await this.constructor.countDocuments();
    this.requestNumber = `GRQ${Date.now()}${count + 1}`;
  }
  next();
});

// Update the updatedAt timestamp on save
groundRequestSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('GroundRequest', groundRequestSchema);
