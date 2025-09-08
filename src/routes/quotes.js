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

// ✅ NEW MODELS for ground integration
const GroundRequest = require('../models/GroundRequest');
const GroundQuote = require('../models/GroundQuote');

// ---------------------------------------------------------
// Define processQuoteRequest here (needed by /create route)
// ---------------------------------------------------------
async function processQuoteRequest(requestId) {
  try {
    console.log('[quotes] Processing quote request:', requestId);

    await Request.findByIdAndUpdate(
      requestId,
      { status: 'processing', processingStartedAt: new Date() },
      { new: true }
    );

    // TODO: Implement provider processing

    console.log('[quotes] Finished (skeleton) processing for:', requestId);
  } catch (error) {
    console.error('[quotes] Error processing quote:', error);
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

    const reqSeq = await Sequence.findOneAndUpdate(
      { type: 'REQ', year },
      { $inc: { counter: 1 } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    const sequenceNumber = reqSeq.counter;

    const ids = {
      requestId: `REQ-${year}-${sequenceNumber}`,
      quoteId: `Q-${year}-${sequenceNumber}`,
      costId: `COST-${year}-${sequenceNumber}`
    };

    res.json({ success: true, ...ids });
  } catch (err) {
    console.error('Init quote error:', err);
    res.status(500).json({ success: false, error: 'Failed to initialize quote' });
  }
});

// ---------------------------------------------------------
// 🔹 UNIFIED ENDPOINTS (replace old /recent)
// ---------------------------------------------------------

/**
 * UNIFIED Recent Quotes - Shows BOTH air and ground quotes
 * GET /api/quotes/recent?limit=10
 */
router.get('/recent', authorize(), async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    const limitNum = parseInt(limit, 10);

    const query = {};
    if (req.user.role !== 'system_admin') {
      query.userId = req.user._id;
    }

    const [airQuotes, groundQuotes] = await Promise.all([
      Request.find(query).sort('-createdAt').limit(limitNum).lean(),
      GroundRequest.find(query).sort('-createdAt').limit(limitNum).lean()
    ]);

    const allQuotes = [];

    for (const quote of airQuotes) {
      const booking = await Booking.findOne({ requestId: quote._id }).lean();
      allQuotes.push({
        _id: quote._id,
        requestNumber: quote.requestNumber,
        mode: 'air',
        origin: quote.shipment?.origin,
        destination: quote.shipment?.destination,
        weight: quote.shipment?.cargo?.totalWeight,
        pieces: quote.shipment?.cargo?.totalPieces,
        status: quote.status,
        isBooked: !!booking,
        bookingId: booking?.bookingId,
        createdAt: quote.createdAt,
        hasCosts: false
      });
    }

    for (const quote of groundQuotes) {
      const booking = await Booking.findOne({ requestId: quote._id }).lean();
      const bestQuote = await GroundQuote.findOne({
        requestId: quote._id,
        status: 'active'
      }).sort('customerPrice.total').lean();

      allQuotes.push({
        _id: quote._id,
        requestNumber: quote.requestNumber,
        mode: 'ground',
        serviceType: quote.serviceType || 'ltl',
        origin: {
          city: quote.formData?.originCity,
          state: quote.formData?.originState,
          zipCode: quote.formData?.originZip
        },
        destination: {
          city: quote.formData?.destCity,
          state: quote.formData?.destState,
          zipCode: quote.formData?.destZip
        },
        weight: quote.formData?.commodities?.reduce((sum, c) => sum + (c.quantity * c.weight), 0) || 0,
        pieces: quote.formData?.commodities?.reduce((sum, c) => sum + c.quantity, 0) || 0,
        status: quote.status,
        isBooked: !!booking,
        bookingId: booking?.bookingId,
        createdAt: quote.createdAt,
        bestPrice: bestQuote?.customerPrice?.total,
        carrierCount: await GroundQuote.countDocuments({ requestId: quote._id, status: 'active' })
      });
    }

    allQuotes.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const finalQuotes = allQuotes.slice(0, limitNum);

    res.json({
      success: true,
      quotes: finalQuotes,
      counts: { air: airQuotes.length, ground: groundQuotes.length, total: finalQuotes.length }
    });
  } catch (error) {
    console.error('Error fetching recent quotes:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Get specific quote details (air or ground)
 * GET /api/quotes/details/:id
 */
router.get('/details/:id', authorize(), async (req, res) => {
  try {
    const { id } = req.params;

    let quote = await Request.findById(id).lean();
    let mode = 'air';
    let rates = [];

    if (quote) {
      const costs = await Cost.find({ requestId: id, status: 'completed' }).lean();
      rates = costs.map(c => ({
        provider: c.provider,
        carrier: c.carrier,
        service: c.service,
        cost: c.costs.totalCost,
        transitTime: c.transitTime
      }));
    } else {
      quote = await GroundRequest.findById(id).lean();
      mode = 'ground';
      if (quote) {
        const groundQuotes = await GroundQuote.find({ requestId: id, status: 'active' })
          .sort('customerPrice.total').lean();

        rates = groundQuotes.map(q => ({
          quoteId: q._id,
          carrier: q.carrier.name,
          service: q.carrier.service || 'Standard LTL',
          price: q.customerPrice.total,
          rawCost: q.rawCost.total,
          markup: q.markup.totalMarkup,
          transitDays: q.transit.days,
          guaranteed: q.transit.guaranteed
        }));
      }
    }

    if (!quote) {
      return res.status(404).json({ success: false, error: 'Quote not found' });
    }

    const booking = await Booking.findOne({ requestId: id }).lean();

    res.json({ success: true, quote: { ...quote, mode, rates, isBooked: !!booking, booking } });
  } catch (error) {
    console.error('Error fetching quote details:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Book a quote (air or ground)
 * POST /api/quotes/book
 */
router.post('/book', authorize(), async (req, res) => {
  try {
    const { requestId, quoteId, mode } = req.body;

    const existingBooking = await Booking.findOne({ requestId });
    if (existingBooking) {
      return res.status(400).json({ success: false, error: 'This quote has already been booked', bookingId: existingBooking.bookingId });
    }

    let quoteData;
    let shipmentData;

    if (mode === 'ground') {
      const groundQuote = await GroundQuote.findById(quoteId).lean();
      const groundRequest = await GroundRequest.findById(requestId).lean();
      if (!groundQuote || !groundRequest) {
        return res.status(404).json({ success: false, error: 'Quote not found' });
      }

      quoteData = { carrier: groundQuote.carrier.name, service: groundQuote.carrier.service, price: groundQuote.customerPrice.total, transitDays: groundQuote.transit.days };
      shipmentData = groundRequest.formData;

      await GroundQuote.findByIdAndUpdate(quoteId, { status: 'booked', selected: true, selectedAt: new Date(), bookedAt: new Date() });
    } else {
      const airRequest = await Request.findById(requestId).lean();
      const cost = await Cost.findById(quoteId).lean();
      if (!airRequest || !cost) {
        return res.status(404).json({ success: false, error: 'Quote not found' });
      }

      quoteData = { carrier: cost.carrier, service: cost.service, price: cost.costs.totalCost, transitTime: cost.transitTime };
      shipmentData = airRequest.shipment;
    }

    const bookingId = `BK-${Date.now()}`;
    const confirmationNumber = `CON-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 100000)).padStart(5, '0')}`;
    const pickupNumber = `PU-${String(Math.floor(Math.random() * 1000000)).padStart(7, '0')}`;

    const booking = await Booking.create({
      bookingId,
      confirmationNumber,
      pickupNumber,
      requestId,
      mode: mode || 'ground',
      serviceType: quoteData.service,
      carrier: quoteData.carrier,
      price: quoteData.price,
      status: 'CONFIRMED',
      shipmentData,
      userId: req.user._id,
      userEmail: req.user.email
    });

    if (mode === 'ground') {
      await GroundRequest.findByIdAndUpdate(requestId, { status: 'booked' });
    } else {
      await Request.findByIdAndUpdate(requestId, { status: 'booked' });
    }

    res.json({
      success: true,
      message: 'Booking confirmed!',
      booking: {
        bookingId: booking.bookingId,
        confirmationNumber: booking.confirmationNumber,
        pickupNumber: booking.pickupNumber,
        carrier: booking.carrier,
        price: booking.price,
        status: booking.status
      }
    });
  } catch (error) {
    console.error('Booking error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ---------------------------------------------------------
// Existing create route remains untouched
// ---------------------------------------------------------
router.post('/create', authorize(), async (req, res) => {
  try {
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

    processQuoteRequest(request._id);

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
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
