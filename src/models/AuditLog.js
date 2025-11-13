// src/models/AuditLog.js
const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  userName: String,
  userEmail: String,
  action: {
    type: String,
    enum: ['view', 'copy', 'reveal', 'create', 'edit', 'delete', 'panic_button'],
    required: true
  },
  passwordId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Password'
  },
  passwordName: String,
  details: String,
  timestamp: {
    type: Date,
    default: Date.now
  }
});

// Auto-delete logs after 1 year
auditLogSchema.index({ timestamp: 1 }, { expireAfterSeconds: 31536000 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
