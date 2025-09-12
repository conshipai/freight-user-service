// src/routes/carriers.js - NEW FILE (Different from carrierAccounts)
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const authorize = require('../middleware/authorize');
const Carrier = require('../models/Carrier');

// Get carriers (optionally filtered by service type)
router.get('/', auth, async (req, res) => {
  try {
    const { serviceType } = req.query;
    
    const query = { active: true };
    if (serviceType) {
      query.services = serviceType;
    }
    
    const carriers = await Carrier.find(query)
      .sort('name');
    
    res.json({
      success: true,
      carriers
    });
  } catch (error) {
    console.error('Get carriers error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get carriers for a specific service (used by quote system)
router.get('/for-service/:serviceType', auth, async (req, res) => {
  try {
    const { serviceType } = req.params;
    
    const carriers = await Carrier.find({
      services: serviceType,
      active: true
    }).sort('name');
    
    res.json({
      success: true,
      carriers
    });
  } catch (error) {
    console.error('Get carriers for service error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Create carrier (admin only)
router.post('/', auth, authorize(['system_admin', 'conship_employee']), async (req, res) => {
  try {
    const carrier = new Carrier({
      ...req.body,
      createdBy: req.user._id
    });
    
    await carrier.save();
    
    res.json({
      success: true,
      carrier
    });
  } catch (error) {
    console.error('Create carrier error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Update carrier (admin only)
router.put('/:id', auth, authorize(['system_admin', 'conship_employee']), async (req, res) => {
  try {
    const carrier = await Carrier.findByIdAndUpdate(
      req.params.id,
      {
        ...req.body,
        updatedBy: req.user._id,
        updatedAt: new Date()
      },
      { new: true }
    );
    
    if (!carrier) {
      return res.status(404).json({
        success: false,
        error: 'Carrier not found'
      });
    }
    
    res.json({
      success: true,
      carrier
    });
  } catch (error) {
    console.error('Update carrier error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Delete carrier (soft delete - admin only)
router.delete('/:id', auth, authorize(['system_admin', 'conship_employee']), async (req, res) => {
  try {
    const carrier = await Carrier.findByIdAndUpdate(
      req.params.id,
      {
        active: false,
        deletedBy: req.user._id,
        deletedAt: new Date()
      }
    );
    
    if (!carrier) {
      return res.status(404).json({
        success: false,
        error: 'Carrier not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Carrier deleted successfully'
    });
  } catch (error) {
    console.error('Delete carrier error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
