const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Company = require('../models/Company');
const { authorize } = require('../middleware/authorize');
const { PERMISSION_HIERARCHY } = require('../config/permissions');

// ─────────────────────────────────────────────────────────────
// Get current user (no password)
// ─────────────────────────────────────────────────────────────
router.get('/me', authorize(), async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .select('-password')
      .populate('companyId');
    res.json({ success: true, user });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// ─────────────────────────────────────────────────────────────
// Create user with company management
// ─────────────────────────────────────────────────────────────
router.post('/', authorize(['system_admin', 'customer', 'foreign_partner']), async (req, res) => {
  try {
    const { email, password, name, role, company: companyName } = req.body;
    const requestingUser = req.user;
    
    // Check if requesting user can create this role
    const canCreate = PERMISSION_HIERARCHY[requestingUser.role]?.canManage?.includes(role);
    if (!canCreate && requestingUser.role !== 'system_admin') {
      return res.status(403).json({ error: 'Not authorized to create this user type' });
    }
    
    // Handle company assignment
    let companyId = requestingUser.companyId; // Default to requester's company
    
    if (requestingUser.role === 'system_admin' && companyName) {
      // Admin can create/assign companies
      let company = await Company.findOne({ name: companyName });
      if (!company) {
        // Determine company type based on role
        const companyType = role === 'customer' ? 'customer' : 
                          role === 'foreign_partner' ? 'foreign_partner' : 'conship';
        
        company = await Company.create({
          name: companyName,
          type: companyType,
          active: true
        });
      }
      companyId = company._id;
    }
    
    const user = new User({
      email,
      password,
      name,
      role,
      companyId,
      parentAccountId: role.includes('_user') ? requestingUser._id : null,
      modules: PERMISSION_HIERARCHY[role]?.defaultModules || [],
      active: true
    });

    await user.save();
    await user.populate('companyId');
    
    // If this is a primary customer/partner, set them as company's primary contact
    if ((role === 'customer' || role === 'foreign_partner') && companyId) {
      await Company.findByIdAndUpdate(companyId, { primaryContactId: user._id });
    }
    
    const userObj = user.toObject();
    delete userObj.password;
    
    res.status(201).json({ success: true, user: userObj });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// ─────────────────────────────────────────────────────────────
// Get managed users with company filtering
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
    
    // If not admin, only see users from same company
    if (requestingUser.role !== 'system_admin' && requestingUser.companyId) {
      query.companyId = requestingUser.companyId;
    }
    
    const users = await User.find(query)
      .select('-password')
      .populate('companyId');
    
    res.json({ success: true, users });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// ─────────────────────────────────────────────────────────────
// Update user modules
// ─────────────────────────────────────────────────────────────
router.put('/:userId/modules', authorize(['system_admin', 'customer', 'foreign_partner']), async (req, res) => {
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
    targetUser.modules = modules.map(moduleId => ({
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
// Suspend/Activate user
// ─────────────────────────────────────────────────────────────
router.put('/:userId/status', authorize(['system_admin', 'customer', 'foreign_partner']), async (req, res) => {
  try {
    const { userId } = req.params;
    const { active } = req.body;
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const requestingUser = req.user;
    
    // Check permissions
    const canManage = requestingUser.role === 'system_admin' || 
                      user.parentAccountId?.toString() === requestingUser._id.toString() ||
                      (requestingUser.companyId?.toString() === user.companyId?.toString() && 
                       ['customer', 'foreign_partner'].includes(requestingUser.role));
    
    if (!canManage) {
      return res.status(403).json({ error: 'Not authorized to change this user status' });
    }
    
    user.active = active;
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
    'quotes': 'Quotes & Pricing',
    'tracking': 'Shipment Tracking',
    'analytics': 'Analytics & Reports',
    'users': 'User Management',
    'billing': 'Billing & Invoicing',
    'inventory': 'Inventory Management'
  };
  return moduleNames[moduleId] || moduleId;
}

module.exports = router;
