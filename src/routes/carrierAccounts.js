// src/routes/carrierAccounts.js
const express = require('express');
const router = express.Router();
const CarrierAccount = require('../models/CarrierAccount');
const { authorize } = require('../middleware/authorize');

// Get all carrier accounts for current user/company
router.get('/', authorize(), async (req, res) => {
  try {
    const accounts = await CarrierAccount.find({
      $or: [
        { userId: req.user._id },
        { companyId: req.user.companyId }
      ]
    }).sort('carrier');
    
    res.json({
      success: true,
      accounts: accounts.map(account => ({
        _id: account._id,
        carrier: account.carrier,
        accountNumber: account.accountNumber,
        accountName: account.accountName,
        isActive: account.isActive,
        isValidated: account.isValidated,
        lastUsed: account.lastUsed,
        quoteCount: account.quoteCount
        // Don't send credentials in list view
      }))
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get single carrier account (with decrypted credentials for editing)
router.get('/:id', authorize(), async (req, res) => {
  try {
    const account = await CarrierAccount.findOne({
      _id: req.params.id,
      $or: [
        { userId: req.user._id },
        { companyId: req.user.companyId }
      ]
    });
    
    if (!account) {
      return res.status(404).json({ 
        success: false, 
        error: 'Carrier account not found' 
      });
    }
    
    // Get decrypted credentials for editing
    const decryptedCreds = account.getDecryptedCredentials();
    
    res.json({
      success: true,
      account: {
        ...account.toObject(),
        apiCredentials: decryptedCreds
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create new carrier account
router.post('/', authorize(), async (req, res) => {
  try {
    const { carrier, accountNumber, apiCredentials } = req.body;
    
    // Check if account already exists
    const existing = await CarrierAccount.findOne({
      companyId: req.user.companyId,
      carrier,
      accountNumber
    });
    
    if (existing) {
      return res.status(400).json({
        success: false,
        error: 'This carrier account already exists'
      });
    }
    
    const account = new CarrierAccount({
      userId: req.user._id,
      companyId: req.user.companyId,
      carrier,
      accountNumber,
      apiCredentials,
      createdBy: req.user._id
    });
    
    await account.save();
    
    res.json({
      success: true,
      message: 'Carrier account added successfully',
      account: {
        _id: account._id,
        carrier: account.carrier,
        accountNumber: account.accountNumber
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update carrier account
router.put('/:id', authorize(), async (req, res) => {
  try {
    const account = await CarrierAccount.findOne({
      _id: req.params.id,
      $or: [
        { userId: req.user._id },
        { companyId: req.user.companyId }
      ]
    });
    
    if (!account) {
      return res.status(404).json({
        success: false,
        error: 'Carrier account not found'
      });
    }
    
    // Update fields
    const allowedUpdates = [
      'accountNumber', 'accountName', 'apiCredentials',
      'isActive', 'useForQuotes', 'useForBooking',
      'ratePreferences', 'notes'
    ];
    
    allowedUpdates.forEach(field => {
      if (req.body[field] !== undefined) {
        account[field] = req.body[field];
      }
    });
    
    await account.save();
    
    res.json({
      success: true,
      message: 'Carrier account updated',
      account
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Validate carrier account credentials
router.post('/:id/validate', authorize(), async (req, res) => {
  try {
    const account = await CarrierAccount.findOne({
      _id: req.params.id,
      $or: [
        { userId: req.user._id },
        { companyId: req.user.companyId }
      ]
    });
    
    if (!account) {
      return res.status(404).json({
        success: false,
        error: 'Carrier account not found'
      });
    }
    
    // Get the appropriate provider
    const GroundProviderFactory = require('../services/providers/GroundProviderFactory');
    const provider = GroundProviderFactory.getProviderWithAccount(
      account.carrier,
      account
    );
    
    if (!provider) {
      return res.status(400).json({
        success: false,
        error: 'Carrier not supported yet'
      });
    }
    
    // Try to authenticate/validate
    try {
      const testRequest = {
        origin: { zipCode: '10001', city: 'New York', state: 'NY' },
        destination: { zipCode: '90001', city: 'Los Angeles', state: 'CA' },
        pickupDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
        commodities: [{
          unitType: 'Pallets',
          quantity: 1,
          weight: 100,
          length: 48,
          width: 40,
          height: 40,
          description: 'Test validation'
        }]
      };
      
      const result = await provider.getRates(testRequest);
      
      if (result) {
        account.isValidated = true;
        account.lastValidated = new Date();
        account.validationError = null;
        await account.save();
        
        res.json({
          success: true,
          message: 'Account validated successfully',
          testRate: result.totalCost
        });
      } else {
        throw new Error('No rates returned');
      }
    } catch (validationError) {
      account.isValidated = false;
      account.validationError = validationError.message;
      await account.save();
      
      res.status(400).json({
        success: false,
        error: 'Account validation failed',
        details: validationError.message
      });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete carrier account
router.delete('/:id', authorize(), async (req, res) => {
  try {
    const account = await CarrierAccount.findOne({
      _id: req.params.id,
      $or: [
        { userId: req.user._id },
        { companyId: req.user.companyId }
      ]
    });
    
    if (!account) {
      return res.status(404).json({
        success: false,
        error: 'Carrier account not found'
      });
    }
    
    await account.deleteOne();
    
    res.json({
      success: true,
      message: 'Carrier account deleted'
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get available carriers (for dropdown)
router.get('/carriers/available', authorize(), async (req, res) => {
  const carriers = [
    { code: 'FEDEX_FREIGHT', name: 'FedEx Freight', hasAPI: true },
    { code: 'OLD_DOMINION', name: 'Old Dominion', hasAPI: true },
    { code: 'XPO', name: 'XPO Logistics', hasAPI: true },
    { code: 'ESTES', name: 'Estes Express Lines', hasAPI: true },
    { code: 'RL_CARRIERS', name: 'R+L Carriers', hasAPI: true },
    { code: 'TFORCE', name: 'TForce Freight', hasAPI: true },
    { code: 'SAIA', name: 'Saia LTL Freight', hasAPI: true },
    { code: 'ABF', name: 'ABF Freight', hasAPI: true },
    { code: 'SEFL', name: 'Southeastern Freight Lines', hasAPI: true },
    { code: 'AVERITT', name: 'Averitt Express', hasAPI: false },
    { code: 'FEDEX_EXPRESS', name: 'FedEx Express', hasAPI: true },
    { code: 'UPS', name: 'UPS', hasAPI: true }
  ];
  
  res.json({ success: true, carriers });
});

module.exports = router;
