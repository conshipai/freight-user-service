// src/routes/auth.js - PRODUCTION VERSION
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('../models/User');

// JWT Secret from environment variable
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  console.error('CRITICAL: JWT_SECRET not set in environment variables!');
  process.exit(1); // Don't start without proper JWT secret
}

// ─────────────────────────────────────────────────────────────
// Login endpoint - validates against database only
// ─────────────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    console.log('Login attempt for:', email);
    
    // Validate input
    if (!email || !password) {
      return res.status(400).json({ 
        error: 'Email and password are required' 
      });
    }
    
    // Find user in database
    const user = await User.findOne({ email: email.toLowerCase() }).select('+password');
    
    if (!user) {
      console.log('User not found:', email);
      return res.status(401).json({ 
        error: 'Invalid email or password' 
      });
    }
    
    // Check if user is active
    if (!user.active) {
      return res.status(403).json({ 
        error: 'Account is suspended. Please contact administrator.' 
      });
    }
    
    // Verify password against hashed password in database
    const isPasswordValid = await bcrypt.compare(password, user.password);
    
    if (!isPasswordValid) {
      console.log('Invalid password for user:', email);
      return res.status(401).json({ 
        error: 'Invalid email or password' 
      });
    }
    
    // Generate JWT token
    const token = jwt.sign(
      { 
        userId: user._id,
        email: user.email,
        role: user.role,
        companyId: user.companyId
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    // Update last login
    user.lastLogin = new Date();
    await user.save();
    
    console.log('Login successful for:', email);
    
    // Return token and user data (without password)
    const userObj = user.toObject();
    delete userObj.password;
    
    res.json({
      success: true,
      token: token,
      user: userObj
    });
    
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ 
      error: 'An error occurred during login. Please try again.' 
    });
  }
});

// Keep /test-token endpoint for backward compatibility with frontend
router.post('/test-token', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    console.log('Login attempt for:', email);
    
    if (!email || !password) {
      return res.status(400).json({ 
        error: 'Email and password are required' 
      });
    }
    
    const user = await User.findOne({ email: email.toLowerCase() }).select('+password');
    
    if (!user) {
      console.log('User not found:', email);
      return res.status(401).json({ 
        error: 'Invalid email or password' 
      });
    }
    
    if (!user.active) {
      return res.status(403).json({ 
        error: 'Account is suspended. Please contact administrator.' 
      });
    }
    
    const isPasswordValid = await bcrypt.compare(password, user.password);
    
    if (!isPasswordValid) {
      console.log('Invalid password for user:', email);
      return res.status(401).json({ 
        error: 'Invalid email or password' 
      });
    }
    
    const token = jwt.sign(
      { 
        userId: user._id,
        email: user.email,
        role: user.role,
        companyId: user.companyId
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    user.lastLogin = new Date();
    await user.save();
    
    console.log('Login successful for:', email);
    
    const userObj = user.toObject();
    delete userObj.password;
    
    // Match the expected response format
    res.json({
      token: token,
      userId: user._id,
      user: userObj
    });
    
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ 
      error: 'An error occurred during login. Please try again.' 
    });
  }
});

// ─────────────────────────────────────────────────────────────
// Verify token endpoint
// ─────────────────────────────────────────────────────────────
router.get('/verify', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }
    
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Get fresh user data
    const user = await User.findById(decoded.userId).select('-password');
    
    if (!user || !user.active) {
      return res.status(401).json({ error: 'Invalid token' });
    }
    
    res.json({
      success: true,
      user: user
    });
    
  } catch (error) {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
});

// ─────────────────────────────────────────────────────────────
// Change password endpoint (for logged-in users)
// ─────────────────────────────────────────────────────────────
router.post('/change-password', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }
    
    const decoded = jwt.verify(token, JWT_SECRET);
    const { currentPassword, newPassword } = req.body;
    
    // Validate input
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ 
        error: 'Current password and new password are required' 
      });
    }
    
    if (newPassword.length < 8) {
      return res.status(400).json({ 
        error: 'New password must be at least 8 characters long' 
      });
    }
    
    // Get user
    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Verify current password
    const isValid = await bcrypt.compare(currentPassword, user.password);
    if (!isValid) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }
    
    // Hash and save new password
    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();
    
    res.json({ 
      success: true, 
      message: 'Password changed successfully' 
    });
    
  } catch (error) {
    console.error('Password change error:', error);
    res.status(500).json({ error: 'Error changing password' });
  }
});

// ─────────────────────────────────────────────────────────────
// Logout endpoint
// ─────────────────────────────────────────────────────────────
router.post('/logout', (req, res) => {
  // With JWT, logout is handled client-side by removing the token
  res.json({ success: true, message: 'Logged out successfully' });
});

module.exports = router;
