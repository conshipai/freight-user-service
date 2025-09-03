// src/routes/registry.js
const express = require('express');
const router = express.Router();

// Apps registry for module federation
router.get('/', (req, res) => {
  res.json({
    apps: [
      {
        id: 'quotes',
        name: 'Quotes',
        icon: 'Calculator',
        url: 'https://quotes.gcc.conship.ai',
        remoteEntry: 'https://quotes.gcc.conship.ai/remoteEntry.js',
        scope: 'quotes',
        module: './App',
        type: 'module',
        roles: ['system_admin', 'conship_employee', 'partner_admin', 'customer'],
        position: 1,
        status: 'active',
        description: 'Generate and manage freight quotes'
      }
      // Add more apps here as you create them
    ]
  });
});

module.exports = router;
