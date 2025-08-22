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

module.exports = router;
