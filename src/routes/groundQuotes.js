// routes/groundQuotes.js
const express = require('express');
const router = express.Router();
const GroundRequest = require('../models/GroundRequest');
const GroundCost = require('../models/GroundCost');
const GroundQuote = require('../models/GroundQuote');
const { processGroundQuote } = require('../services/ground/processGroundQuote');
const { authorize } = require('../middleware/authorize');

/** Middleware: block foreign partners from using Ground quotes */
function blockForeignPartners(req, res, next) {
  const role = req.user?.role;
  if (role === 'foreign_partner' || role === 'foreign_partner_user') {
    return res.status(403).json({
      success: false,
      error: 'Ground quotes are not available for foreign partners. Please use Air or Ocean quote modules.'
    });
  }
  return next();
}

// Create a new ground quote request
router.post('/create', authorize(), blockForeignPartners, async (req, res) => {
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

    // Kick off async processing
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

// Get quote results (apply markup at view time)
router.get('/results/:requestId', authorize(), blockForeignPartners, async (req, res) => {
  try {
    const request = await GroundRequest.findById(req.params.requestId);
    if (!request) {
      return res.status(404).json({ success: false, error: 'Request not found' });
    }

    const quotes = await GroundQuote.find({
      requestId: req.params.requestId,
      status: 'active'
    }).sort('ranking.position');

    // Apply markup based on the user viewing the quotes
    const MarkupCalculator = require('../services/MarkupCalculator');

    const pricedQuotes = await Promise.all(
      quotes.map(async (quote) => {
        const pricing = await MarkupCalculator.calculateQuotePrice(
          quote,
          req.user?._id || request.userId,
          req.user?.companyId || request.companyId
        );

        return {
          quoteId: quote._id,
          carrier: quote.carrier.name,
          carrierCode: quote.carrier.code,
          service: quote.carrier.service,
          accountType: quote.carrier.accountType,
          accountLabel: pricing.isCustomerAccount ? pricing.accountLabel : 'Conship Rates',

          // Pricing visibility based on role / account type
          rawCost: pricing.showingDirectCost ? quote.rawCost.total : undefined,
          price: pricing.total,
          markup: pricing.showingDirectCost ? pricing.markupAmount : undefined,
          additionalFees: pricing.additionalFees,

          transitDays: quote.transit.businessDays,
          guaranteed: quote.transit.guaranteed
        };
      })
    );

    res.json({
      success: true,
      status: request.status,
      requestNumber: request.requestNumber,
      quotes: pricedQuotes
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/* ------------------------- NEW: Recent Ground Quotes ------------------------- */
// Get recent ground quotes for dashboard
router.get('/recent', authorize(), blockForeignPartners, async (req, res) => {
  try {
    const { limit = 10 } = req.query;

    // Get recent requests for the current user or all if admin
    const query = {};
    if (req.user.role !== 'system_admin') {
      query.userId = req.user._id;
    }

    const requests = await GroundRequest.find(query)
      .sort('-createdAt')
      .limit(parseInt(limit, 10))
      .lean();

    // For each request, get the quote count
    const requestsWithQuotes = await Promise.all(
      requests.map(async (request) => {
        const quoteCount = await GroundQuote.countDocuments({
          requestId: request._id,
          status: 'active'
        });

        return {
          ...request,
          quoteCount
        };
      })
    );

    res.json({
      success: true,
      requests: requestsWithQuotes
    });
  } catch (error) {
    console.error('Error fetching recent quotes:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});
/* --------------------------------------------------------------------------- */

module.exports = router;
