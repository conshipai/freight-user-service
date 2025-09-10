// src/routes/companies.js
const express = require('express');
const router = express.Router();
const Company = require('../models/Company');
const User = require('../models/User');
const authorize = require('../middleware/authorize');

// Create company with markup configuration
router.post('/create', authorize(['system_admin']), async (req, res) => {
  try {
    const { 
      companyInfo,
      mainUser,
      markupRules,
      additionalFees 
    } = req.body;
    
    // Create company with markup configuration
    const company = await Company.create({
      ...companyInfo,
      markupRules: markupRules || [
        // Default markup if none provided
        {
          provider: 'ALL',
          mode: 'all',
          percentage: 25,
          minimumMarkup: 50,
          maximumMarkup: 10000,
          flatFee: 0
        }
      ],
      additionalFees: additionalFees || []
    });
    
    // Create main user
    const user = await User.create({
      ...mainUser,
      role: companyInfo.type === 'customer' ? 'customer' : 'foreign_partner',
      companyId: company._id
    });
    
    // Update company with primary user
    company.primaryUserId = user._id;
    await company.save();
    
    res.json({
      success: true,
      company,
      user
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all companies
router.get('/', authorize(['system_admin']), async (req, res) => {
  try {
    const companies = await Company.find()
      .populate('primaryUserId', 'name email')
      .sort('-createdAt');
    
    res.json({ success: true, companies });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get company by ID
router.get('/:id', authorize(['system_admin', 'company_admin']), async (req, res) => {
  try {
    const company = await Company.findById(req.params.id)
      .populate('primaryUserId', 'name email');
    
    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }
    
    // Check if user can view this company
    if (req.user.role !== 'system_admin' && 
        req.user.companyId?.toString() !== company._id.toString()) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    res.json({ success: true, company });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update company markup settings
router.put('/:id/markup', authorize(['system_admin']), async (req, res) => {
  try {
    const { markupRules, additionalFees } = req.body;
    
    const company = await Company.findById(req.params.id);
    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }
    
    if (markupRules) {
      company.markupRules = markupRules;
    }
    
    if (additionalFees) {
      company.additionalFees = additionalFees;
    }
    
    await company.save();
    
    res.json({ 
      success: true, 
      message: 'Markup settings updated',
      company 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Activate/Deactivate company
router.put('/:id/status', authorize(['system_admin']), async (req, res) => {
  try {
    const { active } = req.body;
    
    const company = await Company.findById(req.params.id);
    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }
    
    company.active = active;
    await company.save();
    
    res.json({ 
      success: true, 
      message: `Company ${active ? 'activated' : 'deactivated'}`,
      company 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
