const express = require('express');
const router = express.Router();
const Quote = require('../models/Quote');
const RateProvider = require('../models/RateProvider');
const Partner = require('../models/Partner');
const ServiceArea = require('../models/ServiceArea');
const ProviderFactory = require('../services/providers/ProviderFactory');
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

// Get rates from providers (Updated with real API calls)
async function getRatesFromProviders(shipment) {
  const providers = await RateProvider.find({
    status: 'active',
    'services.mode': shipment.mode
  }).sort('priority');
  
  const rates = [];
  
  // Use Promise.allSettled for parallel requests with timeout
  const ratePromises = providers.map(async (providerConfig) => {
    const startTime = Date.now();
    
    try {
      // Skip manual providers
      if (providerConfig.type === 'manual') {
        return null;
      }
      
      // Create provider instance using factory
      const provider = ProviderFactory.create(providerConfig.toObject());
      
      // Set a timeout for the API call (e.g., 10 seconds)
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Provider timeout')), 10000)
      );
      
      // Race between the actual API call and timeout
      const quote = await Promise.race([
        provider.getQuote({
          mode: shipment.mode,
          origin: shipment.origin,
          destination: shipment.destination,
          cargo: shipment.cargo,
          incoterms: shipment.incoterms,
          commodities: shipment.commodities
        }),
        timeoutPromise
      ]);
      
      const responseTime = Date.now() - startTime;
      
      // Update success metrics
      providerConfig.metrics.totalQuotes++;
      providerConfig.metrics.successfulQuotes++;
      providerConfig.metrics.averageResponseTime = 
        (providerConfig.metrics.averageResponseTime * (providerConfig.metrics.totalQuotes - 1) + responseTime) 
        / providerConfig.metrics.totalQuotes;
      providerConfig.metrics.lastSuccessAt = new Date();
      await providerConfig.save();
      
      return {
        ...quote,
        providerId: providerConfig._id,
        providerName: providerConfig.name,
        providerCode: providerConfig.code,
        responseTime
      };
      
    } catch (error) {
      console.error(`Failed to get rate from ${providerConfig.name}:`, error);
      
      // Update failure metrics
      providerConfig.metrics.totalQuotes++;
      providerConfig.metrics.failedQuotes++;
      providerConfig.metrics.lastFailureAt = new Date();
      providerConfig.metrics.failureReason = error.message;
      await providerConfig.save();
      
      return null;
    }
  });
  
  // Wait for all promises to settle
  const results = await Promise.allSettled(ratePromises);
  
  // Filter out failed/null results and flatten
  for (const result of results) {
    if (result.status === 'fulfilled' && result.value) {
      rates.push(result.value);
    }
  }
  
  return rates;
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
        percentage: provider.markupSettings[shipment.mode]?.percentage || 0,
        amount: markupAmount,
        flatFee: provider.markupSettings[shipment.mode]?.flatFee || 0,
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

// Refresh rates for an existing quote
router.post('/:quoteNumber/refresh', authorize(), async (req, res) => {
  try {
    const quote = await Quote.findOne({ quoteNumber: req.params.quoteNumber });
    
    if (!quote) {
      return res.status(404).json({ error: 'Quote not found' });
    }
    
    if (quote.status !== 'quoted' && quote.status !== 'draft') {
      return res.status(400).json({ error: 'Cannot refresh rates for this quote status' });
    }
    
    // Get fresh rates
    const rates = await getRatesFromProviders(quote.shipment);
    
    // Apply markups
    const processedRates = await processRatesWithMarkup(rates, quote.shipment);
    
    // Update quote
    quote.rates = processedRates;
    quote.validUntil = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000); // Reset validity
    
    // Add to history
    quote.history.push({
      action: 'refreshed',
      user: req.user._id,
      details: { previousRateCount: quote.rates.length, newRateCount: processedRates.length }
    });
    
    await quote.save();
    
    res.json({
      success: true,
      message: 'Rates refreshed successfully',
      quote
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Export quote as PDF
router.get('/:quoteNumber/export', authorize(), async (req, res) => {
  try {
    const quote = await Quote.findOne({ quoteNumber: req.params.quoteNumber })
      .populate('requestedBy', 'name email company')
      .populate('rates.providerId', 'name code logo');
    
    if (!quote) {
      return res.status(404).json({ error: 'Quote not found' });
    }
    
    // TODO: Implement PDF generation
    // For now, return the quote data that would be used for PDF
    res.json({
      success: true,
      message: 'PDF export not yet implemented',
      data: {
        quoteNumber: quote.quoteNumber,
        customer: {
          email: quote.customerEmail,
          company: quote.customerCompany
        },
        shipment: quote.shipment,
        rates: quote.rates.map(rate => ({
          provider: rate.providerName,
          transitTime: rate.transitTime,
          sellPrice: rate.sellRates.totalSell,
          validUntil: rate.validUntil
        })),
        validUntil: quote.validUntil,
        createdAt: quote.createdAt
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
