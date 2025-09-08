const router = require('express').Router();
const GroundRequest = require('../models/GroundRequest');
const GroundCost = require('../models/GroundCost');
const GroundQuote = require('../models/GroundQuote');
const auth = require('../middleware/auth');

// Create ground quote request
router.post('/ground-quotes', auth, async (req, res) => {
  try {
    console.log('📥 Received ground quote request:', {
      serviceType: req.body.serviceType,
      origin: `${req.body.formData?.originCity}, ${req.body.formData?.originState}`,
      dest: `${req.body.formData?.destCity}, ${req.body.formData?.destState}`
    });

    // Create the request
    const groundRequest = new GroundRequest({
      userId: req.userId,
      serviceType: req.body.serviceType || 'ltl',
      status: 'processing',
      formData: req.body.formData || req.body
    });

    await groundRequest.save();
    console.log('✅ Ground request created:', groundRequest.requestNumber);

    // Send immediate response
    res.json({
      success: true,
      requestId: groundRequest._id.toString(),
      requestNumber: groundRequest.requestNumber,
      status: 'processing'
    });

    // Process quotes asynchronously
    setTimeout(async () => {
      await processGroundQuotes(groundRequest._id, req.userId);
    }, 1000);

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
    
    // Handle both MongoDB ObjectId and custom string IDs
    let request;
    if (req.params.requestId.match(/^[0-9a-fA-F]{24}$/)) {
      // MongoDB ObjectId
      request = await GroundRequest.findById(req.params.requestId);
    } else {
      // Custom request ID (for backward compatibility)
      request = await GroundRequest.findOne({ requestNumber: req.params.requestId });
    }
    
    if (!request) {
      return res.status(404).json({
        success: false,
        error: 'Quote request not found'
      });
    }

    // Get all quotes for this request
    const quotes = await GroundQuote.find({ 
      requestId: request._id,
      status: 'active'
    }).sort('ranking.position');

    // Format response to match frontend expectations
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
      // Duplicate fields for compatibility
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
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Process quotes asynchronously
async function processGroundQuotes(requestId, userId) {
  try {
    console.log('🔄 Processing quotes for request:', requestId);
    
    const request = await GroundRequest.findById(requestId);
    if (!request) return;

    // Simulate getting quotes from carriers
    const carriers = [
      {
        provider: 'SEFL',
        carrierName: 'Southeastern Freight Lines',
        carrierCode: 'SEFL',
        service: 'Standard LTL',
        baseFreight: 380,
        fuelSurcharge: 45,
        accessorials: 0,
        transitDays: 3,
        guaranteed: false
      },
      {
        provider: 'YRC',
        carrierName: 'YRC Freight',
        carrierCode: 'YRC',
        service: 'Priority LTL',
        baseFreight: 420,
        fuelSurcharge: 52,
        accessorials: 50, // Guaranteed service fee
        transitDays: 2,
        guaranteed: true
      },
      {
        provider: 'STG',
        carrierName: 'STG Logistics',
        carrierCode: 'STG',
        service: 'Economy LTL',
        baseFreight: 340,
        fuelSurcharge: 39.50,
        accessorials: 0,
        transitDays: 4,
        guaranteed: false
      }
    ];

    // Create costs and quotes for each carrier
    for (let i = 0; i < carriers.length; i++) {
      const carrier = carriers[i];
      
      // Calculate total cost
      const totalCost = carrier.baseFreight + carrier.fuelSurcharge + carrier.accessorials;
      
      // Create cost record (matching your GroundCost model structure)
      const cost = new GroundCost({
        requestId: requestId,
        requestNumber: request.requestNumber,
        provider: carrier.provider,
        carrierName: carrier.carrierName,
        carrierCode: carrier.carrierCode,
        service: carrier.service,
        serviceType: request.serviceType,
        costs: {
          baseFreight: carrier.baseFreight,
          fuelSurcharge: carrier.fuelSurcharge,
          fuelPercentage: (carrier.fuelSurcharge / carrier.baseFreight * 100).toFixed(2),
          accessorials: carrier.accessorials,
          totalAccessorials: carrier.accessorials,
          totalCost: totalCost
        },
        transit: {
          days: carrier.transitDays,
          businessDays: carrier.transitDays,
          guaranteed: carrier.guaranteed,
          estimatedPickup: new Date(Date.now() + 24 * 60 * 60 * 1000),
          estimatedDelivery: new Date(Date.now() + (carrier.transitDays + 1) * 24 * 60 * 60 * 1000)
        },
        status: 'completed',
        ranking: {
          score: 100 - (i * 10),
          factors: {
            price: 100 - (i * 15),
            transit: 100 - (carrier.transitDays * 10),
            reliability: 95,
            service: 90
          }
        },
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      });
      
      await cost.save();
      console.log(`✅ Created cost record for ${carrier.provider}`);
      
      // Calculate markup (18% default)
      const markupPercentage = 18;
      const markupAmount = totalCost * (markupPercentage / 100);
      const customerTotal = totalCost + markupAmount;
      
      // Create quote (matching your GroundQuote model structure)
      const quote = new GroundQuote({
        requestId: requestId,
        costId: cost._id,
        requestNumber: request.requestNumber,
        userId: userId,
        carrier: {
          name: carrier.carrierName,
          code: carrier.carrierCode,
          service: carrier.service
        },
        rawCost: {
          baseFreight: carrier.baseFreight,
          fuelSurcharge: carrier.fuelSurcharge,
          accessorials: carrier.accessorials,
          total: totalCost
        },
        markup: {
          type: 'percentage',
          percentage: markupPercentage,
          totalMarkup: markupAmount,
          calculation: {
            baseMarkup: carrier.baseFreight * (markupPercentage / 100),
            fuelMarkup: carrier.fuelSurcharge * (markupPercentage / 100),
            accessorialMarkup: carrier.accessorials * (markupPercentage / 100)
          }
        },
        customerPrice: {
          subtotal: customerTotal,
          fees: 0,
          tax: 0,
          total: customerTotal
        },
        transit: {
          days: carrier.transitDays,
          businessDays: carrier.transitDays,
          guaranteed: carrier.guaranteed,
          estimatedPickup: cost.transit.estimatedPickup,
          estimatedDelivery: cost.transit.estimatedDelivery
        },
        status: 'active',
        ranking: {
          position: i + 1,
          score: cost.ranking.score,
          recommended: i === 0,
          badges: i === 0 ? ['Best Value'] : i === 1 ? ['Fastest'] : ['Most Economical']
        },
        validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      });
      
      await quote.save();
      console.log(`✅ Created quote from ${carrier.carrierName}`);
    }
    
    // Update request status
    request.status = 'quoted';
    await request.save();
    
    console.log('✅ All quotes processed for request:', requestId);

  } catch (error) {
    console.error('❌ Error processing quotes:', error);
    
    // Mark request as failed
    await GroundRequest.findByIdAndUpdate(
      requestId,
      { 
        status: 'failed',
        error: error.message 
      }
    );
  }
}

module.exports = router;
