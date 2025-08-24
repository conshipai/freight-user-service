const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Company = require('../models/Company'); // Add this import
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

// Create user
.populate('companyId');
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
