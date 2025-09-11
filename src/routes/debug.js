// src/routes/debug.js
const express = require('express');
const router = express.Router();

// Correct import - auth.js exports a default function
const auth = require('../middleware/auth');

// Import models
const Request = require('../models/Request');
const GroundRequest = require('../models/GroundRequest');
const Cost = require('../models/Cost');
const GroundCost = require('../models/GroundCost');
const Quote = require('../models/Quote');
const GroundQuote = require('../models/GroundQuote');
const Booking = require('../models/Booking');
const Shipment = require('../models/Shipment');

// Debug endpoint for ground quotes
router.get('/ground-chain/:requestId', auth, async (req, res) => {
  try {
    const { requestId } = req.params;
    
    // Get the ground request
    const request = await GroundRequest.findById(requestId);
    if (!request) {
      return res.status(404).json({ error: 'Ground request not found' });
    }
    
    // Get associated ground costs
    const costs = await GroundCost.find({ requestId });
    
    // Get associated ground quotes
    const quotes = await GroundQuote.find({ requestId });
    
    // Get booking if exists
    const booking = await Booking.findOne({ requestId });
    
    // Get shipment if exists
    const shipment = booking ? await Shipment.findOne({ bookingId: booking._id }) : null;
    
    res.json({
      success: true,
      type: 'ground',
      chain: {
        request: {
          id: request._id,
          requestNumber: request.requestNumber,
          serviceType: request.serviceType,
          status: request.status,
          formData: {
            origin: `${request.formData?.originCity}, ${request.formData?.originState}`,
            destination: `${request.formData?.destCity}, ${request.formData?.destState}`,
            commodities: request.formData?.commodities?.length || 0
          },
          createdAt: request.createdAt
        },
        costs: costs.map(c => ({
          id: c._id,
          provider: c.provider,
          amount: c.cost,
          service: c.service,
          transitDays: c.transitDays,
          createdAt: c.createdAt
        })),
        quotes: quotes.map(q => ({
          id: q._id,
          quoteId: q.quoteId,
          carrier: q.carrier,
          service: q.service,
          price: q.price,
          rawCost: q.rawCost,
          markup: q.markup,
          transitDays: q.transitDays,
          createdAt: q.createdAt
        })),
        booking: booking ? {
          id: booking._id,
          bookingId: booking.bookingId,
          confirmationNumber: booking.confirmationNumber,
          status: booking.status,
          carrier: booking.carrier,
          pickupNumber: booking.pickupNumber,
          createdAt: booking.createdAt
        } : null,
        shipment: shipment ? {
          id: shipment._id,
          shipmentNumber: shipment.shipmentNumber,
          status: shipment.status,
          milestones: shipment.milestones?.length || 0,
          createdAt: shipment.createdAt
        } : null
      }
    });
  } catch (error) {
    console.error('Debug ground chain error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Debug endpoint for air/ocean quotes
router.get('/air-ocean-chain/:requestId', auth, async (req, res) => {
  try {
    const { requestId } = req.params;
    
    // Get the request
    const request = await Request.findById(requestId);
    if (!request) {
      return res.status(404).json({ error: 'Air/Ocean request not found' });
    }
    
    // Get associated costs
    const costs = await Cost.find({ requestId });
    
    // Get associated quotes
    const quotes = await Quote.find({ requestId });
    
    // Get booking if exists
    const booking = await Booking.findOne({ requestId });
    
    // Get shipment if exists
    const shipment = booking ? await Shipment.findOne({ bookingId: booking._id }) : null;
    
    res.json({
      success: true,
      type: 'air-ocean',
      chain: {
        request: {
          id: request._id,
          requestNumber: request.requestNumber,
          mode: request.shipment?.mode,
          direction: request.shipment?.direction,
          status: request.status,
          shipment: {
            origin: request.shipment?.origin,
            destination: request.shipment?.destination,
            cargo: request.shipment?.cargo
          },
          createdAt: request.createdAt
        },
        costs: costs.map(c => ({
          id: c._id,
          provider: c.provider,
          amount: c.amount,
          breakdown: c.breakdown,
          createdAt: c.createdAt
        })),
        quotes: quotes.map(q => ({
          id: q._id,
          quoteId: q.quoteId,
          carrier: q.carrier,
          service: q.service,
          totalPrice: q.totalPrice,
          rawCost: q.rawCost,
          markup: q.markup,
          transitTime: q.transitTime,
          createdAt: q.createdAt
        })),
        booking: booking ? {
          id: booking._id,
          bookingId: booking.bookingId,
          confirmationNumber: booking.confirmationNumber,
          status: booking.status,
          createdAt: booking.createdAt
        } : null,
        shipment: shipment ? {
          id: shipment._id,
          shipmentNumber: shipment.shipmentNumber,
          status: shipment.status,
          createdAt: shipment.createdAt
        } : null
      }
    });
  } catch (error) {
    console.error('Debug air/ocean chain error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get all active quotes summary
router.get('/all-quotes', auth, async (req, res) => {
  try {
    const { limit = 20 } = req.query;
    
    // Get recent ground requests
    const groundRequests = await GroundRequest.find()
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));
    
    // Get recent air/ocean requests
    const airOceanRequests = await Request.find()
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));
    
    // Combine and format
    const allQuotes = [
      ...groundRequests.map(r => ({
        type: 'ground',
        requestId: r._id,
        requestNumber: r.requestNumber,
        serviceType: r.serviceType,
        status: r.status,
        origin: `${r.formData?.originCity}, ${r.formData?.originState}`,
        destination: `${r.formData?.destCity}, ${r.formData?.destState}`,
        createdAt: r.createdAt
      })),
      ...airOceanRequests.map(r => ({
        type: 'air-ocean',
        requestId: r._id,
        requestNumber: r.requestNumber,
        mode: r.shipment?.mode,
        direction: r.shipment?.direction,
        status: r.status,
        origin: r.shipment?.origin?.city,
        destination: r.shipment?.destination?.city,
        createdAt: r.createdAt
      }))
    ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    res.json({
      success: true,
      quotes: allQuotes.slice(0, parseInt(limit)),
      counts: {
        ground: groundRequests.length,
        airOcean: airOceanRequests.length,
        total: allQuotes.length
      }
    });
  } catch (error) {
    console.error('Debug all quotes error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Verify data consistency
router.get('/verify/:requestId', auth, async (req, res) => {
  try {
    const { requestId } = req.params;
    const issues = [];
    
    // Check if it's ground or air/ocean
    let request = await GroundRequest.findById(requestId);
    let isGround = true;
    
    if (!request) {
      request = await Request.findById(requestId);
      isGround = false;
    }
    
    if (!request) {
      return res.status(404).json({ error: 'Request not found in either collection' });
    }
    
    if (isGround) {
      // Check ground flow
      const costs = await GroundCost.find({ requestId });
      const quotes = await GroundQuote.find({ requestId });
      
      if (request.status === 'quoted' && quotes.length === 0) {
        issues.push('Request marked as quoted but no quotes found');
      }
      
      if (quotes.length > 0 && costs.length === 0) {
        issues.push('Quotes exist but no costs found');
      }
      
      // Check for orphaned quotes
      for (const quote of quotes) {
        const hasCost = costs.some(c => 
          c.provider === quote.carrier && 
          Math.abs(c.cost - quote.rawCost) < 0.01
        );
        if (!hasCost) {
          issues.push(`Quote ${quote._id} has no matching cost record`);
        }
      }
    } else {
      // Check air/ocean flow
      const costs = await Cost.find({ requestId });
      const quotes = await Quote.find({ requestId });
      
      if (request.status === 'quoted' && quotes.length === 0) {
        issues.push('Request marked as quoted but no quotes found');
      }
      
      if (quotes.length > 0 && costs.length === 0) {
        issues.push('Quotes exist but no costs found');
      }
    }
    
    // Check booking consistency
    const booking = await Booking.findOne({ requestId });
    if (booking) {
      if (!booking.confirmationNumber) {
        issues.push('Booking exists but has no confirmation number');
      }
      
      const shipment = await Shipment.findOne({ bookingId: booking._id });
      if (booking.status === 'CONFIRMED' && !shipment) {
        issues.push('Booking confirmed but no shipment created');
      }
    }
    
    res.json({
      success: true,
      type: isGround ? 'ground' : 'air-ocean',
      requestId,
      requestNumber: request.requestNumber,
      status: request.status,
      issues: issues.length > 0 ? issues : ['No issues found'],
      healthy: issues.length === 0
    });
  } catch (error) {
    console.error('Verify error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
