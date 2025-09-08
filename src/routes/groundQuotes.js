const router = require('express').Router();
const GroundRequest = require('../models/GroundRequest');
const GroundCost = require('../models/GroundCost');
const GroundQuote = require('../models/GroundQuote');
const auth = require('../middleware/auth');

// Create ground quote request - FIXED PATH
router.post('/create', auth, async (req, res) => {
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

    // Create mock quotes immediately for testing
    const mockQuotes = await createMockQuotes(groundRequest);

    // Return response matching frontend expectations
    res.json({
      success: true,
      data: {
        _id: groundRequest._id.toString(),
        requestNumber: groundRequest.requestNumber,
        status: 'processing',
        message: 'Ground quote request created successfully'
      }
    });

  } catch (error) {
    console.error('❌ Ground quote creation error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create quote request'
    });
  }
});

// Get quote results - Support both /results and direct ID
router.get('/:requestId/results', auth, async (req, res) => {
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

    // Get quotes for this request
    const quotes = await GroundQuote.find({
      requestId: request._id,
      status: 'active'
    }).sort('customerPrice.total');

    // Format quotes for frontend
    const formattedQuotes = quotes.map(q => ({
      quoteId: q._id.toString(),
      carrier: q.carrier.name,
      service: q.carrier.service || 'Standard',
      price: q.customerPrice.total,
      transitDays: q.transit.days,
      guaranteed: q.transit.guaranteed || false,
      
      // Additional details the frontend expects
      service_details: {
        carrier: q.carrier.name,
        service: q.carrier.service || 'Standard',
        guaranteed: q.transit.guaranteed || false
      },
      raw_cost: q.rawCost.total,
      final_price: q.customerPrice.total,
      markup_percentage: q.markup.percentage || 18,
      transit_days: q.transit.days
    }));

    res.json({
      success: true,
      requestId: request._id.toString(),
      requestNumber: request.requestNumber,
      serviceType: request.serviceType,
      status: request.status === 'processing' ? 'complete' : request.status,
      formData: request.formData,
      quotes: formattedQuotes,
      error: request.error
    });

  } catch (error) {
    console.error('❌ Error fetching quote results:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Helper function to create mock quotes for testing
async function createMockQuotes(request) {
  const carriers = [
    { name: 'FedEx Freight', code: 'FXFE', days: 2, price: 450 },
    { name: 'YRC Freight', code: 'YRCW', days: 3, price: 380 },
    { name: 'Saia LTL Freight', code: 'SAIA', days: 3, price: 410 },
    { name: 'Estes Express', code: 'EXLA', days: 4, price: 350 }
  ];

  const quotes = [];
  
  for (const carrier of carriers) {
    const rawCost = carrier.price;
    const markup = rawCost * 0.18;
    const total = rawCost + markup;

    const quote = new GroundQuote({
      requestId: request._id,
      costId: new require('mongoose').Types.ObjectId(),
      requestNumber: request.requestNumber,
      userId: request.userId,
      
      carrier: {
        name: carrier.name,
        code: carrier.code,
        service: 'Standard LTL'
      },
      
      rawCost: {
        baseFreight: rawCost * 0.8,
        fuelSurcharge: rawCost * 0.15,
        accessorials: rawCost * 0.05,
        total: rawCost
      },
      
      markup: {
        type: 'percentage',
        percentage: 18,
        totalMarkup: markup
      },
      
      customerPrice: {
        subtotal: rawCost,
        fees: 0,
        tax: 0,
        total: total
      },
      
      transit: {
        days: carrier.days,
        businessDays: carrier.days,
        estimatedDelivery: new Date(Date.now() + (carrier.days * 24 * 60 * 60 * 1000)),
        guaranteed: false
      },
      
      status: 'active',
      validUntil: new Date(Date.now() + (7 * 24 * 60 * 60 * 1000))
    });

    await quote.save();
    quotes.push(quote);
  }

  // Update request status
  request.status = 'quoted';
  await request.save();

  return quotes;
}

module.exports = router;
