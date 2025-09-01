// src/routes/groundQuotes.js
const express = require('express');
const router = express.Router();
const GroundRequest = require('../models/GroundRequest');
const GroundCost = require('../models/GroundCost');
const GroundQuote = require('../models/GroundQuote');

// Create a new ground quote request
router.post('/create', async (req, res) => {
  try {
    console.log('📦 Creating ground quote request...');
    const { serviceType, formData } = req.body;
    
    // Create the GroundRequest document
    const groundRequest = new GroundRequest({
      userId: req.user?._id || '000000000000000000000000', // Temp for testing
      userEmail: req.user?.email || 'test@example.com',
      company: req.user?.company || 'Test Company',
      serviceType: serviceType, // ltl, ftl, or expedited
      
      // Map the form data to our schema
      origin: {
        zipCode: formData.originZip,
        city: formData.originCity,
        state: formData.originState
      },
      destination: {
        zipCode: formData.destZip,
        city: formData.destCity,
        state: formData.destState
      },
      pickupDate: formData.pickupDate,
      
      // LTL specific
      ltlDetails: serviceType === 'ltl' ? {
        commodities: formData.commodities.map(c => ({
          unitType: c.unitType,
          quantity: parseInt(c.quantity),
          weight: parseFloat(c.weight),
          length: parseFloat(c.length),
          width: parseFloat(c.width),
          height: parseFloat(c.height),
          description: c.description,
          freightClass: c.useOverride ? c.overrideClass : c.calculatedClass,
          stackable: c.stackable !== false
        }))
      } : undefined,
      
      // Accessorials
      accessorials: {
        liftgatePickup: formData.liftgatePickup,
        liftgateDelivery: formData.liftgateDelivery,
        residentialDelivery: formData.residentialDelivery,
        insideDelivery: formData.insideDelivery,
        limitedAccessPickup: formData.limitedAccessPickup,
        limitedAccessDelivery: formData.limitedAccessDelivery
      },
      
      status: 'pending'
    });
    
    await groundRequest.save();
    console.log('✅ Ground request created:', groundRequest.requestNumber);
    
    // Start async processing (don't await)
    processGroundQuote(groundRequest._id);
    
    // Return immediately
    res.json({
      success: true,
      data: {
        _id: groundRequest._id,
        requestNumber: groundRequest.requestNumber,
        status: 'processing',
        message: 'Fetching rates from carriers...'
      }
    });
    
  } catch (error) {
    console.error('❌ Ground quote creation error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get quote results
router.get('/results/:requestId', async (req, res) => {
  try {
    const request = await GroundRequest.findById(req.params.requestId);
    if (!request) {
      return res.status(404).json({ success: false, error: 'Request not found' });
    }
    
    // Get quotes for this request
    const quotes = await GroundQuote.find({ 
      requestId: req.params.requestId,
      status: 'active'
    }).sort('ranking.position');
    
    res.json({
      success: true,
      status: request.status,
      requestNumber: request.requestNumber,
      quotes: quotes.map(q => ({
        quoteId: q._id,
        carrier: q.carrier.name,
        service: q.carrier.service,
        price: q.customerPrice.total,
        rawCost: q.rawCost.total,
        markup: q.markup.totalMarkup,
        transitDays: q.transit.businessDays,
        guaranteed: q.transit.guaranteed
      }))
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Manually retry a failed (or stuck) ground quote request
 * - Resets status to 'pending'
 * - Clears error
 * - Kicks off processing again
 */
router.post('/retry/:requestId', async (req, res) => {
  try {
    const request = await GroundRequest.findById(req.params.requestId);
    if (!request) {
      return res.status(404).json({ success: false, error: 'Request not found' });
    }

    // Reset status & error
    request.status = 'pending';
    request.error = null;
    await request.save();

    // Retry processing (fire-and-forget)
    processGroundQuote(request._id);

    res.json({
      success: true,
      message: 'Retrying quote processing'
    });
  } catch (error) {
    console.error('❌ Retry error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Process quote (this will be called async)
async function processGroundQuote(requestId) {
  try {
    console.log('🔄 Processing ground quote:', requestId);
    
    // For now, create mock costs (later you'll call real carrier APIs)
    const mockCarriers = [
      {
        provider: 'STG',
        carrierName: 'STG Logistics',
        service: 'Standard LTL',
        baseFreight: 485.50,
        fuelSurcharge: 48.55,
        transitDays: 3
      },
      {
        provider: 'SEFL',  
        carrierName: 'Southeastern Freight Lines',
        service: 'Priority LTL',
        baseFreight: 512.25,
        fuelSurcharge: 51.23,
        transitDays: 2
      }
    ];
    
    for (const carrier of mockCarriers) {
      // Create cost record
      const cost = new GroundCost({
        requestId: requestId,
        provider: carrier.provider,
        carrierName: carrier.carrierName,
        service: carrier.service,
        serviceType: 'ltl',
        costs: {
          baseFreight: carrier.baseFreight,
          fuelSurcharge: carrier.fuelSurcharge,
          totalCost: carrier.baseFreight + carrier.fuelSurcharge
        },
        transit: {
          businessDays: carrier.transitDays,
          guaranteed: false
        },
        status: 'completed'
      });
      await cost.save();
      
      // Create quote with markup
      const markupPercentage = 18; // Default 18% markup
      const totalCost = cost.costs.totalCost;
      const markupAmount = totalCost * (markupPercentage / 100);
      
      const quote = new GroundQuote({
        requestId: requestId,
        costId: cost._id,
        userId: '000000000000000000000000', // Temp
        carrier: {
          name: carrier.carrierName,
          code: carrier.provider,
          service: carrier.service
        },
        rawCost: {
          baseFreight: carrier.baseFreight,
          fuelSurcharge: carrier.fuelSurcharge,
          total: totalCost
        },
        markup: {
          type: 'percentage',
          percentage: markupPercentage,
          totalMarkup: markupAmount
        },
        customerPrice: {
          subtotal: totalCost + markupAmount,
          fees: 0,
          total: totalCost + markupAmount
        },
        transit: {
          businessDays: carrier.transitDays,
          guaranteed: false
        },
        status: 'active',
        validUntil: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
      });
      await quote.save();
    }
    
    // Update request status
    await GroundRequest.findByIdAndUpdate(requestId, {
      status: 'quoted',
      quotedAt: new Date()
    });
    
    console.log('✅ Ground quote processing complete');
  } catch (error) {
    console.error('❌ Error processing ground quote:', error);
    await GroundRequest.findByIdAndUpdate(requestId, {
      status: 'failed',
      error: error.message
    });
  }
}

module.exports = router;
