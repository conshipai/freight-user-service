const express = require('express');
const router = express.Router();
const ProviderFactory = require('../services/providers/ProviderFactory');
const { authorize } = require('../middleware/authorize');

// Test single provider
router.post('/provider/:code', authorize(['system_admin']), async (req, res) => {
  try {
    const { code } = req.params;
    const { origin, destination, cargo } = req.body;
    
    const providerConfig = await RateProvider.findOne({ code: code.toUpperCase() });
    if (!providerConfig) {
      return res.status(404).json({ error: 'Provider not found' });
    }
    
    const provider = ProviderFactory.create(providerConfig.toObject());
    
    const quote = await provider.getQuote({
      mode: providerConfig.services[0].mode,
      origin,
      destination,
      cargo
    });
    
    res.json({
      success: true,
      provider: providerConfig.name,
      quote
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

// Test complete flow
router.post('/quote-flow', authorize(['system_admin']), async (req, res) => {
  try {
    const testRequest = {
      origin: {
        country: 'US',
        city: 'El Paso',
        postalCode: '79901',
        portCode: 'USLAX'
      },
      destination: {
        country: 'DE',
        city: 'Hamburg',
        airportCode: 'HAM',
        portCode: 'DEHAM'
      },
      cargo: {
        weight: 500,
        weightUnit: 'kg',
        volume: 2,
        volumeUnit: 'cbm',
        pieces: 5,
        description: 'Test Cargo'
      },
      ...req.body // Allow override
    };
    
    // Test ground pickup (FreightForce)
    const groundQuote = await testProvider('FREIGHTFORCE', {
      ...testRequest,
      mode: 'road'
    });
    
    // Test ocean freight (ECU Lines)
    const oceanQuote = await testProvider('ECULINES', {
      ...testRequest,
      mode: 'ocean'
    });
    
    res.json({
      success: true,
      message: 'Quote flow test complete',
      results: {
        ground: groundQuote,
        ocean: oceanQuote
      },
      summary: {
        groundCost: groundQuote?.quote?.costs?.totalCost,
        groundSell: groundQuote?.quote?.sellRates?.totalSell,
        oceanCost: oceanQuote?.quote?.costs?.totalCost,
        oceanSell: oceanQuote?.quote?.sellRates?.totalSell
      }
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

async function testProvider(code, request) {
  try {
    const providerConfig = await RateProvider.findOne({ code });
    if (!providerConfig) return null;
    
    const provider = ProviderFactory.create(providerConfig.toObject());
    return {
      provider: providerConfig.name,
      quote: await provider.getQuote(request)
    };
  } catch (error) {
    return {
      provider: code,
      error: error.message
    };
  }
}

module.exports = router;
