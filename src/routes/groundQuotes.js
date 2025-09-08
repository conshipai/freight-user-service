// src/routes/groundQuotes.js - SIMPLIFIED
const router = require('express').Router();
const GroundRequest = require('../models/GroundRequest');
const GroundQuote = require('../models/GroundQuote');
const auth = require('../middleware/auth');
const { processGroundQuote } = require('../services/ground/processGroundQuote');

// Create request - that's it
router.post('/create', auth, async (req, res) => {
  try {
    // Just save the request
    const groundRequest = new GroundRequest({
      userId: req.userId,
      serviceType: req.body.serviceType || 'ltl',
      status: 'processing',
      formData: req.body.formData
    });
    
    await groundRequest.save();
    
    // Return the ID
    res.json({
      success: true,
      data: {
        _id: groundRequest._id.toString(),
        requestNumber: groundRequest.requestNumber,
        status: 'processing'
      }
    });
    
    // Process in background
    processGroundQuote(groundRequest._id);
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get results - just read from DB
router.get('/:requestId/results', auth, async (req, res) => {
  try {
    const request = await GroundRequest.findById(req.params.requestId);
    if (!request) {
      return res.status(404).json({ success: false, error: 'Not found' });
    }
    
    // Get quotes from DB
    const quotes = await GroundQuote.find({
      requestId: request._id,
      status: 'active'
    }).sort('customerPrice.total');
    
    // Return what's in DB
    res.json({
      success: true,
      requestId: request._id.toString(),
      requestNumber: request.requestNumber,
      status: request.status,
      formData: request.formData,
      quotes: quotes.map(q => ({
        quoteId: q._id.toString(),
        carrier: q.carrier.name,
        service: q.carrier.service,
        price: q.customerPrice.total,
        transitDays: q.transit.days,
        raw_cost: q.rawCost.total,
        final_price: q.customerPrice.total
      }))
    });
    
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
