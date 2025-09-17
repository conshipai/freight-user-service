// backend/routes/bookingRequests.js
const express = require('express');
const router = express.Router();
const BookingRequest = require('../models/BookingRequest');
const Quote = require('../models/Quote');
const Shipment = require('../models/Shipment');

// Import your updated auth middleware
const { auth, checkRole, isEmployee } = require('../middleware/auth');

// For sending emails (if you have this service)
// const { sendEmail } = require('../services/emailService');

// 1. CREATE BOOKING REQUEST (Customer endpoint - any authenticated user)
router.post('/create-request', auth, async (req, res) => {
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
    
    // Validate quote exists
    const quote = await Quote.findById(quoteId);
    if (!quote) {
      return res.status(404).json({ 
        success: false, 
        error: 'Quote not found' 
      });
    }
    
    // Check if user owns the quote (unless they're an employee)
    const userRole = req.user.role || req.user.userType;
    const isEmployeeUser = ['conship_employee', 'system_admin', 'admin'].includes(userRole);
    
    if (!isEmployeeUser && quote.customerId?.toString() !== req.userId.toString()) {
      return res.status(403).json({ 
        success: false, 
        error: 'Access denied to this quote' 
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
      customerId: req.userId,  // Use req.userId from your auth
      customerEmail: req.user.email,
      createdBy: req.user.email
    });
    
    await bookingRequest.save();
    
    // Update quote status
    quote.status = 'booking_pending';
    quote.bookingRequestId = bookingRequest._id;
    await quote.save();
    
    // Send email notification if you have email service
    /*
    if (sendEmail) {
      await sendEmail({
        to: process.env.OPERATIONS_EMAIL || 'operations@company.com',
        subject: `New Booking Request: ${bookingRequest.requestNumber}`,
        html: `
          <h2>New Booking Request Received</h2>
          <p>Request Number: ${bookingRequest.requestNumber}</p>
          <p>Customer: ${req.user.email}</p>
          <p>Route: ${pickup.city}, ${pickup.state} → ${delivery.city}, ${delivery.state}</p>
        `
      });
    }
    */
    
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

// 2. GET PENDING BOOKINGS (Employee only)
router.get('/pending', auth, checkRole(['conship_employee', 'system_admin', 'admin']), async (req, res) => {
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

// 3. APPROVE BOOKING (Employee only)
router.post('/:id/approve', auth, isEmployee, async (req, res) => {
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
    
    // Send confirmation email if you have email service
    /*
    if (sendEmail && booking.customerEmail) {
      await sendEmail({
        to: booking.customerEmail,
        subject: `Booking Confirmed: ${booking.requestNumber}`,
        html: `Your booking ${booking.requestNumber} has been confirmed.`
      });
    }
    */
    
    res.json({
      success: true,
      message: 'Booking approved successfully',
      booking: {
        id: booking._id,
        requestNumber: booking.requestNumber,
        status: booking.status
      }
    });
    
  } catch (error) {
    console.error('Error approving booking:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// 4. CONVERT TO SHIPMENT (Employee only)
router.post('/:id/convert', auth, isEmployee, async (req, res) => {
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
      
      origin: {
        company: booking.pickup.company,
        address: booking.pickup.address,
        city: booking.pickup.city,
        state: booking.pickup.state,
        zip: booking.pickup.zip,
        contact: booking.pickup.contactName,
        phone: booking.pickup.contactPhone,
        email: booking.pickup.contactEmail
      },
      
      destination: {
        company: booking.delivery.company,
        address: booking.delivery.address,
        city: booking.delivery.city,
        state: booking.delivery.state,
        zip: booking.delivery.zip,
        contact: booking.delivery.contactName,
        phone: booking.delivery.contactPhone,
        email: booking.delivery.contactEmail
      },
      
      cargo: booking.cargo,
      
      carrier: {
        id: carrierId,
        name: carrierName,
        proNumber: proNumber
      },
      
      scheduledPickup: booking.pickup.readyDate,
      scheduledDelivery: booking.delivery.requiredDate,
      
      customerId: booking.customerId,
      pricing: booking.pricing,
      
      createdBy: req.user.email,
      createdAt: new Date()
    });
    
    await shipment.save();
    
    // Update booking
    booking.status = 'converted';
    booking.convertedAt = new Date();
    booking.shipmentId = shipment._id;
    await booking.save();
    
    res.json({
      success: true,
      shipment: {
        id: shipment._id,
        shipmentNumber: shipment.shipmentNumber
      }
    });
    
  } catch (error) {
    console.error('Error converting to shipment:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// 5. GET BOOKING STATUS (Customer can see their own, employees can see all)
router.get('/:id/status', auth, async (req, res) => {
  try {
    const { id } = req.params;
    
    const booking = await BookingRequest.findById(id)
      .select('requestNumber status createdAt reviewedAt convertedAt shipmentId customerId');
    
    if (!booking) {
      return res.status(404).json({ 
        success: false, 
        error: 'Booking not found' 
      });
    }
    
    // Check if user is employee or owns the booking
    const userRole = req.user.role || req.user.userType;
    const isEmployeeUser = ['conship_employee', 'system_admin', 'admin'].includes(userRole);
    
    if (!isEmployeeUser && booking.customerId.toString() !== req.userId.toString()) {
      return res.status(403).json({ 
        success: false, 
        error: 'Access denied' 
      });
    }
    
    let shipmentStatus = null;
    if (booking.shipmentId) {
      const shipment = await Shipment.findById(booking.shipmentId)
        .select('shipmentNumber status milestones');
      shipmentStatus = shipment;
    }
    
    res.json({
      success: true,
      booking: {
        ...booking.toObject(),
        shipment: shipmentStatus
      }
    });
    
  } catch (error) {
    console.error('Error fetching booking status:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// 6. GET MY BOOKINGS (Customer endpoint)
router.get('/my-bookings', auth, async (req, res) => {
  try {
    const bookings = await BookingRequest.find({ customerId: req.userId })
      .sort({ createdAt: -1 })
      .limit(50);
    
    res.json({
      success: true,
      bookings
    });
    
  } catch (error) {
    console.error('Error fetching user bookings:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

module.exports = router;
