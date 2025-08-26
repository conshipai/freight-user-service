// src/routes/airports.js
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose'); // needed for direct db access
const airportController = require('../controllers/airportController');

// Validate airport pair (origin domestic, destination international)
router.post('/validate', airportController.validateAirportPair);

// Search airports (for autocomplete)
router.get('/search', airportController.searchAirports);

// Get airports by codes
router.get('/by-codes', airportController.getAirportsByCodes);

// Find nearest airport for ZIP code
router.post('/nearest-airport', airportController.getNearestAirport);

// Get domestic airports (US only)
router.get('/domestic', airportController.getDomesticAirports);

// Get international airports (non-US)
router.get('/international', airportController.getInternationalAirports);

// Debug route - add this temporarily
router.get('/debug-foreign', async (req, res) => {
  try {
    const db = mongoose.connection.db;
    
    // Get sample foreign airports
    const samples = await db.collection('foreign_gateways').find({}).limit(5).toArray();
    
    // Count total
    const total = await db.collection('foreign_gateways').countDocuments({});
    const activeCount = await db.collection('foreign_gateways').countDocuments({ active: true });
    
    // Try to find specific airports
    const lhr = await db.collection('foreign_gateways').findOne({ code: 'LHR' });
    const alc = await db.collection('foreign_gateways').findOne({ code: 'ALC' });
    
    // Check what fields exist in the first document
    const firstDoc = samples[0] || {};
    const fields = Object.keys(firstDoc);
    
    res.json({
      total,
      activeCount,
      fields,
      samples,
      specific: {
        LHR: lhr,
        ALC: alc
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
