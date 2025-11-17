// src/routes/passwords.js
const express = require('express');
const router = express.Router();
const Password = require('../models/Password');
const AuditLog = require('../models/AuditLog');
const auth = require('../middleware/auth');

// Check if user can access password manager
const checkPasswordAccess = async (req, res, next) => {
  const user = req.user;
  
  // Only system_admin and conship_employee can access
  if (user.role !== 'system_admin' && user.role !== 'conship_employee') {
    return res.status(403).json({ error: 'Access denied to password manager' });
  }
  
  // Set default role for system_admin
  if (user.role === 'system_admin' && !user.passwordManagerRole) {
    user.passwordManagerRole = 'admin';
  }
  
  next();
};

// Log audit trail
const logAudit = async (user, action, password = null, details = null) => {
  try {
    await AuditLog.create({
      userId: user._id,
      userName: user.name,
      userEmail: user.email,
      action,
      passwordId: password?._id,
      passwordName: password?.vendorName,
      details
    });
  } catch (error) {
    console.error('Audit log error:', error);
  }
};

// GET all passwords
router.get('/', auth, checkPasswordAccess, async (req, res) => {
  try {
    const { search, category, showExpired, showWarning } = req.query;
    
    let query = { isActive: true };
    
    // Add filters if provided
    if (category && category !== 'all') {
      query.category = category;
    }
    
    if (search) {
      query.$or = [
        { vendorName: { $regex: search, $options: 'i' } },
        { username: { $regex: search, $options: 'i' } },
        { notes: { $regex: search, $options: 'i' } }
      ];
    }
    
    const passwords = await Password.find(query)
      .populate('createdBy', 'name email')
      .sort({ vendorName: 1 });
    
    res.json({ passwords });
  } catch (error) {
    console.error('Error fetching passwords:', error);
    res.status(500).json({ error: 'Failed to fetch passwords' });
  }
});

// GET single password
router.get('/:id', auth, checkPasswordAccess, async (req, res) => {
  try {
    const password = await Password.findById(req.params.id)
      .populate('createdBy', 'name email');
    
    if (!password) {
      return res.status(404).json({ error: 'Password not found' });
    }
    
    // Update last accessed
    password.lastAccessed = new Date();
    password.lastAccessedBy = req.user._id;
    await password.save();
    
    // Log audit
    await logAudit(req.user, 'view', password);
    
    res.json(password);
  } catch (error) {
    console.error('Error fetching password:', error);
    res.status(500).json({ error: 'Failed to fetch password' });
  }
});

// CREATE password
router.post('/', auth, checkPasswordAccess, async (req, res) => {
  try {
    const userRole = req.user.passwordManagerRole || 'user';
    
    // Check permission
    if (userRole === 'user') {
      return res.status(403).json({ error: 'No permission to create passwords' });
    }
    
    const password = new Password({
      ...req.body,
      createdBy: req.user._id
    });
    
    await password.save();
    await logAudit(req.user, 'create', password);
    
    res.status(201).json(password);
  } catch (error) {
    console.error('Error creating password:', error);
    res.status(500).json({ error: 'Failed to create password' });
  }
});

// UPDATE password
router.put('/:id', auth, checkPasswordAccess, async (req, res) => {
  try {
    const userRole = req.user.passwordManagerRole || 'user';
    
    if (userRole === 'user') {
      return res.status(403).json({ error: 'No permission to edit passwords' });
    }
    
    const password = await Password.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );
    
    if (!password) {
      return res.status(404).json({ error: 'Password not found' });
    }
    
    await logAudit(req.user, 'edit', password);
    res.json(password);
  } catch (error) {
    console.error('Error updating password:', error);
    res.status(500).json({ error: 'Failed to update password' });
  }
});

// DELETE password
router.delete('/:id', auth, checkPasswordAccess, async (req, res) => {
  try {
    const userRole = req.user.passwordManagerRole || 'user';
    
    if (userRole === 'user') {
      return res.status(403).json({ error: 'No permission to delete passwords' });
    }
    
    const password = await Password.findById(req.params.id);
    if (!password) {
      return res.status(404).json({ error: 'Password not found' });
    }
    
    // Soft delete
    password.isActive = false;
    await password.save();
    
    await logAudit(req.user, 'delete', password);
    res.json({ message: 'Password deleted successfully' });
  } catch (error) {
    console.error('Error deleting password:', error);
    res.status(500).json({ error: 'Failed to delete password' });
  }
});

// Log password access (copy/reveal)
router.post('/audit', auth, checkPasswordAccess, async (req, res) => {
  try {
    const { passwordId, action } = req.body;
    const password = await Password.findById(passwordId);
    
    if (!password) {
      return res.status(404).json({ error: 'Password not found' });
    }
    
    await logAudit(req.user, action, password);
    res.json({ message: 'Action logged' });
  } catch (error) {
    console.error('Error logging action:', error);
    res.status(500).json({ error: 'Failed to log action' });
  }
});

// GET audit logs
router.get('/audit', auth, checkPasswordAccess, async (req, res) => {
  try {
    const userRole = req.user.passwordManagerRole || 'user';
    
    // Only managers and admins can view audit logs
    if (userRole === 'user') {
      return res.status(403).json({ error: 'No permission to view audit logs' });
    }
    
    const logs = await AuditLog.find()
      .populate('userId', 'name email')
      .sort({ timestamp: -1 })
      .limit(100);
    
    res.json({ logs });
  } catch (error) {
    console.error('Error fetching audit logs:', error);
    res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
});

// Panic button
router.post('/panic', auth, checkPasswordAccess, async (req, res) => {
  try {
    const { message } = req.body;
    
    await logAudit(req.user, 'panic_button', null, `PANIC: ${message}`);
    
    // TODO: Add email notification to admin
    console.error(`PANIC ALERT from ${req.user.email}: ${message}`);
    
    res.json({ message: 'Emergency alert sent to administrator' });
  } catch (error) {
    console.error('Error sending panic alert:', error);
    res.status(500).json({ error: 'Failed to send alert' });
  }
});

// Get user permissions
router.get('/permissions', auth, checkPasswordAccess, async (req, res) => {
  try {
    const User = require('../models/User');
    
    // Only admins can manage users
    if (req.user.passwordManagerRole !== 'admin') {
      return res.status(403).json({ error: 'No permission to manage users' });
    }
    
    const users = await User.find({
      $or: [
        { role: 'system_admin' },
        { role: 'conship_employee' }
      ]
    }).select('name email role passwordManagerRole');
    
    res.json({ users });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// ========================================
// TWILIO TEST ENDPOINT - Remove after testing
// ========================================
router.get('/test-twilio', async (req, res) => {
  console.log('🔧 Testing Twilio configuration...');
  
  // Check environment variables
  const config = {
    accountSid: process.env.TWILIO_ACCOUNT_SID ? '✅ Set' : '❌ Not set',
    authToken: process.env.TWILIO_AUTH_TOKEN ? '✅ Set' : '❌ Not set', 
    twilioPhone: process.env.TWILIO_PHONE_NUMBER || '❌ Not set',
    adminPhone: process.env.ADMIN_PHONE_NUMBER || '❌ Not set'
  };
  
  console.log('Twilio Config:', config);
  
  // Check if all required variables are set
  if (config.accountSid.includes('❌') || 
      config.authToken.includes('❌') || 
      config.twilioPhone.includes('❌') || 
      config.adminPhone.includes('❌')) {
    return res.json({
      success: false,
      message: 'Twilio not configured properly',
      config,
      instructions: 'Please check environment variables in Coolify'
    });
  }
  
  // Try to send test SMS
  try {
    const twilio = require('twilio');
    const client = twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );
    
    console.log('📱 Sending test SMS to:', process.env.ADMIN_PHONE_NUMBER);
    
    const message = await client.messages.create({
      body: '✅ Password Manager Test: Twilio is working! Your SMS configuration is correct.',
      from: process.env.TWILIO_PHONE_NUMBER,
      to: process.env.ADMIN_PHONE_NUMBER
    });
    
    console.log('✅ SMS sent successfully! SID:', message.sid);
    
    res.json({
      success: true,
      message: 'Test SMS sent successfully!',
      messageSid: message.sid,
      to: message.to,
      from: message.from,
      status: message.status,
      config
    });
  } catch (error) {
    console.error('❌ Twilio error:', error);
    res.json({
      success: false,
      error: error.message,
      config,
      troubleshooting: {
        possibleIssues: [
          '1. Check phone numbers are in E.164 format (+1234567890)',
          '2. Verify your Twilio account is active',
          '3. Confirm you purchased a phone number in Twilio',
          '4. For trial accounts, verify recipient number in Twilio console',
          '5. Check Twilio account has SMS geographic permissions for your country'
        ],
        twilioErrorCode: error.code,
        twilioMoreInfo: error.moreInfo
      }
    });
  }
});

module.exports = router;
