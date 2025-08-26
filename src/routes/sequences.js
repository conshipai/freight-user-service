// src/routes/sequences.js
const express = require('express');
const router = express.Router();
const Sequence = require('../models/Sequence');

// Generate next sequence number
router.post('/next', async (req, res) => {
  try {
    const { type = 'REQ', year = new Date().getFullYear() } = req.body || {};
    
    // Atomic increment
    const seq = await Sequence.findOneAndUpdate(
      { type, year },
      { $inc: { counter: 1 } },
      { 
        upsert: true, 
        new: true, 
        setDefaultsOnInsert: true 
      }
    );
    
    const number = `${type}-${year}-${seq.counter}`;
    res.json({ 
      success: true,
      number 
    });
  } catch (err) {
    console.error('Sequence error:', err);
    res.status(500).json({ 
      success: false,
      error: 'Failed to generate sequence' 
    });
  }
});

// Bulk generate (for REQ, Q, COST at once)
router.post('/bulk', async (req, res) => {
  try {
    const year = new Date().getFullYear();
    const { types = ['REQ', 'Q', 'COST'] } = req.body;
    
    const results = {};
    
    for (const type of types) {
      const seq = await Sequence.findOneAndUpdate(
        { type, year },
        { $inc: { counter: 1 } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      results[type] = `${type}-${year}-${seq.counter}`;
    }
    
    res.json({ 
      success: true,
      numbers: results 
    });
  } catch (err) {
    console.error('Bulk sequence error:', err);
    res.status(500).json({ 
      success: false,
      error: 'Failed to generate sequences' 
    });
  }
});

module.exports = router;
