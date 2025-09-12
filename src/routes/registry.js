// src/routes/registry.js
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');  // Add this
const authorize = require('../middleware/authorize');

// FIXED: Add auth middleware before authorize
router.get('/', auth, authorize(), async (req, res) => {
  const apps = [
    {
      id: 'quotes',
      name: 'Quotes',
      icon: 'Calculator',
      url: 'https://quotes.gcc.conship.ai',
      type: 'module',
      scope: 'quotes',
      module: './App',
      roles: ['system_admin', 'conship_employee', 'partner_admin', 'partner_user'],
      position: 1,
      status: 'active',
      description: 'Generate and manage freight quotes',
    },
    {
      id: 'shipments-admin',
      name: 'Shipments Admin',
      icon: 'Truck',
      url: 'https://shipments-admin.gcc.conship.ai',
      type: 'module',
      scope: 'shipmentsAdmin',
      module: './App',
      roles: ['system_admin', 'conship_employee'],
      position: 3,
      status: 'active',
      description: 'Manage shipments and carrier assignments',
    },
    // ... other apps
  ];
  
  res.json({ apps });
});

module.exports = router;
