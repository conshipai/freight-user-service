// src/middleware/auth.js
const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Your existing auth middleware
const auth = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    const user = await User.findById(decoded.userId).select('-password');
    
    if (!user || !user.active) {
      return res.status(401).json({ error: 'User not found or inactive' });
    }
    
    req.user = user;
    req.userId = user._id;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// Add role checking as a property of auth
auth.checkRole = (allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ 
        error: 'Authentication required' 
      });
    }
    
    const userRole = req.user.role || req.user.userType;
    
    if (!userRole) {
      return res.status(403).json({ 
        error: 'No role assigned to user' 
      });
    }
    
    if (!allowedRoles.includes(userRole)) {
      return res.status(403).json({ 
        error: 'Insufficient permissions',
        required: allowedRoles,
        userRole: userRole
      });
    }
    
    next();
  };
};

// Add isEmployee as a property
auth.isEmployee = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  const employeeRoles = ['conship_employee', 'system_admin', 'admin'];
  const userRole = req.user.role || req.user.userType;
  
  if (!employeeRoles.includes(userRole)) {
    return res.status(403).json({ 
      error: 'Employee access only' 
    });
  }
  
  next();
};

// Export auth as default (for backward compatibility)
module.exports = auth;
