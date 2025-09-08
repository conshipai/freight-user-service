const router = require('express').Router();
const GroundRequest = require('../models/GroundRequest');
const GroundCost = require('../models/GroundCost');
const GroundQuote = require('../models/GroundQuote');
const auth = require('../middleware/auth');

// 👇 NEW: use real processor
const { processGroundQuote } = require('../services/ground/processGroundQuote');

// Create ground quote request
router.post('/ground-quotes', auth, async (req, res) => {
  try {
    console.log('📥 Received ground quote request:', {
      serviceType: req.body.serviceType,
      origin: `${req.body.formData?.originCity}, ${req.body.formData?.originState}`,
      dest: `${req.body.formData?.destCity}, ${req.body.formData?.destState}`
    });

    // Create request
    const groundRequest = new GroundRequest({
      userId: req.userId,
      serviceType: req.body.serviceType || 'ltl',
      status: 'processing',
      formData: req.body.formData || req.body
    });

    await groundRequest.save();
    console.log('✅ Ground request created:', groundRequest.requestNumber);

    // Immediate response to frontend
    res.json({
      success: true,
      requestId: groundRequest._id.toString(),
      requestNumber: groundRequest.requestNumber,
      status: 'processing'
    });

    // Background processing (no mocks)
    setTimeout(async () => {
      try {
        await processGroundQuote(groundRequest._id, { userId: req.userId });
      } catch (err) {
        console.error('❌ processGroundQuote failed:', err);
        await GroundRequest.findByIdAndUpdate(groundRequest._id, {
          status: 'failed',
          error: err?.message || 'Failed to process ground quote'
        });
      }
    }, 1);

  } catch (error) {
    console.error('❌ Ground quote creation error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create quote request'
    });
  }
});

// Get quote results
router.get('/ground-quotes/:requestId/results', auth, async (req, res) => {
  try {
    console.log('📊 Fetching results for:', req.params.requestId);

    // Support ObjectId or legacy requestNumber
    let request;
    if (/^[0-9a-fA-F]{24}$/.test(req.params.requestId)) {
      request = await GroundRequest.findById(req.params.requestId);
    } else {
      request = await GroundRequest.findOne({ requestNumber: req.params.requestId });
    }

    if (!request) {
      return res.status(404).json({ success: false, error: 'Quote request not found' });
    }

    const quotes = await GroundQuote.find({
      requestId: request._id,
      status: 'active'
    }).sort('ranking.position');

    const formattedQuotes = quotes.map(q => ({
      quoteId: q._id.toString(),
      carrier: q.carrier.name,
      service: q.carrier.service,
      price: q.customerPrice.total,
      rawCost: q.rawCost.total,
      transitDays: q.transit.days,
      guaranteed: q.transit.guaranteed || false,
      markup: q.markup.percentage || 0,
      additionalFees: q.additionalFees || [],
      service_details: {
        carrier: q.carrier.name,
        service: q.carrier.service,
        guaranteed: q.transit.guaranteed || false
      },
      raw_cost: q.rawCost.total,
      final_price: q.customerPrice.total,
      markup_percentage: q.markup.percentage || 0,
      transit_days: q.transit.days
    }));

    res.json({
      success: true,
      requestId: request._id.toString(),
      requestNumber: request.requestNumber,
      serviceType: request.serviceType,
      status: request.status,
      formData: request.formData,
      quotes: formattedQuotes,
      error: request.error
    });
  } catch (error) {
    console.error('❌ Error fetching quote results:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
