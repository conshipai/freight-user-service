// src/routes/quotes.js
const express = require('express');
const router = express.Router();
const Request = require('../models/Request');
const Cost = require('../models/Cost');
const Quote = require('../models/Quote');
const RateProvider = require('../models/RateProvider');
const ProviderFactory = require('../services/providers/ProviderFactory');
const { authorize } = require('../middleware/authorize');

// Create new quote request
router.post('/create', authorize(), async (req, res) => {
  try {
    // Create request document
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

    // Start async rate fetching
    processQuoteRequest(request._id);

    // Return immediately
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
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

// Process quote request (runs async)
async function processQuoteRequest(requestId) {
  try {
    const request = await Request.findById(requestId);
    if (!request) throw new Error('Request not found');

    // Update status
    request.status = 'processing';
    await request.save();

    // Get active providers
    const providers = await RateProvider.find({
      status: 'active',
      'services.mode': 'air'
    });

    // Start all provider requests in parallel
    const providerPromises = providers.map(async (providerConfig) => {
      try {
        const provider = ProviderFactory.create(providerConfig.toObject());
        
        // Special handling for Pelicargo (async)
        if (providerConfig.code === 'PELICARGO') {
          return handlePelicargoRequest(request, provider, providerConfig);
        }
        
        // Synchronous providers (FreightForce, ECULines)
        return handleSyncProvider(request, provider, providerConfig);
      } catch (error) {
        console.error(`Provider ${providerConfig.name} failed:`, error);
        return null;
      }
    });

    // Wait for all to complete or fail
    await Promise.allSettled(providerPromises);

    // Check if we should create quote now
    await checkAndCreateQuote(requestId);
    
  } catch (error) {
    console.error('Process quote request error:', error);
    await Request.findByIdAndUpdate(requestId, {
      status: 'failed',
      error: error.message
    });
  }
}

// Handle synchronous provider (FreightForce, ECULines)
async function handleSyncProvider(request, provider, providerConfig) {
  const startTime = Date.now();
  
  try {
    const result = await provider.getQuote(request);
    
    // Save cost record
    const cost = await Cost.create({
      requestId: request._id,
      provider: providerConfig.name,
      rawRequest: request.shipment,
      rawResponse: result.rawResponse,
      costs: result.costs,
      service: result.service,
      serviceType: result.serviceType,
      transitTime: result.transitTime,
      transitDays: result.transitDays,
      validUntil: result.validUntil,
      responseTimeMs: Date.now() - startTime,
      status: 'completed'
    });

    return cost;
  } catch (error) {
    // Save failed cost record
    await Cost.create({
      requestId: request._id,
      provider: providerConfig.name,
      status: 'failed',
      error: error.message,
      responseTimeMs: Date.now() - startTime
    });
    throw error;
  }
}

// Handle Pelicargo (async with polling)
async function handlePelicargoRequest(request, provider, providerConfig) {
  try {
    // Transform request for Pelicargo
    const pelicargoRequest = transformForPelicargo(request);
    
    // Submit request
    const submitResult = await provider.submitQuoteRequest(pelicargoRequest);
    
    // Create pending cost record
    const cost = await Cost.create({
      requestId: request._id,
      provider: 'Pelicargo',
      providerRequestId: submitResult.requestId,
      rawRequest: pelicargoRequest,
      status: 'pending'
    });

    // Start polling job
    startPelicargoPolling(request._id, cost._id, submitResult.requestId);
    
    return cost;
  } catch (error) {
    await Cost.create({
      requestId: request._id,
      provider: 'Pelicargo',
      status: 'failed',
      error: error.message
    });
    throw error;
  }
}

// Transform request for Pelicargo API
function transformForPelicargo(request) {
  const shipment = request.shipment;
  
  // Build Pelicargo request
  const pelicargoRequest = {
    origin: { airport: shipment.origin.airport },
    destination: { airport: shipment.destination.airport },
    cargo: {
      pieces: shipment.cargo.pieces.map(piece => ({
        quantity: piece.quantity,
        weight: piece.weightKg || piece.weight * 0.453592,
        length: piece.lengthCm || piece.length * 2.54,
        width: piece.widthCm || piece.width * 2.54,
        height: piece.heightCm || piece.height * 2.54,
        handling: piece.stackable === false ? ['NonStackable'] : []
      }))
    }
  };

  // Add DG/Battery details if present
  if (request.dangerousGoods?.pelicargo) {
    Object.assign(pelicargoRequest, request.dangerousGoods.pelicargo);
  }
  if (request.batteryDetails?.pelicargo) {
    Object.assign(pelicargoRequest, request.batteryDetails.pelicargo);
  }

  return pelicargoRequest;
}

// Pelicargo polling job
async function startPelicargoPolling(requestId, costId, pelicargoRequestId) {
  const maxAttempts = 60; // 30 minutes (30 seconds * 60)
  let attempts = 0;
  
  const poll = async () => {
    attempts++;
    
    try {
      const provider = await ProviderFactory.createFromDatabase('PELICARGO');
      const result = await provider.checkQuoteStatus(pelicargoRequestId);
      
      if (result.status === 'COMPLETED' && result.quotes) {
        // Process and save quotes
        for (const quote of result.quotes) {
          await Cost.create({
            requestId: requestId,
            provider: 'Pelicargo',
            carrier: quote.carrier,
            costs: {
              freight: quote.breakdown.freight,
              fuel: quote.breakdown.fuel,
              screening: quote.breakdown.screening,
              other: quote.breakdown.other,
              totalCost: quote.totalRate,
              currency: quote.currency
            },
            service: 'Air',
            serviceType: quote.serviceType,
            transitTime: quote.transitTime,
            validUntil: quote.validUntil,
            status: 'completed'
          });
        }
        
        // Update original cost record
        await Cost.findByIdAndUpdate(costId, {
          status: 'completed',
          rawResponse: result.quotes
        });
        
        // Check if quote should be created
        await checkAndCreateQuote(requestId);
        
      } else if (attempts < maxAttempts) {
        // Continue polling
        setTimeout(poll, 30000); // 30 seconds
      } else {
        // Timeout
        await Cost.findByIdAndUpdate(costId, {
          status: 'failed',
          error: 'Timeout waiting for Pelicargo response'
        });
      }
    } catch (error) {
      console.error('Pelicargo polling error:', error);
      if (attempts < maxAttempts) {
        setTimeout(poll, 30000);
      } else {
        await Cost.findByIdAndUpdate(costId, {
          status: 'failed',
          error: error.message
        });
      }
    }
  };
  
  // Start polling after 30 seconds
  setTimeout(poll, 30000);
}

// Check if all providers responded and create quote
async function checkAndCreateQuote(requestId) {
  const costs = await Cost.find({ requestId });
  
  // Check if we have at least one successful response
  const successfulCosts = costs.filter(c => c.status === 'completed');
  if (successfulCosts.length === 0) return;
  
  // Check if all non-Pelicargo providers have responded
  const pendingCosts = costs.filter(c => 
    c.status === 'pending' && c.provider !== 'Pelicargo'
  );
  if (pendingCosts.length > 0) return;
  
  // Create or update quote
  let quote = await Quote.findOne({ requestId });
  
  if (!quote) {
    quote = await Quote.create({
      requestId,
      costIds: successfulCosts.map(c => c._id),
      status: 'draft'
    });
  } else {
    quote.costIds = successfulCosts.map(c => c._id);
    await quote.save();
  }
  
  // Apply markups and create final rates
  await applyMarkupsToQuote(quote);
  
  // Update request status
  await Request.findByIdAndUpdate(requestId, {
    status: 'completed',
    completedAt: new Date()
  });
  
  // Send notification to user
  // await sendQuoteReadyEmail(request.userEmail, quote.quoteNumber);
}

// Apply markups to quote
async function applyMarkupsToQuote(quote) {
  const costs = await Cost.find({ _id: { $in: quote.costIds } });
  const providers = await RateProvider.find({
    name: { $in: costs.map(c => c.provider) }
  });
  
  const rates = [];
  
  for (const cost of costs) {
    const provider = providers.find(p => p.name === cost.provider);
    if (!provider) continue;
    
    // Calculate markup
    const markupSettings = provider.markupSettings.air || provider.markupSettings.road;
    let markupAmount = cost.costs.totalCost * (markupSettings.percentage / 100);
    
    // Apply min/max constraints
    markupAmount = Math.max(markupAmount, markupSettings.minimumMarkup || 0);
    markupAmount = Math.min(markupAmount, markupSettings.maximumMarkup || Infinity);
    markupAmount += markupSettings.flatFee || 0;
    
    // Get additional fees
    const additionalFees = provider.additionalFees
      .filter(fee => fee.active)
      .map(fee => ({
        name: fee.name,
        code: fee.code,
        amount: fee.feeType === 'percentage' 
          ? cost.costs.totalCost * (fee.amount / 100)
          : fee.amount
      }));
    
    const totalAdditionalFees = additionalFees.reduce((sum, fee) => sum + fee.amount, 0);
    
    rates.push({
      provider: cost.provider,
      carrier: cost.carrier,
      costId: cost._id,
      originalCost: cost.costs.totalCost,
      markupAmount: markupAmount,
      markupPercentage: markupSettings.percentage,
      additionalFees: additionalFees,
      totalAdditionalFees: totalAdditionalFees,
      sellPrice: cost.costs.totalCost + markupAmount + totalAdditionalFees,
      service: cost.service,
      serviceType: cost.serviceType,
      transitTime: cost.transitTime,
      validUntil: cost.validUntil
    });
  }
  
  // Sort by price
  rates.sort((a, b) => a.sellPrice - b.sellPrice);
  
  // Update quote
  quote.rates = rates;
  quote.status = 'ready';
  quote.validUntil = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000); // 15 days
  await quote.save();
  
  return quote;
}

// Get quote status
router.get('/status/:requestId', authorize(), async (req, res) => {
  try {
    const request = await Request.findById(req.params.requestId);
    if (!request) {
      return res.status(404).json({ error: 'Request not found' });
    }
    
    const costs = await Cost.find({ requestId: request._id });
    const quote = await Quote.findOne({ requestId: request._id });
    
    res.json({
      success: true,
      request: {
        id: request._id,
        requestNumber: request.requestNumber,
        status: request.status,
        createdAt: request.createdAt
      },
      providers: costs.map(c => ({
        provider: c.provider,
        status: c.status,
        responseTime: c.responseTimeMs,
        cost: c.status === 'completed' ? c.costs.totalCost : null
      })),
      quote: quote ? {
        id: quote._id,
        quoteNumber: quote.quoteNumber,
        status: quote.status,
        ratesCount: quote.rates.length,
        lowestPrice: quote.rates[0]?.sellPrice
      } : null
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get quote details
router.get('/:quoteId', authorize(), async (req, res) => {
  try {
    const quote = await Quote.findById(req.params.quoteId)
      .populate('requestId')
      .populate('costIds');
    
    if (!quote) {
      return res.status(404).json({ error: 'Quote not found' });
    }
    
    res.json({
      success: true,
      quote
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
