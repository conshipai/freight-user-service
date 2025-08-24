const express = require('express');
const router = express.Router();
const Quote = require('../models/Quote');
const RateProvider = require('../models/RateProvider');
const Partner = require('../models/Partner');
const ServiceArea = require('../models/ServiceArea');
const { authorize } = require('../middleware/authorize');

// ─────────────────────────────────────────────────────────────
// QUOTE GENERATION
// ─────────────────────────────────────────────────────────────

// Create new quote request
router.post('/create', authorize(), async (req, res) => {
  try {
    const { shipment, customerEmail, customerCompany } = req.body;
    
    // Create quote document
    const quote = new Quote({
      requestedBy: req.user._id,
      customerEmail,
      customerCompany,
      shipment,
      status: 'draft'
    });
    
    // Get rates from all active providers
    const rates = await getRatesFromProviders(shipment);
    
    // Apply markups and calculate sell rates
    const processedRates = await processRatesWithMarkup(rates, shipment);
    
    quote.rates = processedRates;
    quote.status = 'quoted';
    quote.validUntil = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000); // 15 days
    
    await quote.save();
    
    res.json({
      success: true,
      quote: {
        quoteNumber: quote.quoteNumber,
        rates: quote.rates,
        validUntil: quote.validUntil
      }
    });
  } catch (error) {
    console.error('Quote creation error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get rates from providers
async function getRatesFromProviders(shipment) {
  const providers = await RateProvider.find({
    status: 'active',
    'services.mode': shipment.mode
  }).sort('priority');
  
  const rates = [];
  
  for (const provider of providers) {
    try {
      const startTime = Date.now();
      
      // Get rate based on provider type
      let rate;
      if (provider.type === 'api') {
        rate = await getApiRate(provider, shipment);
      } else {
        // For manual providers, use stored rates or skip
        continue;
      }
      
      if (rate) {
        rates.push({
          providerId: provider._id,
          providerName: provider.name,
          providerCode: provider.code,
          costs: rate.costs,
          transitTime: rate.transitTime,
          responseTime: Date.now() - startTime
        });
        
        // Update provider metrics
        provider.metrics.totalQuotes++;
        provider.metrics.successfulQuotes++;
        provider.metrics.averageResponseTime = 
          (provider.metrics.averageResponseTime * (provider.metrics.totalQuotes - 1) + (Date.now() - startTime)) 
          / provider.metrics.totalQuotes;
        await provider.save();
      }
    } catch (error) {
      console.error(`Failed to get rate from ${provider.name}:`, error);
      
      // Update failure metrics
      provider.metrics.totalQuotes++;
      provider.metrics.failedQuotes++;
      provider.metrics.lastFailureAt = new Date();
      provider.metrics.failureReason = error.message;
      await provider.save();
    }
  }
  
  return rates;
}

// Simulate API rate fetching (you'll implement actual API calls)
async function getApiRate(provider, shipment) {
  // This is where you'd integrate with actual APIs
  // For now, we'll simulate it
  
  // Simulate API delay
  await new Promise(resolve => setTimeout(resolve, Math.random() * 1000 + 500));
  
  // Generate mock rate based on shipment
  const baseCost = calculateBaseCost(shipment);
  
  return {
    costs: {
      freight: baseCost,
      fuel: baseCost * 0.15,
      security: 25,
      handling: 50,
      documentation: 35,
      other: [],
      totalCost: baseCost + (baseCost * 0.15) + 25 + 50 + 35
    },
    transitTime: Math.floor(Math.random() * 5) + 2 // 2-7 days
  };
}

// Calculate base cost (mock function)
function calculateBaseCost(shipment) {
  const { mode, cargo } = shipment;
  const weight = cargo.weight || 100;
  
  const ratePerKg = {
    air: 5,
    ocean: 0.5,
    road: 1.5
  };
  
  return weight * (ratePerKg[mode] || 1);
}

// Process rates with markup
async function processRatesWithMarkup(rates, shipment) {
  const processedRates = [];
  
  for (const rate of rates) {
    const provider = await RateProvider.findById(rate.providerId);
    if (!provider) continue;
    
    // Calculate markup using the provider's method
    const markupAmount = provider.calculateMarkup(
      rate.costs.totalCost,
      shipment.mode,
      `${shipment.origin.country}-${shipment.origin.city}`,
      `${shipment.destination.country}-${shipment.destination.city}`
    );
    
    // Get additional fees for this service type
    const additionalFees = provider.additionalFees
      .filter(fee => 
        fee.active && 
        (fee.serviceType === 'all' || fee.serviceType === shipment.mode)
      )
      .map(fee => ({
        name: fee.name,
        code: fee.code,
        amount: fee.feeType === 'percentage' 
          ? rate.costs.totalCost * (fee.amount / 100)
          : fee.amount
      }));
    
    const totalAdditionalFees = additionalFees.reduce((sum, fee) => sum + fee.amount, 0);
    
    // Calculate sell rates
    const markupMultiplier = 1 + (markupAmount / rate.costs.totalCost);
    const sellRates = {
      freight: rate.costs.freight * markupMultiplier,
      fuel: rate.costs.fuel * markupMultiplier,
      security: rate.costs.security * markupMultiplier,
      handling: rate.costs.handling * markupMultiplier,
      documentation: rate.costs.documentation * markupMultiplier,
      additionalFees: totalAdditionalFees,
      totalSell: (rate.costs.totalCost + markupAmount + totalAdditionalFees)
    };
    
    processedRates.push({
      ...rate,
      markup: {
        percentage: provider.markupSettings[shipment.mode].percentage,
        amount: markupAmount,
        flatFee: provider.markupSettings[shipment.mode].flatFee || 0,
        totalMarkup: markupAmount
      },
      additionalFees,
      sellRates,
      validUntil: new Date(Date.now() + provider.rateValidity * 60 * 60 * 1000)
    });
  }
  
  // Sort by total sell price
  processedRates.sort((a, b) => a.sellRates.totalSell - b.sellRates.totalSell);
  
  return processedRates;
}

// Get quote by number
router.get('/:quoteNumber', authorize(), async (req, res) => {
  try {
    const quote = await Quote.findOne({ quoteNumber: req.params.quoteNumber })
      .populate('requestedBy', 'name email')
      .populate('rates.providerId', 'name code');
    
    if (!quote) {
      return res.status(404).json({ error: 'Quote not found' });
    }
    
    res.json({ success: true, quote });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Accept quote and book
router.post('/:quoteNumber/accept', authorize(), async (req, res) => {
  try {
    const { selectedRateId } = req.body;
    
    const quote = await Quote.findOne({ quoteNumber: req.params.quoteNumber });
    
    if (!quote) {
      return res.status(404).json({ error: 'Quote not found' });
    }
    
    if (quote.status !== 'quoted') {
      return res.status(400).json({ error: 'Quote is not in valid status for acceptance' });
    }
    
    // Mark selected rate
    const selectedRate = quote.rates.find(r => r._id.toString() === selectedRateId);
    if (!selectedRate) {
      return res.status(400).json({ error: 'Selected rate not found' });
    }
    
    selectedRate.selected = true;
    quote.selectedRate = selectedRateId;
    quote.status = 'accepted';
    
    // Add to history
    quote.history.push({
      action: 'accepted',
      user: req.user._id,
      details: { selectedRateId }
    });
    
    await quote.save();
    
    // TODO: Trigger booking process
    
    res.json({ 
      success: true, 
      message: 'Quote accepted successfully',
      quote 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all quotes with filters
router.get('/', authorize(), async (req, res) => {
  try {
    const { status, mode, origin, destination, limit = 50 } = req.query;
    
    const query = {};
    if (status) query.status = status;
    if (mode) query['shipment.mode'] = mode;
    if (origin) query['shipment.origin.country'] = origin;
    if (destination) query['shipment.destination.country'] = destination;
    
    const quotes = await Quote.find(query)
      .limit(parseInt(limit))
      .sort('-createdAt')
      .select('quoteNumber status shipment.origin shipment.destination shipment.mode createdAt validUntil');
    
    res.json({ success: true, quotes });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
