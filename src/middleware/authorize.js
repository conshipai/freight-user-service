// src/middleware/authorize.js
const authorize = (allowedRoles = []) => {
  return (req, res, next) => {
    // This assumes auth middleware already ran and set req.user
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    
    // If no roles specified, just check authentication
    if (allowedRoles.length === 0) {
      return next();
    }
    
    // Check if user's role is allowed
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    
    next();
  };
};

module.exports = authorize;
