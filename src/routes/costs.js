// src/routes/costs.js
const express = require('express');
const router = express.Router();
const Request = require('../models/Request');
const Cost = require('../models/Cost');
const { authorize } = require('../middleware/authorize');

// Add the function HERE - after imports, before routes
async function processQuoteRequest(requestId) {
  try {
    console.log('Processing quote request:', requestId);
    // TODO: Implement actual provider processing
    // This would normally:
    // 1. Get the request details
    // 2. Call each provider (Pelicargo, FreightForce, etc.)
    // 3. Save costs to database
  } catch (error) {
    console.error('Error processing quote:', error);
  }
}

// Internal cost check - employees only
router.post('/check', authorize(['system_admin', 'conship_employee']), async (req, res) => {
  try {
    // Create request (same as quotes but marked as internal)
    const request = await Request.create({
      userId: req.user._id,
      userEmail: req.user.email,
      company: 'Internal',
      shipment: req.body.shipment,
      isInternalCostCheck: true, // Flag for internal use
      status: 'pending'
    });
    
    // Process providers
    processQuoteRequest(request._id);
    
    res.json({
      success: true,
      requestId: request._id,
      message: 'Fetching costs...'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get raw costs - no markup
router.get('/:requestId', authorize(['system_admin', 'conship_employee']), async (req, res) => {
  try {
    const costs = await Cost.find({ 
      requestId: req.params.requestId,
      status: 'completed'
    });
    
    res.json({
      success: true,
      costs: costs.map(c => ({
        provider: c.provider,
        carrier: c.carrier,
        service: c.service,
        rawCost: c.costs.totalCost,
        breakdown: c.costs,
        transitTime: c.transitTime,
        responseTime: c.responseTimeMs
      }))
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
