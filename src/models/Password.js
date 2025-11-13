// src/models/Password.js
const mongoose = require('mongoose');
const crypto = require('crypto');

// Get encryption key from environment
const ENCRYPTION_KEY = process.env.PASSWORD_ENCRYPTION_KEY || 'change-this-to-32-character-key!';
const IV_LENGTH = 16;

// Encryption functions
const encrypt = (text) => {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(
    'aes-256-cbc',
    Buffer.from(ENCRYPTION_KEY, 'utf-8').slice(0, 32),
    iv
  );
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
};

const decrypt = (text) => {
  const textParts = text.split(':');
  const iv = Buffer.from(textParts.shift(), 'hex');
  const encryptedText = Buffer.from(textParts.join(':'), 'hex');
  const decipher = crypto.createDecipheriv(
    'aes-256-cbc',
    Buffer.from(ENCRYPTION_KEY, 'utf-8').slice(0, 32),
    iv
  );
  let decrypted = decipher.update(encryptedText);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString();
};

const passwordSchema = new mongoose.Schema({
  vendorName: {
    type: String,
    required: true,
  },
  category: {
    type: String,
    enum: ['carrier', 'airline', 'steamship', 'customs', 'port', 'software', 'other'],
    default: 'other'
  },
  url: String,
  username: String,
  password: {
    type: String,
    required: true,
    get: decrypt,
    set: encrypt
  },
  contactName: String,
  contactPhone: String,
  notes: String,
  expirationDate: Date,
  lastAccessed: Date,
  lastAccessedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true,
  toJSON: { getters: true },
  toObject: { getters: true }
});

module.exports = mongoose.model('Password', passwordSchema);
