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
