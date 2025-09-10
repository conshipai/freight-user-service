// src/routes/quotes.js - FIXED VERSION
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose'); // Add this for ObjectId handling
const Request = require('../models/Request');
const Cost = require('../models/Cost');
const Quote = require('../models/Quote');
const RateProvider = require('../models/RateProvider');
const ProviderFactory = require('../services/providers/ProviderFactory');
const authorize = require('../middleware/authorize'); // FIXED: No destructuring
const auth = require('../middleware/auth'); // Add auth middleware too
const Booking = require('../models/Booking');

// Ground models
const GroundRequest = require('../models/GroundRequest');
const GroundQuote = require('../models/GroundQuote');

// ... (keep processQuoteRequest function as is)

/**
 * UNIFIED Recent Quotes - Shows BOTH air and ground quotes
 * GET /api/quotes/recent?limit=50
 */
router.get('/recent', auth, async (req, res) => {  // Use auth instead of authorize()
  try {
    const { limit = 50 } = req.query;
    const limitNum = parseInt(limit, 10);

    // Debug logging
    console.log('=== /api/quotes/recent ===');
    console.log('User:', req.user?.email);
    console.log('User ID:', req.user?._id);
    console.log('User Role:', req.user?.role);

    // Build query based on user role
    const query = {};
    
    // Only filter by userId if not system_admin
    if (req.user?.role !== 'system_admin') {
      // Ensure userId is in the correct format
      if (mongoose.Types.ObjectId.isValid(req.user._id)) {
        query.userId = req.user._id;
      } else if (typeof req.user._id === 'string') {
        query.userId = new mongoose.Types.ObjectId(req.user._id);
      } else {
        query.userId = req.user._id;
      }
    }

    console.log('Query:', JSON.stringify(query));

    // Fetch both air and ground quotes
    const [airQuotes, groundQuotes] = await Promise.all([
      Request.find(query).sort('-createdAt').limit(limitNum).lean(),
      GroundRequest.find(query).sort('-createdAt').limit(limitNum).lean()
    ]);

    console.log(`Found ${airQuotes.length} air quotes and ${groundQuotes.length} ground quotes`);

    const allQuotes = [];

    // Process air quotes
    for (const quote of airQuotes) {
      const booking = await Booking.findOne({ 
        requestId: quote._id.toString() 
      }).lean();

      allQuotes.push({
        _id: quote._id.toString(),
        requestNumber: quote.requestNumber,
        mode: 'air',
        serviceType: 'air',
        status: quote.status || 'pending',
        isBooked: !!booking,
        bookingId: booking?.bookingId,
        createdAt: quote.createdAt,
        
        // Origin data
        origin: quote.shipment?.origin || {},
        originCity: quote.shipment?.origin?.city,
        originState: quote.shipment?.origin?.state,
        originZip: quote.shipment?.origin?.zipCode,
        
        // Destination data
        destination: quote.shipment?.destination || {},
        destinationCity: quote.shipment?.destination?.city,
        destCity: quote.shipment?.destination?.city, // alias
        destState: quote.shipment?.destination?.state,
        destZip: quote.shipment?.destination?.zipCode,
        
        // Cargo data
        weight: quote.shipment?.cargo?.totalWeight || 0,
        pieces: quote.shipment?.cargo?.totalPieces || 0,
        
        // Price data
        bestPrice: null, // Will be populated if costs exist
        carrierCount: 0
      });
    }

    // Process ground quotes
    for (const quote of groundQuotes) {
      const booking = await Booking.findOne({ 
        requestId: quote._id.toString() 
      }).lean();
      
      const groundQuoteRecords = await GroundQuote.find({
        requestId: quote._id,
        status: 'active'
      }).sort('customerPrice.total').lean();

      const bestQuote = groundQuoteRecords[0];
      
      // Calculate totals from commodities
      const commodities = quote.formData?.commodities || [];
      const totalWeight = commodities.reduce((sum, c) => 
        sum + ((c.quantity || 1) * (c.weight || 0)), 0);
      const totalPieces = commodities.reduce((sum, c) => 
        sum + (c.quantity || 1), 0);

      allQuotes.push({
        _id: quote._id.toString(),
        requestNumber: quote.requestNumber,
        mode: 'ground',
        serviceType: quote.serviceType || 'ltl',
        status: quote.status || 'pending',
        isBooked: !!booking,
        bookingId: booking?.bookingId,
        createdAt: quote.createdAt,
        formData: quote.formData || {},
        
        // Origin data - multiple formats for compatibility
        origin: {
          city: quote.formData?.originCity,
          state: quote.formData?.originState,
          zipCode: quote.formData?.originZip
        },
        originCity: quote.formData?.originCity,
        originState: quote.formData?.originState,
        originZip: quote.formData?.originZip,
        
        // Destination data - multiple formats for compatibility
        destination: {
          city: quote.formData?.destCity || quote.formData?.destinationCity,
          state: quote.formData?.destState || quote.formData?.destinationState,
          zipCode: quote.formData?.destZip || quote.formData?.destinationZip
        },
        destinationCity: quote.formData?.destCity || quote.formData?.destinationCity,
        destCity: quote.formData?.destCity || quote.formData?.destinationCity,
        destState: quote.formData?.destState || quote.formData?.destinationState,
        destZip: quote.formData?.destZip || quote.formData?.destinationZip,
        
        // Cargo data
        weight: totalWeight,
        pieces: totalPieces,
        
        // Price data
        bestPrice: bestQuote?.customerPrice?.total,
        carrierCount: groundQuoteRecords.length
      });
    }

    // Sort by date (newest first)
    allQuotes.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    // Limit to requested number
    const finalQuotes = allQuotes.slice(0, limitNum);

    console.log(`Returning ${finalQuotes.length} quotes`);

    res.json({
      success: true,
      quotes: finalQuotes,
      counts: { 
        air: airQuotes.length, 
        ground: groundQuotes.length, 
        total: finalQuotes.length 
      }
    });
    
  } catch (error) {
    console.error('Error in /api/quotes/recent:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      quotes: [] // Always return empty array on error
    });
  }
});

// Debug endpoint to check what's in the database
router.get('/debug/check', auth, async (req, res) => {
  try {
    console.log('Debug check for user:', req.user?.email);
    
    // Get counts without any filter
    const totalAirQuotes = await Request.countDocuments({});
    const totalGroundQuotes = await GroundRequest.countDocuments({});
    
    // Get counts for this user
    const userQuery = { userId: req.user._id };
    const userAirQuotes = await Request.countDocuments(userQuery);
    const userGroundQuotes = await GroundRequest.countDocuments(userQuery);
    
    // Get a sample quote to check userId format
    const sampleAir = await Request.findOne({}).select('userId requestNumber').lean();
    const sampleGround = await GroundRequest.findOne({}).select('userId requestNumber').lean();
    
    // Get the most recent quotes for this user
    const recentUserQuotes = await Request.find(userQuery)
      .sort('-createdAt')
      .limit(5)
      .select('requestNumber createdAt userId')
      .lean();
    
    res.json({
      user: {
        id: req.user._id,
        idType: typeof req.user._id,
        email: req.user.email,
        role: req.user.role
      },
      counts: {
        total: {
          air: totalAirQuotes,
          ground: totalGroundQuotes
        },
        user: {
          air: userAirQuotes,
          ground: userGroundQuotes
        }
      },
      samples: {
        air: sampleAir,
        ground: sampleGround
      },
      recentUserQuotes,
      debug: {
        userIdString: req.user._id.toString(),
        isValidObjectId: mongoose.Types.ObjectId.isValid(req.user._id)
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Keep other routes with proper auth
router.get('/details/:id', auth, async (req, res) => {
  // ... existing code
});

router.post('/book', auth, async (req, res) => {
  // ... existing code
});

router.post('/create', auth, async (req, res) => {
  // ... existing code but ensure userId is set properly
  try {
    const request = await Request.create({
      userId: req.user._id, // This should be set from auth middleware
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

// ... rest of the file
module.exports = router;
