// backend/routes/bookingRequests.js
const express = require('express');
const router = express.Router();
const BookingRequest = require('../models/BookingRequest');
const Quote = require('../models/Quote'); // Your existing quote model
const Shipment = require('../models/Shipment'); // Your existing shipment model
const { authenticateToken, checkRole } = require('../middleware/auth');
const { sendEmail } = require('../services/emailService');

// 1. CREATE BOOKING REQUEST (Customer endpoint)
router.post('/create-request', authenticateToken, async (req, res) => {
  try {
    const {
      quoteId,
      pickup,
      delivery,
      cargo,
      services,
      documents,
      specialInstructions,
      pricing
    } = req.body;
    
    // Validate quote exists and belongs to user
    const quote = await Quote.findById(quoteId);
    if (!quote) {
      return res.status(404).json({ 
        success: false, 
        error: 'Quote not found' 
      });
    }
    
    // Create booking request
    const bookingRequest = new BookingRequest({
      quoteId,
      pickup,
      delivery,
      cargo,
      services,
      documents,
      pricing,
      specialInstructions,
      customerId: req.user.id,
      customerEmail: req.user.email,
      createdBy: req.user.email
    });
    
    await bookingRequest.save();
    
    // Update quote status
    quote.status = 'booking_pending';
    quote.bookingRequestId = bookingRequest._id;
    await quote.save();
    
    // Send notification to operations team
    await sendEmail({
      to: process.env.OPERATIONS_EMAIL,
      subject: `New Booking Request: ${bookingRequest.requestNumber}`,
      html: `
        <h2>New Booking Request Received</h2>
        <p>Request Number: ${bookingRequest.requestNumber}</p>
        <p>Customer: ${req.user.email}</p>
        <p>Route: ${pickup.city}, ${pickup.state} → ${delivery.city}, ${delivery.state}</p>
        <p>Ready Date: ${new Date(pickup.readyDate).toLocaleDateString()}</p>
        <p>Total Weight: ${cargo.totalWeight} lbs</p>
        <a href="${process.env.ADMIN_URL}/bookings/pending/${bookingRequest._id}">Review Request</a>
      `
    });
    
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

// 2. GET PENDING BOOKINGS (Employee endpoint)
router.get('/pending', authenticateToken, checkRole(['conship_employee', 'system_admin']), async (req, res) => {
  try {
    const { status = 'pending_review', page = 1, limit = 20 } = req.query;
    
    const bookings = await BookingRequest.find({ status })
      .populate('customerId', 'name email company')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);
    
    const total = await BookingRequest.countDocuments({ status });
    
    res.json({
      success: true,
      bookings,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / limit)
      }
    });
    
  } catch (error) {
    console.error('Error fetching pending bookings:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// 3. APPROVE BOOKING (Employee endpoint)
router.post('/:id/approve', authenticateToken, checkRole(['conship_employee', 'system_admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const { notes } = req.body;
    
    const booking = await BookingRequest.findById(id);
    if (!booking) {
      return res.status(404).json({ 
        success: false, 
        error: 'Booking request not found' 
      });
    }
    
    // Update booking status
    booking.status = 'approved';
    booking.reviewedAt = new Date();
    booking.reviewedBy = req.user.email;
    if (notes) booking.internalNotes = notes;
    
    await booking.save();
    
    // Generate BOL and labels here if needed
    // This could trigger a separate service
    
    // Notify customer
    await sendEmail({
      to: booking.customerEmail,
      subject: `Booking Confirmed: ${booking.requestNumber}`,
      html: `
        <h2>Your Booking is Confirmed!</h2>
        <p>Booking Number: ${booking.requestNumber}</p>
        <p>Your BOL and shipping labels will be sent shortly.</p>
        <p>You can track your shipment status in your dashboard.</p>
      `
    });
    
    res.json({
      success: true,
      message: 'Booking approved successfully'
    });
    
  } catch (error) {
    console.error('Error approving booking:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// 4. CONVERT TO SHIPMENT (Employee endpoint)
router.post('/:id/convert', authenticateToken, checkRole(['conship_employee', 'system_admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const { carrierId, carrierName, proNumber } = req.body;
    
    const booking = await BookingRequest.findById(id);
    if (!booking) {
      return res.status(404).json({ 
        success: false, 
        error: 'Booking request not found' 
      });
    }
    
    if (booking.status !== 'approved') {
      return res.status(400).json({ 
        success: false, 
        error: 'Booking must be approved before converting to shipment' 
      });
    }
    
    // Create shipment
    const shipment = new Shipment({
      bookingRequestId: booking._id,
      shipmentNumber: `SH-${Date.now()}`,
      status: 'SHIPMENT_CREATED',
