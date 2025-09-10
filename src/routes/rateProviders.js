const express = require('express');
const router = express.Router();
const RateProvider = require('../models/RateProvider');
const authorize = require('../middleware/authorize');

// ─────────────────────────────────────────────────────────────
// RATE PROVIDER MANAGEMENT (Admin Only)
// ─────────────────────────────────────────────────────────────

// Get all rate providers
router.get('/', authorize(['system_admin']), async (req, res) => {
  try {
    const { status, mode } = req.query;
    
    const query = {};
    if (status) query.status = status;
    if (mode) query['services.mode'] = mode;
    
    const providers = await RateProvider.find(query)
      .select('-apiConfig.apiKey -apiConfig.apiSecret -apiConfig.password')
      .sort('priority');
    
    res.json({ success: true, providers });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create new rate provider
router.post('/', authorize(['system_admin']), async (req, res) => {
  try {
    const provider = new RateProvider(req.body);
    await provider.save();
    
    res.status(201).json({ 
      success: true, 
      message: 'Rate provider created successfully',
      provider 
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Get single rate provider
router.get('/:id', authorize(['system_admin']), async (req, res) => {
  try {
    const provider = await RateProvider.findById(req.params.id)
      .select('-apiConfig.apiKey -apiConfig.apiSecret -apiConfig.password');
    
    if (!provider) {
      return res.status(404).json({ error: 'Rate provider not found' });
    }
    
    res.json({ success: true, provider });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update rate provider
router.put('/:id', authorize(['system_admin']), async (req, res) => {
  try {
    const provider = await RateProvider.findById(req.params.id);
    
    if (!provider) {
      return res.status(404).json({ error: 'Rate provider not found' });
    }
    
    // Don't overwrite sensitive API config unless explicitly provided
    const updates = { ...req.body };
    if (updates.apiConfig && provider.apiConfig) {
      updates.apiConfig = {
        ...provider.apiConfig.toObject(),
        ...updates.apiConfig
      };
    }
    
    Object.assign(provider, updates);
    await provider.save();
    
    res.json({ 
      success: true, 
      message: 'Rate provider updated successfully',
      provider 
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Update markup settings for a provider
router.put('/:id/markup', authorize(['system_admin']), async (req, res) => {
  try {
    const { markupSettings, laneMarkups } = req.body;
    
    const provider = await RateProvider.findById(req.params.id);
    if (!provider) {
      return res.status(404).json({ error: 'Rate provider not found' });
    }
    
    if (markupSettings) {
      provider.markupSettings = {
        ...provider.markupSettings.toObject(),
        ...markupSettings
      };
    }
    
    if (laneMarkups) {
      provider.laneMarkups = laneMarkups;
    }
    
    await provider.save();
    
    res.json({ 
      success: true, 
      message: 'Markup settings updated',
      markupSettings: provider.markupSettings,
      laneMarkups: provider.laneMarkups
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Test API connection
router.post('/:id/test', authorize(['system_admin']), async (req, res) => {
  try {
    const provider = await RateProvider.findById(req.params.id);
    if (!provider) {
      return res.status(404).json({ error: 'Rate provider not found' });
    }
    
    // Here you would implement the actual API test based on provider type
    // For now, we'll simulate it
    const testResult = await testProviderConnection(provider);
    
    // Update metrics
    if (testResult.success) {
      provider.metrics.lastSuccessAt = new Date();
    } else {
      provider.metrics.lastFailureAt = new Date();
      provider.metrics.failureReason = testResult.error;
    }
    await provider.save();
    
    res.json({ 
      success: testResult.success,
      message: testResult.success ? 'Connection successful' : 'Connection failed',
      details: testResult
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Activate/Deactivate provider
router.put('/:id/status', authorize(['system_admin']), async (req, res) => {
  try {
    const { status } = req.body;
    
    const provider = await RateProvider.findById(req.params.id);
    if (!provider) {
      return res.status(404).json({ error: 'Rate provider not found' });
    }
    
    provider.status = status;
    await provider.save();
    
    res.json({ 
      success: true, 
      message: `Provider ${status}`,
      provider 
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Get provider performance metrics
router.get('/:id/metrics', authorize(['system_admin']), async (req, res) => {
  try {
    const provider = await RateProvider.findById(req.params.id)
      .select('name code metrics');
    
    if (!provider) {
      return res.status(404).json({ error: 'Rate provider not found' });
    }
    
    // Calculate success rate
    const totalAttempts = provider.metrics.successfulQuotes + provider.metrics.failedQuotes;
    const successRate = totalAttempts > 0 
      ? (provider.metrics.successfulQuotes / totalAttempts * 100).toFixed(2)
      : 0;
    
    res.json({ 
      success: true,
      provider: provider.name,
      metrics: {
        ...provider.metrics.toObject(),
        successRate: `${successRate}%`,
        totalAttempts
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Helper function to test provider connection
async function testProviderConnection(provider) {
  // This would be implemented based on each provider's API
  // For demonstration, we'll simulate the test
  
  try {
    if (provider.type === 'api') {
      // Simulate API call
      const startTime = Date.now();
      
      // Here you would make actual API call
      // const response = await makeApiCall(provider.apiConfig);
      
      // Simulated delay
      await new Promise(resolve => setTimeout(resolve, Math.random() * 2000));
      
      const responseTime = Date.now() - startTime;
      
      // Randomly succeed or fail for demo
      if (Math.random() > 0.2) {
        return {
          success: true,
          responseTime,
          message: 'API responded successfully'
        };
      } else {
        throw new Error('Simulated API failure');
      }
    }
    
    return {
      success: true,
      message: 'Provider is manual/email type'
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

module.exports = router;
