// src/routes/groundQuotes.js - COMPLETE VERSION WITH FIXES
const router = require('express').Router();
const crypto = require('crypto');
const GroundRequest = require('../models/GroundRequest');
const GroundQuote = require('../models/GroundQuote');
const GroundCost = require('../models/GroundCost');
const MagicLinkToken = require('../models/MagicLinkToken');
const auth = require('../middleware/auth');
const { processGroundQuote } = require('../services/ground/processGroundQuote');
const carrierApi = require('../services/carrierApi');
const emailService = require('../services/emailService');

// Main create endpoint - handles all service types
router.post('/create', auth, async (req, res) => {
  try {
    // Extract serviceType and everything else becomes formData
    const { serviceType, ...formData } = req.body;
    
    console.log('🔍 CREATE - serviceType:', serviceType);
    console.log('🔍 CREATE - formData keys:', Object.keys(formData));
    
    // Create the base request
    const groundRequest = new GroundRequest({
      userId: req.userId,
      serviceType: serviceType || 'ltl',
      status: serviceType === 'ltl' ? 'processing' : 'pending_carrier_response',
      formData: formData  // Now this contains all the other fields
    });
    
    await groundRequest.save();
    
    // Handle based on service type
    if (serviceType === 'ltl') {
      // LTL - Process automatically
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
      
    } else if (serviceType === 'ftl' || serviceType === 'expedited') {
      // FTL/Expedited - Send to carriers
      const carriers = await carrierApi.getCarriersForService(serviceType);
      
      if (!carriers.carriers || carriers.carriers.length === 0) {
        groundRequest.status = 'failed';
        groundRequest.error = 'No carriers available';
        await groundRequest.save();
        
        return res.status(400).json({
          success: false,
          error: 'No carriers available for this service type'
        });
      }
      
      // Set response deadline
      const responseDeadline = new Date();
      if (serviceType === 'expedited') {
        responseDeadline.setMinutes(responseDeadline.getMinutes() + 15);
      } else {
        responseDeadline.setHours(responseDeadline.getHours() + 1);
      }
      
      const tokenExpiry = new Date();
      tokenExpiry.setHours(tokenExpiry.getHours() + 2);
      
      // Create invitations for each carrier
      const invitations = [];
      for (const carrier of carriers.carriers) {
        // Generate unique token
        const token = crypto.randomBytes(32).toString('hex');
        
        // Create magic link token
        const magicLink = new MagicLinkToken({
          token: token,
          requestId: groundRequest._id,
          carrierId: carrier.id,
          carrierName: carrier.name,
          carrierEmail: carrier.email,
          serviceType: serviceType,
          responseDeadline: responseDeadline,
          expiresAt: tokenExpiry
        });
        
        await magicLink.save();
        
        // Add to request invitations
        const invitation = {
          carrierId: carrier.id,
          carrierName: carrier.name,
          carrierEmail: carrier.email,
          magicToken: token,
          tokenExpiry: tokenExpiry,
          responseDeadline: responseDeadline,
          emailSentAt: new Date(),
          status: 'invited'
        };
        
        groundRequest.carrierInvitations.push(invitation);
        invitations.push({ carrier, token: magicLink });
        
        // Send email (don't await - do it async)
        emailService.sendCarrierQuoteRequest(carrier, groundRequest, magicLink)
          .catch(err => console.error(`Failed to email ${carrier.name}:`, err));
      }
      
      await groundRequest.save();
      
      res.json({
        success: true,
        data: {
          _id: groundRequest._id.toString(),
          requestNumber: groundRequest.requestNumber,
          status: 'pending_carrier_response',
          carriersNotified: carriers.carriers.length,
          responseDeadline: responseDeadline
        }
      });
      
      console.log(`📧 Sent ${serviceType.toUpperCase()} quote request ${groundRequest.requestNumber} to ${carriers.carriers.length} carriers`);
    }
    
  } catch (error) {
    console.error('Create request error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get recent ground quotes for the current user
router.get('/recent', auth, async (req, res) => {
  try {
    const userId = req.userId;
    const limit = parseInt(req.query.limit) || 10;
    
    // Get recent requests
    const recentRequests = await GroundRequest.find({
      userId: userId
    })
    .sort({ createdAt: -1 })
    .limit(limit)
    .select('requestNumber serviceType status formData createdAt');
    
    // Get quotes for each request
    const requestsWithQuotes = await Promise.all(
      recentRequests.map(async (request) => {
        const quotes = await GroundQuote.find({ 
          requestId: request._id,
          status: 'active'
        })
        .select('carrier customerPrice transit createdAt')
        .sort('customerPrice.total')
        .limit(5); // Get top 5 quotes per request
        
        return {
          _id: request._id,
          requestNumber: request.requestNumber,
          serviceType: request.serviceType,
          status: request.status,
          origin: request.formData ? 
            `${request.formData.originCity || 'Unknown'}, ${request.formData.originState || ''}` : 
            'Unknown',
          destination: request.formData ? 
            `${request.formData.destCity || 'Unknown'}, ${request.formData.destState || ''}` : 
            'Unknown',
          createdAt: request.createdAt,
          quoteCount: quotes.length,
          bestPrice: quotes.length > 0 ? quotes[0].customerPrice.total : null,
          quotes: quotes.map(q => ({
            quoteId: q._id,
            carrier: q.carrier.name,
            price: q.customerPrice.total,
            transitDays: q.transit.days
          }))
        };
      })
    );
    
    res.json({
      success: true,
      count: requestsWithQuotes.length,
      requests: requestsWithQuotes
    });
    
  } catch (error) {
    console.error('Error fetching recent ground quotes:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch recent quotes'
    });
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
    magicLink.clickCount = (magicLink.clickCount || 0) + 1;
    
    // Track IP
    const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    if (!magicLink.ipAddresses) magicLink.ipAddresses = [];
    if (!magicLink.ipAddresses.includes(ip)) {
      magicLink.ipAddresses.push(ip);
    }
    
    await magicLink.save();
    
    // Get request details
    const request = await GroundRequest.findById(magicLink.requestId);
    
    if (!request) {
      return res.status(404).json({ 
        success: false, 
        error: 'Request not found' 
      });
    }
    
    // Update invitation status to 'viewed'
    const invitation = request.carrierInvitations.find(
      inv => inv.magicToken === token
    );
    if (invitation && invitation.status === 'invited') {
      invitation.status = 'viewed';
      invitation.linkClickedAt = new Date();
      await request.save();
    }
    
    // Calculate time remaining
    const now = new Date();
    const deadline = new Date(magicLink.responseDeadline);
    const minutesRemaining = Math.max(0, Math.floor((deadline - now) / 60000));
    
    // Return request details for carrier to quote
    res.json({
      success: true,
      request: {
        requestNumber: request.requestNumber,
        serviceType: request.serviceType,
        formData: request.formData,
        additionalStops: request.additionalStops,
        responseDeadline: magicLink.responseDeadline,
        minutesRemaining: minutesRemaining,
        carrierName: magicLink.carrierName,
        isExpired: minutesRemaining === 0,
        hasSubmitted: magicLink.used
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
    
    if (!magicLink) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid link' 
      });
    }
    
    if (magicLink.used) {
      return res.status(400).json({ 
        success: false, 
        error: 'Quote already submitted for this request' 
      });
    }
    
    if (new Date() > magicLink.expiresAt) {
      return res.status(410).json({ 
        success: false, 
        error: 'This link has expired' 
      });
    }
    
    // Get request
    const request = await GroundRequest.findById(magicLink.requestId);
    
    if (!request) {
      return res.status(404).json({ 
        success: false, 
        error: 'Request not found' 
      });
    }
    
    // Calculate total cost
    let totalCost = 0;
    if (quoteData.totalCost) {
      totalCost = parseFloat(quoteData.totalCost);
    } else {
      totalCost = (parseFloat(quoteData.linehaul || 0) + 
                   parseFloat(quoteData.fuelSurcharge || 0) + 
                   parseFloat(quoteData.totalAccessorials || 0));
    }
    
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
      
      costs: {
        baseFreight: parseFloat(quoteData.linehaul || totalCost || 0),
        fuelSurcharge: parseFloat(quoteData.fuelSurcharge || 0),
        accessorials: parseFloat(quoteData.totalAccessorials || 0),
        totalCost: totalCost,
        currency: 'USD'
      },
      
      carrierQuoteDetails: {
        linehaul: quoteData.linehaul,
        fuelSurcharge: quoteData.fuelSurcharge,
        fuelPercentage: quoteData.fuelPercentage,
        detention: quoteData.detention,
        layover: quoteData.layover,
        tarp: quoteData.tarp,
        teamDriver: quoteData.teamDriver,
        totalAccessorials: quoteData.totalAccessorials,
        freeTimeLoadingHours: quoteData.freeTimeLoadingHours || 2,
        freeTimeUnloadingHours: quoteData.freeTimeUnloadingHours || 2,
        detentionRatePerHour: quoteData.detentionRatePerHour,
        equipmentType: quoteData.equipmentType,
        equipmentNotes: quoteData.equipmentNotes,
        specialConditions: quoteData.specialConditions,
        internalNotes: quoteData.internalNotes
      },
      
      transit: {
        days: parseInt(quoteData.transitDays) || 2,
        businessDays: parseInt(quoteData.transitDays) || 2,
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
    
    // Check if all carriers have responded
    const allResponded = request.carrierInvitations.every(
      inv => inv.status === 'submitted' || inv.status === 'declined'
    );
    
    if (allResponded) {
      request.status = 'quoted';
      await request.save();
    }
    
    // Send confirmation email
    emailService.sendCarrierQuoteConfirmation(
      magicLink.carrierEmail,
      magicLink.carrierName,
      request.requestNumber,
      totalCost
    ).catch(err => console.error('Confirmation email error:', err));
    
    res.json({
      success: true,
      message: 'Quote submitted successfully. Thank you for your response.',
      costId: cost._id
    });
    
  } catch (error) {
    console.error('Error submitting quote:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Carrier declines to quote
router.post('/carrier/decline/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const { reason } = req.body;
    
    const magicLink = await MagicLinkToken.findOne({ token });
    
    if (!magicLink || magicLink.used) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid or already used link' 
      });
    }
    
    const request = await GroundRequest.findById(magicLink.requestId);
    
    const invitation = request.carrierInvitations.find(
      inv => inv.magicToken === token
    );
    if (invitation) {
      invitation.status = 'declined';
      invitation.declinedAt = new Date();
      invitation.declineReason = reason;
      await request.save();
    }
    
    magicLink.used = true;
    magicLink.usedAt = new Date();
    await magicLink.save();
    
    res.json({
      success: true,
      message: 'Thank you for letting us know.'
    });
    
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get carrier response status (for employee dashboard)
router.get('/carrier-responses/:requestId', auth, async (req, res) => {
  try {
    const request = await GroundRequest.findById(req.params.requestId);
    
    if (!request) {
      return res.status(404).json({ 
        success: false, 
        error: 'Request not found' 
      });
    }
    
    const costs = await GroundCost.find({ 
      requestId: req.params.requestId 
    }).sort('costs.totalCost');
    
    const summary = {
      requestNumber: request.requestNumber,
      serviceType: request.serviceType,
      status: request.status,
      formData: request.formData,
      carriersSummary: {
        invited: request.carrierInvitations?.length || 0,
        viewed: request.carrierInvitations?.filter(i => i.status === 'viewed' || i.status === 'submitted').length || 0,
        submitted: request.carrierInvitations?.filter(i => i.status === 'submitted').length || 0,
        declined: request.carrierInvitations?.filter(i => i.status === 'declined').length || 0,
        avgResponseTime: 0
      },
      costs: costs.map(c => ({
        id: c._id,
        carrier: c.carrierName,
        totalCost: c.costs.totalCost,
        transitDays: c.transit.days,
        submissionSource: c.submissionSource,
        status: c.status,
        submittedAt: c.createdAt
      })),
      deadline: request.carrierInvitations?.[0]?.responseDeadline
    };
    
    // Calculate avg response time
    const submitted = request.carrierInvitations?.filter(i => i.responseTimeMinutes) || [];
    if (submitted.length > 0) {
      summary.carriersSummary.avgResponseTime = Math.round(
        submitted.reduce((sum, i) => sum + i.responseTimeMinutes, 0) / submitted.length
      );
    }
    
    res.json({ success: true, ...summary });
    
  } catch (error) {
    console.error('Error getting carrier responses:', error);
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
    
    const totalCost = parseFloat(quoteData.totalCost || 0);
    
    const cost = new GroundCost({
      requestId: request._id,
      requestNumber: request.requestNumber,
      provider: carrierName,
      carrierName: carrierName,
      serviceType: request.serviceType,
      
      submissionSource: 'manual_entry',
      submittedBy: {
        employeeId: req.userId,
        employeeName: req.user?.name || 'Employee'
      },
      
      costs: {
        baseFreight: parseFloat(quoteData.linehaul || totalCost),
        fuelSurcharge: parseFloat(quoteData.fuelSurcharge || 0),
        accessorials: parseFloat(quoteData.totalAccessorials || 0),
        totalCost: totalCost,
        currency: 'USD'
      },
      
      carrierQuoteDetails: quoteData,
      
      transit: {
        days: parseInt(quoteData.transitDays) || 2,
        businessDays: parseInt(quoteData.transitDays) || 2,
        guaranteed: quoteData.guaranteed || false
      },
      
      status: 'pending_review'
    });
    
    await cost.save();
    
    res.json({
      success: true,
      message: 'Manual quote added successfully',
      costId: cost._id
    });
    
  } catch (error) {
    console.error('Error adding manual quote:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get results (existing endpoint for compatibility)
router.get('/:requestId/results', auth, async (req, res) => {
  try {
    const request = await GroundRequest.findById(req.params.requestId);
    if (!request) {
      return res.status(404).json({ success: false, error: 'Not found' });
    }
    
    const quotes = await GroundQuote.find({
      requestId: request._id,
      status: 'active'
    }).sort('customerPrice.total');
    
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

module.exports = router;
