// src/routes/users.js
const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Partner = require('../models/Partner');
const { authorize } = require('../middleware/authorize');

// Define permissions here since config file doesn't exist
const PERMISSION_HIERARCHY = {
  system_admin: {
    canManage: ['conship_employee', 'partner_admin', 'partner_user', 'vendor_admin', 'vendor_user'],
    defaultModules: ['all']
  },
  conship_employee: {
    canManage: ['partner_user'],
    defaultModules: ['quotes', 'tracking', 'reports']
  },
  partner_admin: {
    canManage: ['partner_user'],
    defaultModules: ['quotes', 'tracking']
  },
  partner_user: {
    canManage: [],
    defaultModules: ['quotes', 'tracking']
  },
  vendor_admin: {
    canManage: ['vendor_user'],
    defaultModules: ['rates', 'shipments']
  },
  vendor_user: {
    canManage: [],
    defaultModules: ['shipments']
  }
};

// ─────────────────────────────────────────────────────────────
// Get current user (no password)
// ─────────────────────────────────────────────────────────────
router.get('/me', authorize(), async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      console.log('User found:', user ? 'Yes' : 'No');
if (user) {
  console.log('User active field:', user.active);
  console.log('User active type:', typeof user.active);
  console.log('User status field:', user.status);
  console.log('Full user object:', JSON.stringify(user.toObject(), null, 2));
}

if (!user) {
  console.log('User not found:', email);
  return res.status(401).json({ 
    error: 'Invalid email or password' 
  });
}
      .select('-password')
      .populate('partnerId');
    res.json({ success: true, user });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// ─────────────────────────────────────────────────────────────
// Create user with partner management (UPDATED)
// ─────────────────────────────────────────────────────────────
// Was: authorize(['system_admin', 'customer', 'foreign_partner'])
router.post('/', authorize(['system_admin', 'conship_employee', 'partner_admin', 'vendor_admin']), async (req, res) => {
  try {
    const { email, password, name, role, company: companyName } = req.body;
    const requestingUser = req.user;

    // Check if requesting user can create this role
    const canCreate = PERMISSION_HIERARCHY[requestingUser.role]?.canManage?.includes(role);
    if (!canCreate && requestingUser.role !== 'system_admin') {
      return res.status(403).json({ error: 'Not authorized to create this user type' });
    }

    // Handle partner assignment (UPDATED)
    let partnerId = requestingUser.partnerId; // Default to requester's partner

    if (requestingUser.role === 'system_admin' && companyName) {
      // Admin can create/assign partners
      let partner = await Partner.findOne({ companyName: companyName });
      if (!partner) {
        // Create new partner if doesn't exist
        const partnerType = ['partner_admin', 'partner_user'].includes(role) ? 'customer' :
                            ['vendor_admin', 'vendor_user'].includes(role) ? 'vendor' :
                            'foreign_partner';

        partner = await Partner.create({
          companyName: companyName,
          companyCode: companyName.substring(0, 4).toUpperCase(),
          type: partnerType,
          country: 'USA', // TODO: make dynamic as needed
          phone: 'pending',
          email: email,
          status: 'approved'
        });
      }
      partnerId = partner._id;
    }

    const user = new User({
      email,
      password,
      name,
      role,
      partnerId,
      parentAccountId: role.includes('_user') ? requestingUser._id : null,
      // If your schema still uses 'modules', you can set defaults here from PERMISSION_HIERARCHY.
      // If not, feel free to remove the next line.
      modules: PERMISSION_HIERARCHY[role]?.defaultModules || [],
      active: true // keep as-is per your instruction block
    });

    await user.save();
    await user.populate('partnerId');

    // Update partner's primary contact if this is an admin (UPDATED)
    if (role === 'partner_admin' && partnerId) {
      await Partner.findByIdAndUpdate(partnerId, { primaryContactId: user._id });
    }

    const userObj = user.toObject();
    delete userObj.password;

    res.status(201).json({ success: true, user: userObj });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// ─────────────────────────────────────────────────────────────
// Get managed users with partner filtering (UPDATED)
// ─────────────────────────────────────────────────────────────
router.get('/managed', authorize(), async (req, res) => {
  try {
    const requestingUser = req.user;
    const canManageRoles = PERMISSION_HIERARCHY[requestingUser.role]?.canManage || [];

    const query = {
      $or: [
        { role: { $in: canManageRoles } },
        { parentAccountId: requestingUser._id }
      ]
    };

    // If not admin, only see users from same partner (UPDATED)
    if (requestingUser.role !== 'system_admin' && requestingUser.partnerId) {
      query.partnerId = requestingUser.partnerId;
    }

    const users = await User.find(query)
      .select('-password')
      .populate('partnerId');

    res.json({ success: true, users });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// ─────────────────────────────────────────────────────────────
// Update user modules (kept; adjust if moving to permissions-only model)
// ─────────────────────────────────────────────────────────────
// Was: authorize(['system_admin', 'customer', 'foreign_partner'])
router.put('/:userId/modules', authorize(['system_admin', 'conship_employee', 'partner_admin', 'vendor_admin']), async (req, res) => {
  try {
    const { userId } = req.params;
    const { modules } = req.body;
    const requestingUser = req.user;

    const targetUser = await User.findById(userId);
    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check permission to modify this user
    const canManage = PERMISSION_HIERARCHY[requestingUser.role]?.canManage?.includes(targetUser.role) ||
                      targetUser.parentAccountId?.toString() === requestingUser._id.toString() ||
                      requestingUser.role === 'system_admin';

    if (!canManage) {
      return res.status(403).json({ error: 'Not authorized to modify this user' });
    }

    // Convert module IDs to full module objects
    // NOTE: If using the new User schema without 'modules', consider mapping to 'permissions' instead.
    targetUser.modules = (modules || []).map(moduleId => ({
      moduleId,
      name: getModuleName(moduleId),
      permissions: ['read', 'write'],
      grantedBy: requestingUser._id,
      grantedAt: new Date()
    }));

    await targetUser.save();
    res.json({ success: true, user: targetUser });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// ─────────────────────────────────────────────────────────────
// Suspend/Activate user (uses same-Partner check) (UPDATED ROLES)
// ─────────────────────────────────────────────────────────────
// Was: authorize(['system_admin', 'customer', 'foreign_partner'])
router.put('/:userId/status', authorize(['system_admin', 'conship_employee', 'partner_admin', 'vendor_admin']), async (req, res) => {
  try {
    const { userId } = req.params;
    const { active } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const requestingUser = req.user;

    // Check permissions
    const canManage =
      requestingUser.role === 'system_admin' ||
      user.parentAccountId?.toString() === requestingUser._id.toString() ||
      (
        requestingUser.partnerId?.toString() === user.partnerId?.toString() &&
        ['partner_admin', 'vendor_admin'].includes(requestingUser.role)
      );

    if (!canManage) {
      return res.status(403).json({ error: 'Not authorized to change this user status' });
    }

    user.active = active; // if using status field instead, convert here.
    await user.save();

    res.json({
      success: true,
      message: `User ${active ? 'activated' : 'suspended'} successfully`,
      user
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// ─────────────────────────────────────────────────────────────
// Delete user (system admin only)
// ─────────────────────────────────────────────────────────────
router.delete('/:userId', authorize(['system_admin']), async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Only allow deleting inactive users
    if (user.active) {
      return res.status(400).json({ error: 'Cannot delete active user. Suspend first.' });
    }

    await user.deleteOne();
    res.json({ success: true, message: 'User deleted successfully' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Helper function to get module names
function getModuleName(moduleId) {
  const moduleNames = {
    quotes: 'Quotes & Pricing',
    tracking: 'Shipment Tracking',
    analytics: 'Analytics & Reports',
    users: 'User Management',
    billing: 'Billing & Invoicing',
    inventory: 'Inventory Management',
    rates: 'Vendor Rates',
    shipments: 'Vendor Shipments',
    reports: 'Reports'
  };
  return moduleNames[moduleId] || moduleId;
}

module.exports = router;
