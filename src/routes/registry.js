// src/routes/registry.js
const express = require('express');
const router = express.Router();
const authorize = require('../middleware/authorize');

router.get('/', authorize(), async (req, res) => {
  const apps = [
    {
      id: 'quotes',
      name: 'Quotes',
      icon: 'Calculator',
      url: 'https://quotes.gcc.conship.ai',
      remoteEntry: 'https://quotes.gcc.conship.ai/remoteEntry.js',
      type: 'module',
      scope: 'quotes',
      module: './App',
      roles: ['system_admin', 'conship_employee', 'customer', 'customer_user', 'foreign_partner', 'foreign_partner_user'],
      position: 1,
      status: 'active',
      description: 'Generate and manage freight quotes',
    },
    {
      id: 'tracking',
      name: 'Tracking',
      icon: 'MapPin',
      url: 'https://tracking.gcc.conship.ai',
      remoteEntry: 'https://tracking.gcc.conship.ai/remoteEntry.js',
      type: 'module',
      scope: 'tracking',
      module: './App',
      roles: ['system_admin', 'conship_employee', 'customer', 'customer_user', 'foreign_partner', 'foreign_partner_user'],
      position: 2,
      status: 'coming_soon',
      description: 'Track shipments',
    }
  ];
  
  res.json({ apps });
});

module.exports = router;
