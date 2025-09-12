// ============================================
// 4. src/routes/bols.js - UPDATED VERSION
// ============================================
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const BOL = require('../models/BOL');
const Booking = require('../models/Booking');

// Create BOL
router.post('/', auth, async (req, res) => {
  try {
    const { 
      bookingId, 
      requestId, 
      bolNumber, 
      fileUrl, 
      fileKey, 
      documentType 
    } = req.body;
    
    // Check if booking exists
    const booking = await Booking.findById(bookingId);
    if (!booking) {
      return res.status(404).json({
        success: false,
        error: 'Booking not found'
      });
    }
    
    const bol = new BOL({
      bookingId,
      requestId,
      bolNumber,
      fileUrl,
      fileKey,
      documentType,
      createdBy: req.user._id
    });
    
    await bol.save();
    
    res.json({
      success: true,
      bolId: bol._id,
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

// Get BOL by booking ID
router.get('/by-booking/:bookingId', auth, async (req, res) => {
  try {
    const bol = await BOL.findOne({ 
      bookingId: req.params.bookingId 
    }).sort('-createdAt');
    
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
    console.error('Get BOL error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Update booking with BOL info
router.put('/bookings/:bookingId/bol', auth, async (req, res) => {
  try {
    const booking = await Booking.findByIdAndUpdate(
      req.params.bookingId,
      {
        hasBOL: req.body.hasBOL,
        bolNumber: req.body.bolNumber,
        bolId: req.body.bolId,
        bolFileUrl: req.body.bolFileUrl,
        bolFileKey: req.body.bolFileKey,
        bolUpdatedAt: new Date()
      },
      { new: true }
    );
    
    if (!booking) {
      return res.status(404).json({
        success: false,
        error: 'Booking not found'
      });
    }
    
    res.json({
      success: true,
      booking
    });
  } catch (error) {
    console.error('Update booking BOL error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Get all BOLs for a booking
router.get('/booking/:bookingId', auth, async (req, res) => {
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
router.get('/:id', auth, async (req, res) => {
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
