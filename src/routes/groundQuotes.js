// routes/groundQuotes.js
const express = require('express');
const router = express.Router();
const GroundRequest = require('../models/GroundRequest');
const GroundCost = require('../models/GroundCost');
const GroundQuote = require('../models/GroundQuote');
const { processGroundQuote } = require('../services/ground/processGroundQuote');

// Create a new ground quote request
router.post('/create', async (req, res) => {
  try {
    console.log('📦 Creating ground quote request...');
    const { serviceType, formData } = req.body;
    
    const groundRequest = new GroundRequest({
      userId: req.user?._id || '000000000000000000000000',
      userEmail: req.user?.email || 'test@example.com',
      company: req.user?.company || 'Test Company',
      serviceType: serviceType,
      origin: {
        zipCode: formData.originZip,
        city: formData.originCity,
        state: formData.originState
      },
      destination: {
        zipCode: formData.destZip,
        city: formData.destCity,
        state: formData.destState
      },
      pickupDate: formData.pickupDate,
      ltlDetails: serviceType === 'ltl' ? {
        commodities: formData.commodities.map(c => ({
          unitType: c.unitType,
          quantity: parseInt(c.quantity),
          weight: parseFloat(c.weight),
          length: parseFloat(c.length),
          width: parseFloat(c.width),
          height: parseFloat(c.height),
          description: c.description,
          freightClass: c.useOverride ? c.overrideClass : c.calculatedClass,
          stackable: c.stackable !== false
        }))
      } : undefined,
      accessorials: {
        liftgatePickup: formData.liftgatePickup,
        liftgateDelivery: formData.liftgateDelivery,
        residentialDelivery: formData.residentialDelivery,
        insideDelivery: formData.insideDelivery,
        limitedAccessPickup: formData.limitedAccessPickup,
        limitedAccessDelivery: formData.limitedAccessDelivery
      },
      status: 'pending'
    });
    
    await groundRequest.save();
    console.log('✅ Ground request created:', groundRequest.requestNumber);
    
    // Start async processing
    processGroundQuote(groundRequest._id);
    
    res.json({
      success: true,
      data: {
        _id: groundRequest._id,
        requestNumber: groundRequest.requestNumber,
        status: 'processing',
        message: 'Fetching rates from carriers...'
      }
    });
    
  } catch (error) {
    console.error('❌ Ground quote creation error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get quote results
router.get('/results/:requestId', async (req, res) => {
  try {
    const request = await GroundRequest.findById(req.params.requestId);
    if (!request) {
      return res.status(404).json({ success: false, error: 'Request not found' });
    }
    
    const quotes = await GroundQuote.find({ 
      requestId: req.params.requestId,
      status: 'active'
    }).sort('ranking.position');
    
    res.json({
      success: true,
      status: request.status,
      requestNumber: request.requestNumber,
      quotes: quotes.map(q => ({
        quoteId: q._id,
        carrier: q.carrier.name,
        service: q.carrier.service,
        price: q.customerPrice.total,
        rawCost: q.rawCost.total,
        markup: q.markup.totalMarkup,
        transitDays: q.transit.businessDays,
        guaranteed: q.transit.guaranteed
      }))
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
