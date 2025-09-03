const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const Partner = require('../models/Partner'); // Adjust path as needed
const User = require('../models/User'); // Adjust path as needed
const { authorize } = require('../middleware/authorize'); // ✅ Fixed path

// Create partner directly (with automatic user account creation)
router.post('/create-direct', authorize(['system_admin']), async (req, res) => {
  try {
    const { 
      companyName,
      companyCode,
      type,
      contactEmail,
      contactName,
      country,
      phone,
      address,
      city,
      state,
      zipCode,
      website,
      apiMarkups,
      modeCharges,
      modules
    } = req.body;
    
    const tempPassword = crypto.randomBytes(8).toString('hex');
    console.log(`Creating user ${contactEmail} with password: ${tempPassword}`);
    
    const partner = new Partner({
      companyName,
      companyCode: companyCode.toUpperCase(),
      type: type === 'foreign_partner' ? 'foreign_partner' : 'customer',
      email: contactEmail,
      contactName,
      country,
      phone,
      address,
      city,
      state,
      zipCode,
      website,
      apiMarkups: apiMarkups || { pelicargo: 15, freightForce: 18, ecuLines: 20 }, // ✅ New field
      modeCharges: modeCharges || { air: [], ocean: [], ground: [] }, // ✅ New field
      modules: modules || ['Quote Manager'], // ✅ New field
      status: 'approved',
      approvedBy: req.user._id,
      approvedAt: new Date()
    });
    
    await partner.save();
    
    const userRole = (type === 'foreign_partner' || country !== 'United States') 
      ? 'foreign_partner' 
      : 'customer';
    
    const user = new User({
      email: contactEmail,
      password: tempPassword,
      name: contactName,
      role: userRole,
      partnerId: partner._id,
      mustChangePassword: true,
      active: true
    });
    
    await user.save();
    
    res.json({ 
      success: true, 
      message: 'Partner created successfully',
      tempPassword,
      partner: {
        id: partner._id,
        companyName: partner.companyName,
        email: partner.email,
        role: userRole
      }
    });
  } catch (error) {
    console.error('Partner creation error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ✅ Updated: Get all partners with correct response format
router.get('/', authorize(['system_admin']), async (req, res) => {
  try {
    const partners = await Partner.find().populate('approvedBy', 'name email');
    res.json({ success: true, partners }); // ✅ Wrapped in success object
  } catch (error) {
    console.error('Error fetching partners:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get partner by ID
router.get('/:id', authorize(['system_admin']), async (req, res) => {
  try {
    const partner = await Partner.findById(req.params.id).populate('approvedBy', 'name email');
    if (!partner) {
      return res.status(404).json({ error: 'Partner not found' });
    }
    res.json(partner);
  } catch (error) {
    console.error('Error fetching partner:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update partner
router.put('/:id', authorize(['system_admin']), async (req, res) => {
  try {
    const partner = await Partner.findByIdAndUpdate(
      req.params.id, 
      req.body, 
      { new: true, runValidators: true }
    );
    if (!partner) {
      return res.status(404).json({ error: 'Partner not found' });
    }
    res.json(partner);
  } catch (error) {
    console.error('Error updating partner:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete partner
router.delete('/:id', authorize(['system_admin']), async (req, res) => {
  try {
    const partner = await Partner.findByIdAndDelete(req.params.id);
    if (!partner) {
      return res.status(404).json({ error: 'Partner not found' });
    }
    res.json({ success: true, message: 'Partner deleted successfully' });
  } catch (error) {
    console.error('Error deleting partner:', error);
    res.status(500).json({ error: error.message });
  }
});

// ✅ New: Reset partner password
router.post('/:id/reset-password', authorize(['system_admin']), async (req, res) => {
  try {
    const partner = await Partner.findById(req.params.id);
    if (!partner) {
      return res.status(404).json({ error: 'Partner not found' });
    }

    const user = await User.findOne({ partnerId: partner._id });
    if (!user) {
      return res.status(404).json({ error: 'User account not found for this partner' });
    }

    const tempPassword = crypto.randomBytes(8).toString('hex');

    user.password = tempPassword;
    user.mustChangePassword = true;
    await user.save();

    console.log(`Password reset for ${partner.email}: ${tempPassword}`);

    res.json({ 
      success: true, 
      message: 'Password reset successfully',
      tempPassword
    });
  } catch (error) {
    console.error('Password reset error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
