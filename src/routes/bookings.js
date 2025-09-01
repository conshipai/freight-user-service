// src/routes/bookings.js
const express = require('express');
const router = express.Router();
const Booking = require('../models/Booking');

// Create a new booking
router.post('/', async (req, res) => {
  try {
    const { quoteData, requestId, shipmentData } = req.body;
    
    // Generate unique IDs
    const bookingId = `BK-${Date.now()}`;
    const confirmationNumber = `CON-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 100000)).padStart(5, '0')}`;
    const pickupNumber = `PU-${String(Math.floor(Math.random() * 1000000)).padStart(7, '0')}`;
    
    // Create booking in database
    const booking = await Booking.create({
      bookingId,
      confirmationNumber,
      pickupNumber,
      requestId: requestId || null,
      mode: 'ground', // We'll make this dynamic later
      serviceType: shipmentData?.serviceType || 'ltl',
      carrier: quoteData?.service_details?.carrier || 'Unknown Carrier',
      price: quoteData?.final_price || 0,
      status: 'CONFIRMED',
      shipmentData: shipmentData || {},
      userEmail: req.body.userEmail || 'test@example.com'
    });
    
    res.json({
      success: true,
      booking
    });
  } catch (error) {
    console.error('Booking creation error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Get all bookings
router.get('/', async (req, res) => {
  try {
    const bookings = await Booking.find()
      .sort('-createdAt')
      .limit(100);
    
    res.json({
      success: true,
      bookings
    });
  } catch (error) {
    console.error('Get bookings error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

module.exports = router;
