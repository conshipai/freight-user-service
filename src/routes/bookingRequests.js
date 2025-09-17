// src/routes/bookingRequests.js
const express = require('express');
const router = express.Router();
const BookingRequest = require('../models/BookingRequest');
const auth = require('../middleware/auth');

// Test route to make sure it's working
router.get('/test', (req, res) => {
  res.json({ success: true, message: 'Booking routes working!' });
});

// Create booking request (any authenticated user)
router.post('/create-request', auth, async (req, res) => {
  try {
    const bookingRequest = new BookingRequest({
      ...req.body,
      customerId: req.userId,
      customerEmail: req.user.email,
      createdBy: req.user.email
    });
    
    await bookingRequest.save();
    
    res.json({
      success: true,
      bookingRequest: {
        id: bookingRequest._id,
        requestNumber: bookingRequest.requestNumber,
        status: bookingRequest.status
      }
    });
  } catch (error) {
    console.error('Error creating booking request:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Get pending bookings (employees only)
router.get('/pending', auth, auth.checkRole(['conship_employee', 'system_admin']), async (req, res) => {
  try {
    const bookings = await BookingRequest.find({ status: 'pending_review' })
      .sort({ createdAt: -1 });
    
    res.json({
      success: true,
      bookings
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

module.exports = router;
