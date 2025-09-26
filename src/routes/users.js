// src/routes/users.js
const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Partner = require('../models/Partner');
const auth = require('../middleware/auth');
const authorize  = require('../middleware/authorize');

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
// Get current user (auth only)  ✅
// ─────────────────────────────────────────────────────────────
router.get('/me', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .select('-password')
      .populate('partnerId');

    if (!user) return res.status(404).json({ error: 'User not found' });

    res.json({ success: true, user });
  } catch (error) {
    console.error('GET /me error:', error);
    res.status(400).json({ error: error.message });
  }
});

// ─────────────────────────────────────────────────────────────
// Create user with partner management (auth + authorize) ✅
// ─────────────────────────────────────────────────────────────
router.post('/', auth, authorize(['system_admin', 'conship_employee', 'partner_admin', 'vendor_admin']), async (req, res) => {
  try {
    const { email, password, name, role } = req.body;  // REMOVED company from here
    const requestingUser = req.user;

    // Permission check
    const canCreate = PERMISSION_HIERARCHY[requestingUser.role]?.canManage?.includes(role);
    if (!canCreate && requestingUser.role !== 'system_admin') {
      return res.status(403).json({ error: 'Not authorized to create this user type' });
    }

    // Partner assignment logic - FIXED
    let partnerId = null;

    // CASE 1: Partner/vendor admins creating sub-users - inherit their partnerId
    if (['partner_admin', 'vendor_admin'].includes(requestingUser.role)) {
      partnerId = requestingUser.partnerId;
    }
    // CASE 2: Conship employees don't need a partnerId
    else if (role === 'conship_employee') {
      partnerId = null;  // Conship employees don't belong to a partner
    }
    // CASE 3: System admin creating partner_user inherits from requesting user if they have a partnerId
    else if (requestingUser.role === 'system_admin' && role === 'partner_user') {
      // This shouldn't happen normally - partner_users should be created by partner_admins
      return res.status(400).json({ 
        error: 'Partner users should be created by their partner admin' 
      });
    }
    // CASE 4: No automatic partner creation anymore
    // Partners should be created separately through the partners endpoint

    const user = new User({
      email,
      password,
      name,
      role,
      partnerId,
      parentAccountId: role.includes('_user') ? requestingUser._id : null,
      modules: PERMISSION_HIERARCHY[role]?.defaultModules?.map(moduleId => ({
        moduleId,
        name: getModuleName(moduleId),
        permissions: ['read', 'write'],
        grantedBy: requestingUser._id,
        grantedAt: new Date()
      })) || [],
      active: true
    });

    await user.save();
    
    // Only populate partnerId if it exists
    if (partnerId) {
      await user.populate('partnerId');
    }

    const userObj = user.toObject();
    delete userObj.password;

    res.status(201).json({ success: true, user: userObj });
  } catch (error) {
    console.error('POST /users error:', error);
    res.status(400).json({ error: error.message });
  }
});

// ─────────────────────────────────────────────────────────────
// Get managed users (auth only; logic limits by role) ✅
// ─────────────────────────────────────────────────────────────
router.get('/managed', auth, async (req, res) => {
  try {
    const requestingUser = req.user;
    const canManageRoles = PERMISSION_HIERARCHY[requestingUser.role]?.canManage || [];

    const query = {
      $or: [
        { role: { $in: canManageRoles } },
        { parentAccountId: requestingUser._id }
      ]
    };

    if (requestingUser.role !== 'system_admin' && requestingUser.partnerId) {
      query.partnerId = requestingUser.partnerId;
    }

    const users = await User.find(query)
      .select('-password')
      .populate('partnerId');

    res.json({ success: true, users });
  } catch (error) {
    console.error('GET /managed error:', error);
    res.status(400).json({ error: error.message });
  }
});

// ─────────────────────────────────────────────────────────────
// Update user modules (auth + authorize) ✅
// ─────────────────────────────────────────────────────────────
// Update user (including password reset)
router.put('/:userId', auth, authorize(['system_admin', 'conship_employee', 'partner_admin']), async (req, res) => {
  try {
    const { userId } = req.params;
    const { email, name, role, active, password } = req.body;
    const requestingUser = req.user;

    const targetUser = await User.findById(userId);
    if (!targetUser) return res.status(404).json({ error: 'User not found' });

    // Permission check
    const canManage = 
      requestingUser.role === 'system_admin' ||
      targetUser.parentAccountId?.toString() === requestingUser._id.toString() ||
      (requestingUser.partnerId && requestingUser.partnerId.toString() === targetUser.partnerId?.toString());

    if (!canManage) {
      return res.status(403).json({ error: 'Not authorized to modify this user' });
    }

    // Update fields
    if (email) targetUser.email = email;
    if (name) targetUser.name = name;
    if (role && requestingUser.role === 'system_admin') targetUser.role = role;
    if (active !== undefined) targetUser.active = active;
    
    // Password reset (only for admins managing their sub-users)
    if (password) {
      targetUser.password = password; // Will be hashed by pre-save hook
    }

    await targetUser.save();
    
    const userObj = targetUser.toObject();
    delete userObj.password;
    
    res.json({ success: true, user: userObj });
  } catch (error) {
    console.error('PUT /:userId error:', error);
    res.status(400).json({ error: error.message });
  }
});

// ─────────────────────────────────────────────────────────────
// Suspend/Activate user (auth + authorize) ✅
// ─────────────────────────────────────────────────────────────
router.put('/:userId/status', auth, authorize(['system_admin', 'conship_employee', 'partner_admin', 'vendor_admin']), async (req, res) => {
  try {
    const { userId } = req.params;
    const { active } = req.body;

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const requestingUser = req.user;

    const canManage =
      requestingUser.role === 'system_admin' ||
      user.parentAccountId?.toString() === requestingUser._id.toString() ||
      (
        requestingUser.partnerId?.toString() === user.partnerId?.toString() &&
        ['partner_admin', 'vendor_admin'].includes(requestingUser.role)
      );

    if (!canManage) return res.status(403).json({ error: 'Not authorized to change this user status' });

    user.active = active;
    await user.save();

    res.json({
      success: true,
      message: `User ${active ? 'activated' : 'suspended'} successfully`,
      user
    });
  } catch (error) {
    console.error('PUT /:userId/status error:', error);
    res.status(400).json({ error: error.message });
  }
});

// ─────────────────────────────────────────────────────────────
// Delete user (auth + authorize system_admin) ✅
// ─────────────────────────────────────────────────────────────
router.delete('/:userId', auth, authorize(['system_admin']), async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (user.active) {
      return res.status(400).json({ error: 'Cannot delete active user. Suspend first.' });
    }

    await user.deleteOne();
    res.json({ success: true, message: 'User deleted successfully' });
  } catch (error) {
    console.error('DELETE /:userId error:', error);
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
