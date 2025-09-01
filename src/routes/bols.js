// src/routes/bols.js
const express = require('express');
const router = express.Router();
const BOL = require('../models/BOL');

// Create BOL
router.post('/', async (req, res) => {
  try {
    const { bookingId, bolData } = req.body;
    
    const bol = new BOL({
      bookingId,
      ...bolData
    });
    
    await bol.save();
    
    res.json({
      success: true,
      bol
    });
  } catch (error) {
    console.error('BOL creation error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Get BOLs for a booking
router.get('/booking/:bookingId', async (req, res) => {
  try {
    const bols = await BOL.find({ 
      bookingId: req.params.bookingId 
    }).sort('-createdAt');
    
    res.json({
      success: true,
      bols
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Get single BOL
router.get('/:id', async (req, res) => {
  try {
    const bol = await BOL.findById(req.params.id);
    
    if (!bol) {
      return res.status(404).json({ 
        success: false, 
        error: 'BOL not found' 
      });
    }
    
    res.json({
      success: true,
      bol
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

module.exports = router;
