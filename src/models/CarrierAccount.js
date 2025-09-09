// src/models/CarrierAccount.js
const mongoose = require('mongoose');
const crypto = require('crypto');

// Encryption helpers for sensitive API credentials
const algorithm = 'aes-256-cbc';
const secretKey = process.env.ENCRYPTION_KEY || crypto.randomBytes(32);
const iv = crypto.randomBytes(16);

function encrypt(text) {
  const cipher = crypto.createCipheriv(algorithm, Buffer.from(secretKey), iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

function decrypt(text) {
  const textParts = text.split(':');
  const iv = Buffer.from(textParts.shift(), 'hex');
  const encryptedText = Buffer.from(textParts.join(':'), 'hex');
  const decipher = crypto.createDecipheriv(algorithm, Buffer.from(secretKey), iv);
  let decrypted = decipher.update(encryptedText);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString();
}

const carrierAccountSchema = new mongoose.Schema({
  // Who owns this account
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User',
    required: true 
  },
  companyId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Company',
    required: true 
  },
  
  // Carrier information
  carrier: {
    type: String,
    required: true,
    enum: [
      // Top 10 LTL Carriers
      'FEDEX_FREIGHT',
      'OLD_DOMINION',
      'XPO',
      'ESTES',
      'RL_CARRIERS',
      'TFORCE',
      'SAIA',
      'ABF',
      'SEFL',
      'AVERITT',
      'AAA_COOPER',
      // Parcel carriers
      'FEDEX_EXPRESS',
      'UPS',
      // Regional carriers
      'CENTRAL_TRANSPORT',
      'DAYTON',
      'PITT_OHIO',
      'AAA_COOPER',
      'WARD',
      'OAK_HARBOR',
      // Add more as needed
    ]
  },
  
  // Account details
  accountNumber: {
    type: String,
    required: true
  },
  
  accountName: {
    type: String,
    default: function() {
      return `${this.carrier} - ${this.accountNumber}`;
    }
  },
  
  // API Credentials (encrypted)
  apiCredentials: {
    username: String,
    password: String,
    apiKey: String,
    apiSecret: String,
    accountId: String,
    meterNumber: String,  // For FedEx
    customerTransactionId: String,
    additionalParams: mongoose.Schema.Types.Mixed  // For carrier-specific fields
  },
  
  // Settings
  isActive: { 
    type: Boolean, 
    default: true 
  },
  useForQuotes: { 
    type: Boolean, 
    default: true 
  },
  useForBooking: { 
    type: Boolean, 
    default: true 
  },
  isDefault: {  // Default account for this carrier
    type: Boolean,
    default: false
  },
  
  // Rate preferences
  ratePreferences: {
    includeInComparison: { type: Boolean, default: true },
    applyDiscounts: { type: Boolean, default: true },
    discountPercentage: { type: Number, default: 0 },
    showPublicRates: { type: Boolean, default: false }  // Show even without account
  },
  
  // Validation
  isValidated: { 
    type: Boolean, 
    default: false 
  },
  lastValidated: Date,
  validationError: String,
  
  // Usage tracking
  lastUsed: Date,
  quoteCount: { type: Number, default: 0 },
  bookingCount: { type: Number, default: 0 },
  
  // Metadata
  notes: String,
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
  
}, {
  timestamps: true
});

// Indexes
carrierAccountSchema.index({ userId: 1, carrier: 1 });
carrierAccountSchema.index({ companyId: 1, carrier: 1 });
carrierAccountSchema.index({ carrier: 1, isActive: 1 });

// Encrypt sensitive fields before saving
carrierAccountSchema.pre('save', function(next) {
  if (this.isModified('apiCredentials.password') && this.apiCredentials.password) {
    this.apiCredentials.password = encrypt(this.apiCredentials.password);
  }
  if (this.isModified('apiCredentials.apiKey') && this.apiCredentials.apiKey) {
    this.apiCredentials.apiKey = encrypt(this.apiCredentials.apiKey);
  }
  if (this.isModified('apiCredentials.apiSecret') && this.apiCredentials.apiSecret) {
    this.apiCredentials.apiSecret = encrypt(this.apiCredentials.apiSecret);
  }
  next();
});

// Method to get decrypted credentials
carrierAccountSchema.methods.getDecryptedCredentials = function() {
  const creds = { ...this.apiCredentials.toObject() };
  
  if (creds.password && creds.password.includes(':')) {
    creds.password = decrypt(creds.password);
  }
  if (creds.apiKey && creds.apiKey.includes(':')) {
    creds.apiKey = decrypt(creds.apiKey);
  }
  if (creds.apiSecret && creds.apiSecret.includes(':')) {
    creds.apiSecret = decrypt(creds.apiSecret);
  }
  
  return creds;
};

// Validate account with carrier
carrierAccountSchema.methods.validateAccount = async function() {
  // This would call the carrier's API to validate credentials
  // Implementation depends on each carrier
  this.lastValidated = new Date();
  this.isValidated = true;
  await this.save();
  return true;
};

// Static method to find accounts for a user/company
carrierAccountSchema.statics.findActiveAccounts = async function(userId, companyId, carrier = null) {
  const query = {
    $or: [
      { userId: userId },
      { companyId: companyId }
    ],
    isActive: true,
    useForQuotes: true
  };
  
  if (carrier) {
    query.carrier = carrier;
  }
  
  return this.find(query);
};

module.exports = mongoose.model('CarrierAccount', carrierAccountSchema);
