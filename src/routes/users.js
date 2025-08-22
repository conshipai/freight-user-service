const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { authorize } = require('../middleware/authorize');
const { PERMISSION_HIERARCHY } = require('../config/permissions');

// Create user
router.post('/', authorize(['system_admin', 'customer', 'foreign_partner']), async (req, res) => {
  try {
    const { email, password, name, role, parentAccountId, company } = req.body;
    const requestingUser = req.user;
    
    // Check if requesting user can create this role
    const canCreate = PERMISSION_HIERARCHY[requestingUser.role]?.canManage?.includes(role);
    if (!canCreate && requestingUser.role !== 'system_admin') {
      return res.status(403).json({ error: 'Not authorized to create this user type' });
    }

    const user = new User({
      email,
      password,
      name,
      role,
      parentAccountId: parentAccountId || (role.includes('_user') ? requestingUser._id : null),
      company,
      modules: PERMISSION_HIERARCHY[role]?.defaultModules || []
    });

    await user.save();
    const userObj = user.toObject();
    delete userObj.password;
    
    res.status(201).json({ success: true, user: userObj });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Get managed users
router.get('/managed', authorize(), async (req, res) => {
  try {
    const requestingUser = req.user;
    const canManageRoles = PERMISSION_HIERARCHY[requestingUser.role]?.canManage || [];
    
    const users = await User.find({
      $or: [
        { role: { $in: canManageRoles } },
        { parentAccountId: requestingUser._id }
      ]
    }).select('-password');
    
    res.json({ success: true, users });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Update user modules
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
    
    targetUser.modules = modules.map(moduleId => ({
      moduleId,
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

module.exports = router;
