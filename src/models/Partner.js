// routes/partners.js
const express = require('express');
const router = express.Router();
const Partner = require('../models/Partner'); // make sure this path matches your project
const mongoose = require('mongoose');

// ---------- Test Endpoint (NEW) ----------
router.get('/api/partners/test-new-structure', async (req, res) => {
  try {
    // Return the expected shape/enums so frontend can validate easily
    const sample = {
      companyName: 'Sample Logistics LLC',
      companyCode: 'SAMPLE',
      type: 'customer', // or 'foreign_partner'
      country: 'US',
      address: {
        street: '123 Demo St',
        city: 'Houston',
        state: 'TX',
        postalCode: '77001',
        country: 'US'
      },
      phone: '+1-555-123-4567',
      email: 'ops@sample.com',
      taxVatNumber: 'US-12345',
      status: 'pending', // pending | approved | suspended | inactive
      apiMarkups: {
        pelicargo: 15,
        freightForce: 18,
        ecuLines: 20
      },
      modeCharges: {
        air: [{ name: 'AWB Fee', amount: 35 }],
        ocean: [{ name: 'DOC Fee', amount: 50 }],
        ground: [{ name: 'BOL Fee', amount: 25 }]
      },
      modules: ['Pricing Portal'],
      additionalFees: [
        { name: 'Documentation', amount: 35, serviceType: 'all', feeType: 'fixed', active: true }
      ],
      kycStatus: 'pending',
      paymentTerms: 'NET30',
      currency: 'USD',
      bankDetails: { bankName: '', accountNumber: '', routingNumber: '' },
      operatingHours: { timezone: 'America/Chicago' },
      notes: ''
    };

    const enums = {
      type: ['customer', 'foreign_partner'],
      status: ['pending', 'approved', 'suspended', 'inactive'],
      additionalFeeServiceType: ['air', 'ocean', 'road', 'all'],
      additionalFeeType: ['fixed', 'percentage']
    };

    res.json({ success: true, sample, enums });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---------- List Partners (kept for compatibility) ----------
router.get('/api/partners', async (req, res) => {
  try {
    const { q, status, type, country, limit = 50, page = 1 } = req.query;

    const filter = {};
    if (status) filter.status = status;
    if (type) filter.type = type;
    if (country) filter.country = country;
    if (q) {
      filter.$or = [
        { companyName: new RegExp(q, 'i') },
        { companyCode: new RegExp(q, 'i') },
        { email: new RegExp(q, 'i') }
      ];
    }

    const partners = await Partner.find(filter)
      .sort({ createdAt: -1 })
      .limit(Math.min(Number(limit), 200))
      .skip((Number(page) - 1) * Number(limit))
      .lean();

    const total = await Partner.countDocuments(filter);

    res.json({ success: true, partners, total, page: Number(page) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---------- Get Partner by ID (kept) ----------
router.get('/api/partners/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, error: 'Invalid partner id' });
    }
    const partner = await Partner.findById(id).lean();
    if (!partner) return res.status(404).json({ success: false, error: 'Partner not found' });
    res.json({ success: true, partner });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---------- Create Partner (UPDATED to handle new structure) ----------
router.post('/api/partners', async (req, res) => {
  try {
    const body = req.body || {};

    // Normalize companyCode to uppercase and trim
    if (body.companyCode) {
      body.companyCode = String(body.companyCode).trim().toUpperCase();
    }

    // Ensure required fields exist
    const requiredFields = ['companyName', 'companyCode', 'type', 'country', 'phone', 'email'];
    for (const f of requiredFields) {
      if (!body[f]) {
        return res.status(400).json({ success: false, error: `Missing required field: ${f}` });
      }
    }

    // Defaults/shape safety for nested structures
    body.address = body.address || {};
    body.apiMarkups = {
      pelicargo: body?.apiMarkups?.pelicargo ?? 15,
      freightForce: body?.apiMarkups?.freightForce ?? 18,
      ecuLines: body?.apiMarkups?.ecuLines ?? 20
    };
    body.modeCharges = {
      air: Array.isArray(body?.modeCharges?.air) ? body.modeCharges.air : [],
      ocean: Array.isArray(body?.modeCharges?.ocean) ? body.modeCharges.ocean : [],
      ground: Array.isArray(body?.modeCharges?.ground) ? body.modeCharges.ground : []
    };
    body.modules = Array.isArray(body.modules) && body.modules.length ? body.modules : ['Pricing Portal'];
    body.additionalFees = Array.isArray(body.additionalFees) ? body.additionalFees : [];
    body.kycStatus = body.kycStatus || 'pending';
    body.paymentTerms = body.paymentTerms || 'NET30';
    body.currency = body.currency || 'USD';

    const created = await Partner.create(body);
    res.status(201).json({ success: true, partner: created });
  } catch (err) {
    // Handle duplicate companyCode/companyName nicely
    if (err?.code === 11000) {
      return res.status(409).json({ success: false, error: 'Duplicate companyCode or companyName' });
    }
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---------- Update Partner (kept) ----------
router.put('/api/partners/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const update = { ...req.body };

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, error: 'Invalid partner id' });
    }

    // Normalize companyCode if present
    if (update.companyCode) {
      update.companyCode = String(update.companyCode).trim().toUpperCase();
    }

    // Prevent accidental overwrite of nested objects without explicit values
    if (update.apiMarkups) {
      update.apiMarkups = {
        pelicargo: update.apiMarkups.pelicargo,
        freightForce: update.apiMarkups.freightForce,
        ecuLines: update.apiMarkups.ecuLines
      };
    }
    if (update.modeCharges) {
      update.modeCharges = {
        air: Array.isArray(update.modeCharges.air) ? update.modeCharges.air : [],
        ocean: Array.isArray(update.modeCharges.ocean) ? update.modeCharges.ocean : [],
        ground: Array.isArray(update.modeCharges.ground) ? update.modeCharges.ground : []
      };
    }

    const partner = await Partner.findByIdAndUpdate(
      id,
      { $set: update },
      { new: true, runValidators: true }
    ).lean();

    if (!partner) return res.status(404).json({ success: false, error: 'Partner not found' });
    res.json({ success: true, partner });
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({ success: false, error: 'Duplicate companyCode or companyName' });
    }
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---------- Update Pricing Only (NEW) ----------
router.put('/api/partners/:id/pricing', async (req, res) => {
  try {
    const { id } = req.params;
    const { apiMarkups, modeCharges, additionalFees } = req.body || {};

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, error: 'Invalid partner id' });
    }

    const set = {};
    if (apiMarkups) {
      set['apiMarkups'] = {
        ...(apiMarkups.pelicargo !== undefined && { pelicargo: apiMarkups.pelicargo }),
        ...(apiMarkups.freightForce !== undefined && { freightForce: apiMarkups.freightForce }),
        ...(apiMarkups.ecuLines !== undefined && { ecuLines: apiMarkups.ecuLines })
      };
    }
    if (modeCharges) {
      set['modeCharges'] = {
        air: Array.isArray(modeCharges.air) ? modeCharges.air : [],
        ocean: Array.isArray(modeCharges.ocean) ? modeCharges.ocean : [],
        ground: Array.isArray(modeCharges.ground) ? modeCharges.ground : []
      };
    }
    if (additionalFees) {
      set['additionalFees'] = Array.isArray(additionalFees) ? additionalFees : [];
    }

    if (Object.keys(set).length === 0) {
      return res.status(400).json({ success: false, error: 'No pricing fields provided' });
    }

    const updated = await Partner.findByIdAndUpdate(
      id,
      { $set: set },
      { new: true, runValidators: true }
    ).lean();

    if (!updated) return res.status(404).json({ success: false, error: 'Partner not found' });
    res.json({ success: true, partner: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---------- Delete Partner (kept, optional) ----------
router.delete('/api/partners/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, error: 'Invalid partner id' });
    }
    const deleted = await Partner.findByIdAndDelete(id).lean();
    if (!deleted) return res.status(404).json({ success: false, error: 'Partner not found' });
    res.json({ success: true, partner: deleted });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
