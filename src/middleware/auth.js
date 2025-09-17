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

// NEW: Add role checking middleware
const checkRole = (allowedRoles) => {
  return (req, res, next) => {
    // Make sure auth middleware has already run
    if (!req.user) {
      return res.status(401).json({ 
        error: 'Authentication required' 
      });
    }
    
    // Check if user has required role
    const userRole = req.user.role || req.user.userType; // Some systems use 'userType'
    
    if (!userRole) {
      return res.status(403).json({ 
        error: 'No role assigned to user' 
      });
    }
    
    // Check if user's role is in the allowed roles
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

// Optional: Middleware to check if user is employee
const isEmployee = (req, res, next) => {
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

// Optional: Middleware to check if user owns the resource
const isOwnerOrEmployee = (resourceField = 'customerId') => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const userRole = req.user.role || req.user.userType;
    const employeeRoles = ['conship_employee', 'system_admin', 'admin'];
    
    // Employees can access anything
    if (employeeRoles.includes(userRole)) {
      return next();
    }
    
    // For regular users, check ownership
    // This will be checked in the route handler
    req.checkOwnership = true;
    req.ownerField = resourceField;
    next();
  };
};

// Export all middleware functions
module.exports = {
  auth,           // Keep original name for backward compatibility
  authenticate: auth,  // Alternative name
  checkRole,
  isEmployee,
  isOwnerOrEmployee
};
