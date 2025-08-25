const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const Partner = require('../models/Partner');
const PartnerContact = require('../models/PartnerContact');
const User = require('../models/User');
const { authorize } = require('../middleware/authorize');
const { sendPartnerWelcomeEmail, sendMagicLinkEmail } = require('../services/emailService');

// ─────────────────────────────────────────────────────────────
// ADMIN ROUTES - Create and Manage Partners
// ─────────────────────────────────────────────────────────────

// NEW: Direct create partner (no invite needed)
router.post('/create-direct', authorize(['system_admin']), async (req, res) => {
  try {
    const { 
      companyName,
      companyCode,
      type, // 'customer' or 'foreign_partner'
      contactEmail,
      contactName,
      country,
      phone,
      address,
      apiMarkups,
      modeCharges,
      modules
    } = req.body;
    
    // Validate required fields
    if (!companyName || !companyCode || !type || !contactEmail || !contactName || !country || !phone) {
      return res.status(400).json({ 
        error: 'Missing required fields: companyName, companyCode, type, contactEmail, contactName, country, phone' 
      });
    }
    
    // Check if partner already exists
    const existingPartner = await Partner.findOne({ 
      $or: [
        { email: contactEmail },
        { companyCode: companyCode.toUpperCase() }
      ]
    });
    if (existingPartner) {
      return res.status(400).json({ error: 'Partner with this email or company code already exists' });
    }
    
    // Check if user already exists
    const existingUser = await User.findOne({ email: contactEmail });
    if (existingUser) {
      return res.status(400).json({ error: 'User with this email already exists' });
    }
    
    // Create partner record
    const partner = new Partner({
      companyName,
      companyCode: companyCode.toUpperCase(),
      type,
      email: contactEmail,
      country,
      phone,
      address: address || {},
      apiMarkups: apiMarkups || {
        pelicargo: 15,
        freightForce: 18,
        ecuLines: 20
      },
      modeCharges: modeCharges || {
        air: [],
        ocean: [],
        ground: []
      },
      modules: modules || ['Pricing Portal'],
      status: 'approved', // Auto-approve since admin created
      approvedBy: req.user._id,
      approvedAt: new Date()
    });
    
    await partner.save();
    
    // Generate temporary password
    const tempPassword = crypto.randomBytes(8).toString('hex');
    
    // Create user account for partner
    const user = new User({
      email: contactEmail,
      password: await bcrypt.hash(tempPassword, 10),
      name: contactName,
      role: type, // 'customer' or 'foreign_partner'
      companyId: partner._id,
      partnerId: partner._id, // Link to partner
      mustChangePassword: true, // Flag to force password change on first login
      active: true
    });
    
    await user.save();
    
    // Create primary contact
    const contact = new PartnerContact({
      partnerId: partner._id,
      name: contactName,
      email: contactEmail,
      phone: phone,
      contactType: 'primary',
      hasPortalAccess: true,
      portalRole: 'admin',
      active: true
    });
    
    await contact.save();
    
    // Generate magic link token for initial setup
    const magicToken = crypto.randomBytes(32).toString('hex');
    contact.magicLinkToken = magicToken;
    contact.magicLinkExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
    await contact.save();
    
    // Send welcome email with credentials
    await sendPartnerWelcomeEmail(contactEmail, {
      companyName,
      contactName,
      email: contactEmail,
      tempPassword,
      magicLink: `${process.env.FRONTEND_URL}/partner-setup?token=${magicToken}`
    });
    
    res.json({ 
      success: true, 
      message: 'Partner created and welcome email sent',
      partner: {
        id: partner._id,
        companyName: partner.companyName,
        companyCode: partner.companyCode,
        email: partner.email,
        type: partner.type,
        country: partner.country
      }
    });
  } catch (error) {
    console.error('Partner creation error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get all partners (admin view)
router.get('/', authorize(['system_admin']), async (req, res) => {
  try {
    const { status, country, type } = req.query;
    
    const query = {};
    if (status) query.status = status;
    if (country) query.country = country;
    if (type) query.type = type;
    
    const partners = await Partner.find(query)
      .populate('approvedBy', 'name email')
      .sort('-createdAt');
    
    res.json({ success: true, partners });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get partner details
router.get('/:id', authorize(['system_admin']), async (req, res) => {
  try {
    const partner = await Partner.findById(req.params.id)
      .populate('approvedBy', 'name email');
    
    if (!partner) {
      return res.status(404).json({ error: 'Partner not found' });
    }
    
    // Get contacts for this partner
    const contacts = await PartnerContact.find({ partnerId: partner._id });
    
    res.json({ 
      success: true, 
      partner,
      contacts 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update partner
router.put('/:id', authorize(['system_admin']), async (req, res) => {
  try {
    const partner = await Partner.findById(req.params.id);
    
    if (!partner) {
      return res.status(404).json({ error: 'Partner not found' });
    }
    
    // Update allowed fields
    const allowedUpdates = [
      'companyName', 'country', 'phone', 'address', 
      'apiMarkups', 'modeCharges', 'modules', 
      'additionalFees', 'status', 'paymentTerms', 
      'currency', 'notes'
    ];
    
    allowedUpdates.forEach(field => {
      if (req.body[field] !== undefined) {
        partner[field] = req.body[field];
      }
    });
    
    await partner.save();
    
    res.json({ 
      success: true, 
      message: 'Partner updated successfully',
      partner 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update partner status (approve/suspend/etc)
router.put('/:id/status', authorize(['system_admin']), async (req, res) => {
  try {
    const { status } = req.body;
    const partner = await Partner.findById(req.params.id);
    
    if (!partner) {
      return res.status(404).json({ error: 'Partner not found' });
    }
    
    partner.status = status;
    
    if (status === 'approved') {
      partner.approvedBy = req.user._id;
      partner.approvedAt = new Date();
    }
    
    await partner.save();
    
    res.json({ 
      success: true, 
      message: `Partner ${status} successfully`,
      partner 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete partner
router.delete('/:id', authorize(['system_admin']), async (req, res) => {
  try {
    const partner = await Partner.findById(req.params.id);
    
    if (!partner) {
      return res.status(404).json({ error: 'Partner not found' });
    }
    
    // Delete related data
    await PartnerContact.deleteMany({ partnerId: partner._id });
    await User.deleteMany({ partnerId: partner._id });
    
    // Delete partner
    await partner.remove();
    
    res.json({ 
      success: true, 
      message: 'Partner deleted successfully' 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─────────────────────────────────────────────────────────────
// Reset partner password (admin only)
// ─────────────────────────────────────────────────────────────
router.post('/:id/reset-password', authorize(['system_admin']), async (req, res) => {
  try {
    const partner = await Partner.findById(req.params.id);
    
    if (!partner) {
      return res.status(404).json({ error: 'Partner not found' });
    }
    
    // Find the user account for this partner
    const user = await User.findOne({ email: partner.email });
    
    if (!user) {
      return res.status(404).json({ error: 'User account not found for this partner' });
    }
    
    // Generate new password
    const newPassword = req.body.password || crypto.randomBytes(8).toString('hex');
    
    // Hash and save the new password
    user.password = await bcrypt.hash(newPassword, 10);
    user.mustChangePassword = true; // Force them to change on next login
    await user.save();
    
    // Log the password so you can share it with the partner
    console.log(`Password reset for ${partner.email}: ${newPassword}`);
    
    res.json({ 
      success: true, 
      message: 'Password reset successfully',
      tempPassword: newPassword // Return it so you can display in frontend
    });
  } catch (error) {
    console.error('Password reset error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ─────────────────────────────────────────────────────────────
// PARTNER PORTAL ROUTES - Magic Link Auth
// ─────────────────────────────────────────────────────────────

// Request magic link for login
router.post('/auth/magic-link', async (req, res) => {
  try {
    const { email } = req.body;
    
    // Find contact with portal access
    const contact = await PartnerContact.findOne({ 
      email,
      hasPortalAccess: true,
      active: true
    });
    
    if (!contact) {
      // Don't reveal if email exists or not (security)
      return res.json({ 
        success: true,
        message: 'If this email is registered, you will receive a login link.'
      });
    }
    
    // Check if partner is approved
    const partner = await Partner.findById(contact.partnerId);
    if (partner.status !== 'approved') {
      return res.status(403).json({ error: 'Partner account not yet approved' });
    }
    
    // Generate magic link token
    const token = crypto.randomBytes(32).toString('hex');
    contact.magicLinkToken = token;
    contact.magicLinkExpiry = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
    
    await contact.save();
    
    // Send magic link email
    await sendMagicLinkEmail(email, token, contact.name);
    
    res.json({ 
      success: true,
      message: 'Login link sent to your email'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Verify magic link and create session
router.get('/auth/verify/:token', async (req, res) => {
  try {
    const contact = await PartnerContact.findOne({
      magicLinkToken: req.params.token,
      magicLinkExpiry: { $gt: new Date() }
    }).populate('partnerId');
    
    if (!contact) {
      return res.status(400).json({ error: 'Invalid or expired link' });
    }
    
    // Clear the token
    contact.magicLinkToken = null;
    contact.magicLinkExpiry = null;
    contact.lastLogin = new Date();
    await contact.save();
    
    // Create a session token
    const jwt = require('jsonwebtoken');
    const sessionToken = jwt.sign(
      { 
        contactId: contact._id,
        partnerId: contact.partnerId._id,
        email: contact.email,
        role: contact.portalRole
      },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '24h' }
    );
    
    res.json({
      success: true,
      token: sessionToken,
      contact: {
        id: contact._id,
        name: contact.name,
        email: contact.email,
        role: contact.portalRole
      },
      partner: {
        id: contact.partnerId._id,
        companyName: contact.partnerId.companyName,
        type: contact.partnerId.type,
        status: contact.partnerId.status
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─────────────────────────────────────────────────────────────
// PARTNER CONTACT MANAGEMENT
// ─────────────────────────────────────────────────────────────

// Add contact for partner
router.post('/:partnerId/contacts', authorize(['system_admin']), async (req, res) => {
  try {
    const partner = await Partner.findById(req.params.partnerId);
    if (!partner) {
      return res.status(404).json({ error: 'Partner not found' });
    }
    
    const contact = new PartnerContact({
      partnerId: partner._id,
      ...req.body
    });
    
    await contact.save();
    
    res.json({ 
      success: true,
      message: 'Contact added successfully',
      contact 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get contacts for partner
router.get('/:partnerId/contacts', authorize(['system_admin']), async (req, res) => {
  try {
    const contacts = await PartnerContact.find({ 
      partnerId: req.params.partnerId 
    });
    
    res.json({ success: true, contacts });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update contact
router.put('/contacts/:contactId', authorize(['system_admin']), async (req, res) => {
  try {
    const contact = await PartnerContact.findById(req.params.contactId);
    if (!contact) {
      return res.status(404).json({ error: 'Contact not found' });
    }
    
    Object.assign(contact, req.body);
    await contact.save();
    
    res.json({ 
      success: true,
      message: 'Contact updated successfully',
      contact 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete contact
router.delete('/contacts/:contactId', authorize(['system_admin']), async (req, res) => {
  try {
    const contact = await PartnerContact.findById(req.params.contactId);
    if (!contact) {
      return res.status(404).json({ error: 'Contact not found' });
    }
    
    // Don't delete primary contact
    if (contact.contactType === 'primary') {
      return res.status(400).json({ error: 'Cannot delete primary contact' });
    }
    
    await contact.remove();
    
    res.json({ 
      success: true,
      message: 'Contact deleted successfully' 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
