// src/routes/bookings.js
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Booking = require('../models/Booking');

// ⬇️ ADDED: auth/authorize for protected endpoints
const auth = require('../middleware/auth');

/**
 * Create a new booking (existing lightweight creator)
 * POST /api/bookings
 */
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

/**
 * NEW: Create detailed booking (customer-facing)
 * POST /api/bookings/detailed
 */
router.post('/detailed', auth, async (req, res) => {
  try {
    const bookingData = req.body;

    // Generate booking ID and confirmation number
    const timestamp = Date.now();
    const bookingId = `BK-${timestamp}`;
    const confirmationNumber = `CON-${new Date().getFullYear()}-${Math.floor(Math.random() * 100000)}`;

    // Create booking with detailed data
    const booking = new Booking({
      bookingId,
      confirmationNumber,
      userId: req.user.id,
      userEmail: req.user.email,
      mode: 'ground',
      requestId: bookingData.requestId,
      quoteId: bookingData.quoteId,
      serviceType: bookingData.serviceType || 'ftl',
      origin: bookingData.origin,
      destination: bookingData.destination,
      pickupDate: bookingData.pickupDate,
      deliveryDate: bookingData.deliveryDate,
      totalWeight: bookingData.totalWeight,
      totalPieces: bookingData.totalPieces,
      description: bookingData.description,
      commodityClass: bookingData.commodityClass,
      items: bookingData.items || [],
      referenceNumbers: bookingData.referenceNumbers || [],
      specialInstructions: bookingData.specialInstructions,
      status: 'PENDING_CARRIER',
      pickupNumber: '',

      // Also store in shipmentData for backward compatibility
      shipmentData: {
        formData: {
          originCity: bookingData.origin?.city,
          originState: bookingData.origin?.state,
          originZip: bookingData.origin?.zip,
          originCompany: bookingData.origin?.company,
          originAddress: bookingData.origin?.address,
          destCity: bookingData.destination?.city,
          destState: bookingData.destination?.state,
          destZip: bookingData.destination?.zip,
          destCompany: bookingData.destination?.company,
          destAddress: bookingData.destination?.address,
          weight: bookingData.totalWeight,
          pieces: bookingData.totalPieces,
          pickupDate: bookingData.pickupDate,
          description: bookingData.description
        },
        serviceType: bookingData.serviceType
      }
    });

    await booking.save();

    // TODO: emailService - notify admin of booking needing carrier assignment

    res.json({
      success: true,
      booking: {
        bookingId: booking.bookingId,
        confirmationNumber: booking.confirmationNumber,
        status: booking.status
      }
    });
  } catch (error) {
    console.error('Create detailed booking error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get all bookings (enhanced: role-based filtering if authenticated)
 * GET /api/bookings
 */
router.get('/', auth, async (req, res) => {
  try {
    const query = {};

    // If not admin/employee, only show user's own bookings
    if (!['admin', 'employee', 'system_admin'].includes(req.user.role)) {
      query.userId = req.user.id;
    }

    // Allow optional status filter
    if (req.query.status) {
      query.status = req.query.status;
    }

    const bookings = await Booking.find(query)
      .sort({ createdAt: -1 })
      .limit(100);

    res.json({ success: true, bookings });
  } catch (error) {
    console.error('Get bookings error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * NEW: Get bookings by status (admin/employee only)
 * GET /api/bookings/status/:status
 */
router.get('/status/:status', auth, authorize(['admin', 'employee']), async (req, res) => {
  try {
    const { status } = req.params;

    const bookings = await Booking.find({ status })
      .sort({ createdAt: -1 })
      .limit(100)
      .populate('userId', 'name email')
      .populate('assignedBy', 'name');

    res.json({
      success: true,
      bookings
    });
  } catch (error) {
    console.error('Get bookings by status error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * NEW: Assign carrier to booking (admin/employee only)
 * PUT /api/bookings/:bookingId/assign-carrier
 */
router.put('/:bookingId/assign-carrier', auth, authorize(['admin', 'employee']), async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { carrier, rate, pickupNumber, etaToPickup, notes, status } = req.body;

    const booking = await Booking.findOne({ bookingId });
    if (!booking) {
      return res.status(404).json({
        success: false,
        error: 'Booking not found'
      });
    }

    // Update carrier assignment
    booking.carrier = carrier;
    booking.rate = rate;
    booking.pickupNumber = pickupNumber;
    booking.etaToPickup = etaToPickup;
    booking.carrierNotes = notes;
    booking.assignedBy = req.user.id;
    booking.assignedAt = new Date();
    booking.status = status || 'CARRIER_ASSIGNED';

    // Backward compatibility in shipmentData
    if (!booking.shipmentData) booking.shipmentData = {};
    booking.shipmentData.carrierInfo = {
      name: carrier,
      carrierName: carrier,
      rate: rate,
      proNumber: pickupNumber
    };

    booking.updatedAt = new Date();
    await booking.save();

    // TODO: emailService - notify customer about carrier assignment

    res.json({
      success: true,
      booking
    });
  } catch (error) {
    console.error('Assign carrier error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * NEW: Update booking status (admin/employee only)
 * PUT /api/bookings/:bookingId/status
 */
router.put('/:bookingId/status', auth, authorize(['admin', 'employee']), async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { status } = req.body;

    const booking = await Booking.findOneAndUpdate(
      { bookingId },
      {
        status,
        updatedAt: new Date()
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
    console.error('Update booking status error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get booking by request ID (existing)
 * GET /api/bookings/by-request/:requestId
 */
router.get('/by-request/:requestId', async (req, res) => {
  try {
    const { requestId } = req.params;

    // Support either string or ObjectId storage in Booking.requestId
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
