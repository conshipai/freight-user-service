// src/routes/airports.js
const express = require('express');
const router = express.Router();
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

module.exports = router;
