// ============================================
// 1. src/routes/addressBook.js - NEW FILE
// ============================================
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');

// You'll need to create this model
const AddressBookCompany = require('../models/AddressBookCompany');

// Get all companies for the current user
router.get('/companies', auth, async (req, res) => {
  try {
    const companies = await AddressBookCompany.find({
      userId: req.user._id,
      deleted: { $ne: true }
    }).sort('-isDefault name');
    
    res.json({
      success: true,
      companies
    });
  } catch (error) {
    console.error('Get companies error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Create new company
router.post('/companies', auth, async (req, res) => {
  try {
    const company = new AddressBookCompany({
      ...req.body,
      userId: req.user._id,
      createdBy: req.user._id
    });
    
    await company.save();
    
    res.json({
      success: true,
      company
    });
  } catch (error) {
    console.error('Create company error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Update company
router.put('/companies/:id', auth, async (req, res) => {
  try {
    const company = await AddressBookCompany.findOneAndUpdate(
      {
        _id: req.params.id,
        userId: req.user._id
      },
      {
        ...req.body,
        updatedAt: new Date()
      },
      { new: true }
    );
    
    if (!company) {
      return res.status(404).json({
        success: false,
        error: 'Company not found'
      });
    }
    
    res.json({
      success: true,
      company
    });
  } catch (error) {
    console.error('Update company error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Delete company (soft delete)
router.delete('/companies/:id', auth, async (req, res) => {
  try {
    const company = await AddressBookCompany.findOneAndUpdate(
      {
        _id: req.params.id,
        userId: req.user._id
      },
      {
        deleted: true,
        deletedAt: new Date()
      }
    );
    
    if (!company) {
      return res.status(404).json({
        success: false,
        error: 'Company not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Company deleted successfully'
    });
  } catch (error) {
    console.error('Delete company error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
