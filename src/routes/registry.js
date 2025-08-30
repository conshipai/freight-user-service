// src/routes/registry.js
const express = require('express');
const router = express.Router();

// Apps registry for module federation
router.get('/', (req, res) => {
  res.json({
    quotes: {
      name: 'quotes',
      url: 'https://quotes.gcc.conship.ai/remoteEntry.js',
      scope: 'quotes',
      module: './App'
    }
    // Add more modules here as you create them
    // Example for future modules:
    // tracking: {
    //   name: 'tracking',
    //   url: 'https://tracking.gcc.conship.ai/remoteEntry.js',
    //   scope: 'tracking',
    //   module: './App'
    // }
  });
});

module.exports = router;
