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
    res.status(500).json({ error: error
