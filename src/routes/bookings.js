// src/routes/bookings.js
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Booking = require('../models/Booking');
// If you use auth elsewhere and want it here too, import and add to routes:
// const authorize = require('../middleware/auth');

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
      mode: 'ground', // TODO: make dynamic later
      serviceType: shipmentData?.serviceType || 'ltl',
      carrier: quoteData?.service_details?.carrier || 'Unknown Carrier',
      price: quoteData?.final_price || 0,
      status: 'CONFIRMED',
      shipmentData: shipmentData || {},
      userEmail: req.body.userEmail || 'test@example.com'
    });

    res.json({ success: true, booking });
  } catch (error) {
    console.error('Booking creation error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get all bookings
router.get('/', async (req, res) => {
  try {
    const bookings = await Booking.find().sort('-createdAt').limit(100);
    res.json({ success: true, bookings });
  } catch (error) {
    console.error('Get bookings error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * NEW: Get booking by request ID
 * Example: GET /api/bookings/by-request/66e3b7f3a1d0c2e1e5fa0ed1
 * Returns: { success: true, booking: null | {...} }
 */
router.get('/by-request/:requestId', /* authorize(), */ async (req, res) => {
  try {
    const { requestId } = req.params;

    // Support either string or ObjectId storage in your Booking.requestId field
    let query = { requestId };
    if (mongoose.Types.ObjectId.isValid(requestId)) {
      query = { $or: [{ requestId }, { requestId: new mongoose.Types.ObjectId(requestId) }] };
    }

    const booking = await Booking.findOne(query).lean();
    return res.json({ success: true, booking: booking || null });
  } catch (error) {
    console.error('Get booking by request error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
