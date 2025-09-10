//src/routes/shipments.js
const express = require('express');
const router = express.Router();
const Shipment = require('../models/Shipment');
const Booking = require('../models/Booking');
const auth = require('../middleware/auth');
const authorize = require('../middleware/authorize');
const { generateBOL } = require('../services/documentService');
const { sendShipmentNotification } = require('../services/emailService');

// Convert booking to shipment (Admin only)
router.post('/convert', auth, authorize(['system_admin', 'conship_employee']), async (req, res) => {
  try {
    const { bookingId, carrierInfo, costs, notes } = req.body;
    
    const booking = await Booking.findById(bookingId).populate('userId');
    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }
    
    // Create shipment from booking
    const shipment = new Shipment({
      bookingId: booking._id,
      customerId: booking.userId,
      createdBy: req.user._id,
      
      origin: booking.origin || booking.shipmentData?.formData,
      destination: booking.destination || {
        city: booking.shipmentData?.formData?.destCity,
        state: booking.shipmentData?.formData?.destState,
        zip: booking.shipmentData?.formData?.destZip
      },
      
      carrier: carrierInfo || {
        name: booking.carrier,
        proNumber: booking.pickupNumber
      },
      
      scheduledPickup: booking.pickupDate,
      scheduledDelivery: booking.deliveryDate,
      
      cargo: {
        pieces: booking.totalPieces,
        weight: booking.totalWeight,
        description: booking.description
      },
      
      costs: {
        originalQuote: booking.price,
        carrierCost: costs?.carrierCost || booking.rate,
        customerPrice: costs?.customerPrice || booking.price
      },
      
      notes: notes ? [{
        text: notes,
        createdBy: req.user._id,
        createdAt: new Date(),
        isInternal: true
      }] : []
    });
    
    await shipment.save();
    
    // Update booking status
    booking.status = 'CONVERTED_TO_SHIPMENT';
    booking.shipmentId = shipment._id;
    await booking.save();
    
    // Generate BOL
    const bolUrl = await generateBOL(shipment);
    shipment.bol = {
      number: `BOL-${shipment.shipmentNumber}`,
      generatedAt: new Date(),
      url: bolUrl
    };
    await shipment.save();
    
    // Send notification to customer
    await sendShipmentNotification(booking.userId.email, shipment);
    
    res.json({
      success: true,
      shipment,
      message: 'Booking converted to shipment successfully'
    });
    
  } catch (error) {
    console.error('Convert to shipment error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get all shipments (with filters)
router.get('/', auth, async (req, res) => {
  try {
    const { status, carrier, from, to, page = 1, limit = 20 } = req.query;
    
    const query = {};
    
    // Role-based filtering
    if (!['system_admin', 'conship_employee'].includes(req.user.role)) {
      query.customerId = req.user._id;
    }
    
    if (status) query.status = status;
    if (carrier) query['carrier.name'] = new RegExp(carrier, 'i');
    if (from) query.createdAt = { $gte: new Date(from) };
    if (to) query.createdAt = { ...query.createdAt, $lte: new Date(to) };
    
    const shipments = await Shipment.find(query)
      .populate('customerId', 'name email')
      .populate('createdBy', 'name')
      .sort('-createdAt')
      .limit(limit * 1)
      .skip((page - 1) * limit);
    
    const total = await Shipment.countDocuments(query);
    
    res.json({
      success: true,
      shipments,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / limit)
      }
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update shipment milestone
router.post('/:id/milestone', auth, authorize(['system_admin', 'conship_employee']), async (req, res) => {
  try {
    const { type, location, notes, gpsCoordinates } = req.body;
    
    const shipment = await Shipment.findById(req.params.id);
    if (!shipment) {
      return res.status(404).json({ error: 'Shipment not found' });
    }
    
    // Add milestone
    shipment.milestones.push({
      type,
      timestamp: new Date(),
      location,
      notes,
      recordedBy: req.user._id,
      gpsCoordinates
    });
    
    // Update status based on milestone
    const statusMap = {
      'DISPATCHED': 'DISPATCHED',
      'ONSITE': 'ONSITE',
      'LOADING': 'LOADING',
      'IN_TRANSIT': 'IN_TRANSIT',
      'AT_DESTINATION': 'AT_DESTINATION',
      'DELIVERED': 'DELIVERED'
    };
    
    if (statusMap[type]) {
      shipment.status = statusMap[type];
    }
    
    // Update actual dates
    if (type === 'LOADING') {
      shipment.actualPickup = new Date();
    } else if (type === 'DELIVERED') {
      shipment.actualDelivery = new Date();
    }
    
    await shipment.save();
    
    // Notify customer of milestone
    const customer = await User.findById(shipment.customerId);
    if (customer) {
      await sendMilestoneNotification(customer.email, shipment, type);
    }
    
    res.json({
      success: true,
      shipment,
      message: `Milestone ${type} recorded`
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Upload document
router.post('/:id/document', auth, authorize(['system_admin', 'conship_employee']), async (req, res) => {
  try {
    const { type, name, url } = req.body;
    
    const shipment = await Shipment.findById(req.params.id);
    if (!shipment) {
      return res.status(404).json({ error: 'Shipment not found' });
    }
    
    shipment.documents.push({
      type,
      name,
      url,
      uploadedBy: req.user._id,
      uploadedAt: new Date()
    });
    
    await shipment.save();
    
    res.json({
      success: true,
      message: 'Document uploaded successfully'
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Override costs
router.put('/:id/costs', auth, authorize(['system_admin', 'conship_employee']), async (req, res) => {
  try {
    const { carrierCost, customerPrice, additionalCharges } = req.body;
    
    const shipment = await Shipment.findById(req.params.id);
    if (!shipment) {
      return res.status(404).json({ error: 'Shipment not found' });
    }
    
    if (carrierCost !== undefined) shipment.costs.carrierCost = carrierCost;
    if (customerPrice !== undefined) shipment.costs.customerPrice = customerPrice;
    
    if (additionalCharges && Array.isArray(additionalCharges)) {
      additionalCharges.forEach(charge => {
        shipment.costs.additionalCharges.push({
          ...charge,
          addedBy: req.user._id,
          addedAt: new Date()
        });
      });
    }
    
    await shipment.save();
    
    res.json({
      success: true,
      costs: shipment.costs,
      message: 'Costs updated successfully'
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
