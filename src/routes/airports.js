// src/routes/airports.js
const express = require('express');
const router = express.Router();
const airportController = require('../controllers/airportController');

// NEW ROUTE - Add this line
router.get('/by-codes', airportController.getAirportsByCodes);

// POST /api/airports/nearest-airport - Find nearest airport for ZIP code
router.post('/nearest-airport', airportController.getNearestAirport);

// Other routes...
router.get('/domestic', airportController.getDomesticAirports);
router.get('/international', airportController.getInternationalAirports);
// ... etc

module.exports = router;
