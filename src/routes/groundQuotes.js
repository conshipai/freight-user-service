// src/routes/groundQuotes.js - SIMPLIFIED (now with FTL/Expedited additions)
const router = require('express').Router();
const GroundRequest = require('../models/GroundRequest');
const GroundCost = require('../models/GroundCost');
const MagicLinkToken = require('../models/MagicLinkToken');
const emailService = require('../services/emailService');
const GroundQuote = require('../models/GroundQuote');
const auth = require('../middleware/auth');
const { processGroundQuote } = require('../services/ground/processGroundQuote');

// ✅ NEW: carrierApi for FTL/Expedited flow
const carrierApi = require('../services/carrierApi');

// Create request - that's it
router.post('/create', auth, async (req, res) => {
  try {
    // Just save the request
    const groundRequest = new GroundRequest({
      userId: req.userId,
      serviceType: req.body.serviceType || 'ltl',
      status: 'processing',
      formData: req.body.formData
    });
    
    await groundRequest.save();
    
    // Return the ID
    res.json({
      success: true,
      data: {
        _id: groundRequest._id.toString(),
        requestNumber: groundRequest.requestNumber,
        status: 'processing'
      }
    });
    
    // Process in background
    processGroundQuote(groundRequest._id);
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get results - just read from DB
router.get('/:requestId/results', auth, async (req, res) => {
  try {
    const request = await GroundRequest.findById(req.params.requestId);
    if (!request) {
      return res.status(404).json({ success: false, error: 'Not found' });
    }
    
    // Get quotes from DB
    const quotes = await GroundQuote.find({
      requestId: request._id,
      status: 'active'
    }).sort('customerPrice.total');
    
    // Return what's in DB
    res.json({
      success: true,
      requestId: request._id.toString(),
      requestNumber: request.requestNumber,
      status: request.status,
      formData: request.formData,
      quotes: quotes.map(q => ({
        quoteId: q._id.toString(),
        carrier: q.carrier.name,
        service: q.carrier.service,
        price: q.customerPrice.total,
        transitDays: q.transit.days,
        raw_cost: q.rawCost.total,
        final_price: q.customerPrice.total
      }))
    });
    
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});


// ===============================
// ✅ ADDED: FTL/Expedited flow
// ===============================

// Create FTL/Expedited request with carrier emails
router.post('/create-carrier-request', auth, async (req, res) => {
  try {
    const { formData, serviceType } = req.body;
    
    // Create the request
    const request = new GroundRequest({
      userId: req.userId,
      serviceType, // 'ftl' or 'expedited'
      status: 'pending_carrier_response',
      formData,
      additionalStops: formData.additionalStops || []
    });
    
    // Get active carriers for this service
    const carriersResult = await carrierApi.getCarriersForService(serviceType);
    const carriers = carriersResult.carriers || [];
    
    if (carriers.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No carriers available for this service type'
      });
    }
    
    // Create invitations for each carrier
    const responseDeadline = new Date();
    if (serviceType === 'expedited') {
      responseDeadline.setMinutes(responseDeadline.getMinutes() + 15);
    } else {
      responseDeadline.setHours(responseDeadline.getHours() + 1);
    }
    
    const tokenExpiry = new Date();
    tokenExpiry.setHours(tokenExpiry.getHours() + 2);
    
    // Create invitation for each carrier
    for (const carrier of carriers) {
      // Create magic link token
      const token = await MagicLinkToken.create({
        requestId: request._id,
        carrierId: carrier.id,
        carrierName: carrier.name,
        carrierEmail: carrier.email,
        serviceType,
        responseDeadline,
        expiresAt: tokenExpiry
      });
      
      // Add to request invitations
      request.carrierInvitations.push({
        carrierId: carrier.id,
        carrierName: carrier.name,
        carrierEmail: carrier.email,
        magicToken: token.token,
        tokenExpiry,
        responseDeadline,
        emailSentAt: new Date(),
        status: 'invited'
      });
      
      // Send email (async, don't wait)
      emailService.sendCarrierQuoteRequest(carrier, request, token)
        .catch(err => console.error(`Failed to email ${carrier.name}:`, err));
    }
    
    await request.save();
    
    res.json({
      success: true,
      requestId: request._id,
      requestNumber: request.requestNumber,
      carriersInvited: carriers.length,
      responseDeadline
    });
    
  } catch (error) {
    console.error('Error creating carrier request:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Carrier views quote request (via magic link)
router.get('/carrier/view/:token', async (req, res) => {
  try {
    const { token } = req.params;
    
    // Find and validate token
    const magicLink = await MagicLinkToken.findOne({ token });
    
    if (!magicLink) {
      return res.status(404).json({ 
        success: false, 
        error: 'Invalid or expired link' 
      });
    }
    
    if (new Date() > magicLink.expiresAt) {
      return res.status(410).json({ 
        success: false, 
        error: 'This link has expired' 
      });
    }
    
    // Track view
    if (!magicLink.firstClickAt) {
      magicLink.firstClickAt = new Date();
    }
    magicLink.clickCount++;
    await magicLink.save();
    
    // Get request details
    const request = await GroundRequest.findById(magicLink.requestId);
    
    // Update invitation status to 'viewed'
    const invitation = request.carrierInvitations.find(
      inv => inv.magicToken === token
    );
    if (invitation && invitation.status === 'invited') {
      invitation.status = 'viewed';
      invitation.linkClickedAt = new Date();
      await request.save();
    }
    
    // Return request details for carrier to quote
    res.json({
      success: true,
      request: {
        requestNumber: request.requestNumber,
        serviceType: request.serviceType,
        formData: request.formData,
        additionalStops: request.additionalStops,
        responseDeadline: magicLink.responseDeadline,
        carrierName: magicLink.carrierName
      }
    });
    
  } catch (error) {
    console.error('Error viewing quote:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Carrier submits quote
router.post('/carrier/submit/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const quoteData = req.body;
    
    // Validate token
    const magicLink = await MagicLinkToken.findOne({ token });
    
    if (!magicLink || magicLink.used) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid or already used link' 
      });
    }
    
    // Get request
    const request = await GroundRequest.findById(magicLink.requestId);
    
    // Create cost entry
    const cost = new GroundCost({
      requestId: request._id,
      requestNumber: request.requestNumber,
      provider: magicLink.carrierName,
      carrierName: magicLink.carrierName,
      serviceType: request.serviceType,
      
      submissionSource: 'magic_link',
      submittedBy: {
        carrierId: magicLink.carrierId,
        carrierName: magicLink.carrierName,
        carrierEmail: magicLink.carrierEmail,
        magicToken: token
      },
      
      // Parse the quote data
      costs: {
        baseFreight: quoteData.linehaul || quoteData.totalCost || 0,
        fuelSurcharge: quoteData.fuelSurcharge || 0,
        accessorials: quoteData.totalAccessorials || 0,
        totalCost: quoteData.totalCost || 0,
        currency: 'USD'
      },
      
      carrierQuoteDetails: {
        linehaul: quoteData.linehaul,
        fuelSurcharge: quoteData.fuelSurcharge,
        fuelPercentage: quoteData.fuelPercentage,
        totalAccessorials: quoteData.totalAccessorials,
        freeTimeLoadingHours: quoteData.freeTimeLoadingHours || 2,
        freeTimeUnloadingHours: quoteData.freeTimeUnloadingHours || 2,
        detentionRatePerHour: quoteData.detentionRatePerHour,
        equipmentType: quoteData.equipmentType,
        specialConditions: quoteData.specialConditions
      },
      
      transit: {
        days: quoteData.transitDays || 2,
        businessDays: quoteData.transitDays || 2,
        guaranteed: quoteData.guaranteed || false
      },
      
      status: 'pending_review'  // Needs employee to add markup
    });
    
    await cost.save();
    
    // Mark token as used
    magicLink.used = true;
    magicLink.usedAt = new Date();
    await magicLink.save();
    
    // Update invitation
    const invitation = request.carrierInvitations.find(
      inv => inv.magicToken === token
    );
    if (invitation) {
      invitation.status = 'submitted';
      invitation.submittedAt = new Date();
      invitation.responseTimeMinutes = Math.round(
        (new Date() - invitation.emailSentAt) / 60000
      );
      await request.save();
    }
    
    res.json({
      success: true,
      message: 'Quote submitted successfully',
      costId: cost._id
    });
    
  } catch (error) {
    console.error('Error submitting quote:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Employee manually adds a carrier quote
router.post('/manual-carrier-quote', auth, async (req, res) => {
  try {
    const { requestId, carrierName, quoteData } = req.body;
    
    const request = await GroundRequest.findById(requestId);
    if (!request) {
      return res.status(404).json({ error: 'Request not found' });
    }
    
    const cost = new GroundCost({
      requestId: request._id,
      requestNumber: request.requestNumber,
      provider: carrierName,
      carrierName,
      serviceType: request.serviceType,
      
      submissionSource: 'manual_entry',
      submittedBy: {
        employeeId: req.userId,
        employeeName: req.user.name
      },
      
      costs: {
        baseFreight: quoteData.linehaul || quoteData.totalCost || 0,
        fuelSurcharge: quoteData.fuelSurcharge || 0,
        accessorials: quoteData.totalAccessorials || 0,
        totalCost: quoteData.totalCost || 0,
        currency: 'USD'
      },
      
      carrierQuoteDetails: quoteData,
      
      transit: {
        days: quoteData.transitDays || 2,
        businessDays: quoteData.transitDays || 2
      },
      
      status: 'pending_review'
    });
    
    await cost.save();
    
    res.json({
      success: true,
      message: 'Manual quote added',
      costId: cost._id
    });
    
  } catch (error) {
    console.error('Error adding manual quote:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get carrier response status (for employee dashboard)
router.get('/carrier-responses/:requestId', auth, async (req, res) => {
  try {
    const request = await GroundRequest.findById(req.params.requestId);
    const costs = await GroundCost.find({ 
      requestId: req.params.requestId 
    }).sort('costs.totalCost');
    
    const summary = {
      requestNumber: request.requestNumber,
      serviceType: request.serviceType,
      status: request.status,
      carriersSummary: {
        invited: request.carrierInvitations.length,
        viewed: request.carrierInvitations.filter(i => i.status === 'viewed').length,
        submitted: request.carrierInvitations.filter(i => i.status === 'submitted').length,
        avgResponseTime: 0
      },
      costs: costs.map(c => ({
        id: c._id,
        carrier: c.carrierName,
        totalCost: c.costs.totalCost,
        transitDays: c.transit.days,
        submissionSource: c.submissionSource,
        status: c.status
      })),
      deadline: request.carrierInvitations[0]?.responseDeadline
    };
    
    // Calculate avg response time
    const submitted = request.carrierInvitations.filter(i => i.responseTimeMinutes);
    if (submitted.length > 0) {
      summary.carriersSummary.avgResponseTime = Math.round(
        submitted.reduce((sum, i) => sum + i.responseTimeMinutes, 0) / submitted.length
      );
    }
    
    res.json({ success: true, ...summary });
    
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
