const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const Partner = require('../models/Partner');
const PartnerContact = require('../models/PartnerContact');
const PartnerInvite = require('../models/PartnerInvite');
const { authorize } = require('../middleware/authorize');

// For email sending (we'll implement this next)
const { sendInviteEmail, sendMagicLinkEmail } = require('../services/emailService');

// ─────────────────────────────────────────────────────────────
// ADMIN ROUTES - Invite and Manage Partners
// ─────────────────────────────────────────────────────────────

// Send invite to new partner
router.post('/invite', authorize(['system_admin']), async (req, res) => {
  try {
    const { email, companyName, country, contactName, notes } = req.body;
    
    // Check if partner already exists
    const existingPartner = await Partner.findOne({ email });
    if (existingPartner) {
      return res.status(400).json({ error: 'Partner already exists' });
    }
    
    // Check if invite already sent
    const existingInvite = await PartnerInvite.findOne({ 
      email, 
      status: 'pending' 
    });
    if (existingInvite) {
      return res.status(400).json({ error: 'Invite already sent to this email' });
    }
    
    // Generate unique token
    const token = crypto.randomBytes(32).toString('hex');
    
    // Create invite record
    const invite = new PartnerInvite({
      email,
      companyName,
      country,
      invitedBy: req.user._id,
      token,
      preFillData: {
        contactName,
        notes
      }
    });
    
    await invite.save();
    
    // Send invite email
    await sendInviteEmail(email, companyName, token);
    
    res.json({ 
      success: true, 
      message: 'Invite sent successfully',
      invite: {
        id: invite._id,
        email: invite.email,
        companyName: invite.companyName
      }
    });
  } catch (error) {
    console.error('Invite error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get all partners (admin view)
router.get('/', authorize(['system_admin']), async (req, res) => {
  try {
    const { status, country } = req.query;
    
    const query = {};
    if (status) query.status = status;
    if (country) query.country = country;
    
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

// Approve partner
router.put('/:id/approve', authorize(['system_admin']), async (req, res) => {
  try {
    const partner = await Partner.findById(req.params.id);
    
    if (!partner) {
      return res.status(404).json({ error: 'Partner not found' });
    }
    
    partner.status = 'approved';
    partner.approvedBy = req.user._id;
    partner.approvedAt = new Date();
    
    await partner.save();
    
    // TODO: Send approval email to partner
    
    res.json({ 
      success: true, 
      message: 'Partner approved successfully',
      partner 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update partner markup settings
router.put('/:id/markup', authorize(['system_admin']), async (req, res) => {
  try {
    const { markupSettings, additionalFees } = req.body;
    
    const partner = await Partner.findById(req.params.id);
    if (!partner) {
      return res.status(404).json({ error: 'Partner not found' });
    }
    
    if (markupSettings) {
      partner.markupSettings = { ...partner.markupSettings, ...markupSettings };
    }
    
    if (additionalFees) {
      partner.additionalFees = additionalFees;
    }
    
    await partner.save();
    
    res.json({ 
      success: true, 
      message: 'Markup settings updated',
      partner 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─────────────────────────────────────────────────────────────
// PUBLIC ROUTES - Partner Registration
// ─────────────────────────────────────────────────────────────

// Verify invite token and get pre-filled data
router.get('/register/verify/:token', async (req, res) => {
  try {
    const invite = await PartnerInvite.findOne({ 
      token: req.params.token,
      status: 'pending'
    });
    
    if (!invite) {
      return res.status(400).json({ error: 'Invalid or expired invite' });
    }
    
    if (invite.tokenExpiry < new Date()) {
      invite.status = 'expired';
      await invite.save();
      return res.status(400).json({ error: 'Invite has expired' });
    }
    
    res.json({ 
      success: true,
      invite: {
        email: invite.email,
        companyName: invite.companyName,
        country: invite.country,
        preFillData: invite.preFillData
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Complete partner registration
router.post('/register/complete', async (req, res) => {
  try {
    const { 
      token,
      companyData,
      contactData 
    } = req.body;
    
    // Verify token
    const invite = await PartnerInvite.findOne({ 
      token,
      status: 'pending'
    });
    
    if (!invite) {
      return res.status(400).json({ error: 'Invalid registration token' });
    }
    
    // Create partner
    const partner = new Partner({
      ...companyData,
      email: invite.email,
      invitedBy: invite.invitedBy,
      status: 'pending' // Needs admin approval
    });
    
    await partner.save();
    
    // Create primary contact
    const contact = new PartnerContact({
      partnerId: partner._id,
      ...contactData,
      contactType: 'primary',
      hasPortalAccess: true,
      portalRole: 'admin'
    });
    
    await contact.save();
    
    // Mark invite as completed
    invite.status = 'completed';
    invite.completedAt = new Date();
    await invite.save();
    
    res.json({ 
      success: true,
      message: 'Registration completed. Awaiting approval.',
      partnerId: partner._id
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─────────────────────────────────────────────────────────────
// PARTNER PORTAL ROUTES - Magic Link Auth
// ─────────────────────────────────────────────────────────────

// Request magic link
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
      // Don't reveal if email exists or not
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
    
    // Create a session token (you might want to use JWT here)
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

module.exports = router;
