// src/routes/quotes.js
const express = require('express');
const router = express.Router();
const Request = require('../models/Request');
const Cost = require('../models/Cost');
const Quote = require('../models/Quote');
const RateProvider = require('../models/RateProvider');
const ProviderFactory = require('../services/providers/ProviderFactory');
const { authorize } = require('../middleware/authorize');
const Booking = require('../models/Booking'); // ADDED

// ---------------------------------------------------------
// Define processQuoteRequest here (needed by /create route)
// ---------------------------------------------------------
async function processQuoteRequest(requestId) {
  try {
    console.log('[quotes] Processing quote request:', requestId);

    // (Optional but helpful) mark the request as processing if it exists
    await Request.findByIdAndUpdate(
      requestId,
      { status: 'processing', processingStartedAt: new Date() },
      { new: true }
    );

    // TODO: Implement your actual provider processing here.

    console.log('[quotes] Finished (skeleton) processing for:', requestId);
  } catch (error) {
    console.error('[quotes] Error processing quote:', error);
    // best-effort status update (don’t throw here to avoid unhandled rejection in /create)
    try {
      await Request.findByIdAndUpdate(
        requestId,
        { status: 'failed', failureReason: error.message, processingEndedAt: new Date() }
      );
    } catch (e) {
      console.error('[quotes] Failed updating request failure state:', e);
    }
  }
}

// 🔹 Add this new endpoint BEFORE the existing /create endpoint
router.post('/init', async (req, res) => {
  try {
    const year = new Date().getFullYear();
    const Sequence = require('../models/Sequence');

    // Generate base sequence
    const reqSeq = await Sequence.findOneAndUpdate(
      { type: 'REQ', year },
      { $inc: { counter: 1 } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    const sequenceNumber = reqSeq.counter;

    // Generate all three IDs with same sequence number
    const ids = {
      requestId: `REQ-${year}-${sequenceNumber}`,
      quoteId: `Q-${year}-${sequenceNumber}`,
      costId: `COST-${year}-${sequenceNumber}`
    };

    res.json({
      success: true,
      ...ids
    });
  } catch (err) {
    console.error('Init quote error:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to initialize quote'
    });
  }
});

/**
 * STEP 7 — Unified Recent Quotes (all modes)
 * GET /api/quotes/recent?limit=10
 */
router.get('/recent', authorize(), async (req, res) => {
  try {
    const { limit = 10 } = req.query;

    // Limit visibility for non-admins
    const query = {};
    if (req.user.role !== 'system_admin') {
      query.userId = req.user._id;
    }

    const requests = await Request.find(query)
      .sort('-createdAt')
      .limit(parseInt(limit, 10))
      .lean();

    // Attach booking status for each request
    const requestsWithStatus = await Promise.all(
      requests.map(async (request) => {
        const booking = await Booking.findOne({ requestId: request._id }).lean();
        return {
          ...request,
          isBooked: !!booking,
          bookingId: booking?.bookingId
        };
      })
    );

    res.json({ success: true, requests: requestsWithStatus });
  } catch (error) {
    console.error('Error fetching recent quotes:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create new quote request
router.post('/create', authorize(), async (req, res) => {
  try {
    // Create request document
    const request = await Request.create({
      userId: req.user._id,
      userEmail: req.user.email,
      company: req.user.company,
      shipment: req.body.shipment,
      insurance: req.body.insurance,
      dangerousGoods: req.body.dangerousGoods,
      batteryDetails: req.body.batteryDetails,
      hasDangerousGoods: !!req.body.dangerousGoods,
      hasBatteries: !!req.body.batteryDetails,
      status: 'pending'
    });

    // Start async rate fetching (don’t await—return immediately)
    processQuoteRequest(request._id);

    // Return immediately
    res.json({
      success: true,
      data: {
        _id: request._id,
        requestNumber: request.requestNumber,
        status: 'processing',
        message: 'Quote request received. Fetching rates from carriers...'
      }
    });
  } catch (error) {
    console.error('Quote creation error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
