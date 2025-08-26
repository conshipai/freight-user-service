// src/routes/quotes.js
const express = require('express');
const router = express.Router();
const Request = require('../models/Request');
const Cost = require('../models/Cost');
const Quote = require('../models/Quote');
const RateProvider = require('../models/RateProvider');
const ProviderFactory = require('../services/providers/ProviderFactory');
const { authorize } = require('../middleware/authorize');

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
    // Example skeleton (commented so it doesn’t break your current flow):
    //
    // const request = await Request.findById(requestId);
    // if (!request) throw new Error('Request not found');
    //
    // // Use your ProviderFactory to get the active providers and fetch rates
    // const providers = await RateProvider.find({ active: true });
    // const providerClients = providers.map(p => ProviderFactory.create(p));
    //
    // const allRates = [];
    // for (const client of providerClients) {
    //   try {
    //     const rates = await client.getAirRates(request); // or getOceanRates, etc.
    //     if (rates?.length) allRates.push(...rates);
    //   } catch (e) {
    //     console.error(`[quotes] Provider ${client.name} failed:`, e.message);
    //   }
    // }
    //
    // // Persist raw costs (optional)
    // if (allRates.length) {
    //   await Cost.create({
    //     requestId,
    //     items: allRates,
    //     source: 'providers',
    //     createdAt: new Date()
    //   });
    // }
    //
    // // Optionally create/refresh a Quote record
    // await Quote.findOneAndUpdate(
    //   { requestId },
    //   { requestId, status: 'rated', lastRatedAt: new Date(), rateCount: allRates.length },
    //   { upsert: true, new: true, setDefaultsOnInsert: true }
    // );
    //
    // await Request.findByIdAndUpdate(requestId, { status: 'completed' });

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
