// src/routes/cache.js
const express = require('express');
const router = express.Router();
const QuoteCache = require('../models/QuoteCache');

// Save to cache (replaces localStorage.setItem)
router.post('/cache/set', async (req, res) => {
  try {
    const { key, type, data, referenceId } = req.body;
    const userId = req.user?._id || null; // From your auth middleware
    
    // Create cache key (similar to localStorage key)
    const cacheKey = key;
    
    // Upsert - update if exists, create if not
    const cached = await QuoteCache.findOneAndUpdate(
      { cacheKey },
      {
        cacheKey,
        cacheType: type,
        data,
        userId,
        referenceId,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      },
      { upsert: true, new: true }
    );
    
    res.json({ success: true, id: cached._id });
  } catch (error) {
    console.error('Cache set error:', error);
    res.status(500).json({ error: 'Failed to cache data' });
  }
});

// Get from cache (replaces localStorage.getItem)
router.get('/cache/get/:key', async (req, res) => {
  try {
    const { key } = req.params;
    
    const cached = await QuoteCache.findOne({ cacheKey: key });
    
    if (!cached) {
      return res.json({ success: true, data: null });
    }
    
    res.json({ success: true, data: cached.data });
  } catch (error) {
    console.error('Cache get error:', error);
    res.status(500).json({ error: 'Failed to get cached data' });
  }
});

// Remove from cache (replaces localStorage.removeItem)
router.delete('/cache/remove/:key', async (req, res) => {
  try {
    const { key } = req.params;
    
    await QuoteCache.deleteOne({ cacheKey: key });
    
    res.json({ success: true });
  } catch (error) {
    console.error('Cache remove error:', error);
    res.status(500).json({ error: 'Failed to remove cached data' });
  }
});

// Get all cache entries for a reference (useful for debugging)
router.get('/cache/reference/:referenceId', async (req, res) => {
  try {
    const { referenceId } = req.params;
    
    const cached = await QuoteCache.find({ referenceId });
    
    res.json({ success: true, data: cached });
  } catch (error) {
    console.error('Cache reference error:', error);
    res.status(500).json({ error: 'Failed to get cached data' });
  }
});

module.exports = router;
