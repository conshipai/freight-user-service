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
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Find user in database (password is select:false in schema)
    const user = await User.findOne({ email: email.toLowerCase() }).select('+password');
    if (!user) {
      console.log('User not found:', email);
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Check if user is active
    if (!user.active) {
      return res.status(403).json({ error: 'Account is suspended. Please contact administrator.' });
    }

    // DEBUG: Check what we're getting
    console.log('User password hash:', user.password);
    console.log('Password being tested:', password);
    console.log('Hash exists?', !!user.password);
    console.log('Hash length:', user.password ? user.password.length : 0);

    // Verify password against hashed password in database
    console.log('DEBUG: User found:', user.email);
    console.log('DEBUG: Password from frontend:', password);
    console.log('DEBUG: Password hash from DB:', user.password);
    console.log('DEBUG: Hash exists?', !!user.password);
    const isPasswordValid = await bcrypt.compare(password, user.password);
    console.log('Password comparison result:', isPasswordValid);

    if (!isPasswordValid) {
      console.log('Invalid password for user:', email);
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Generate JWT token (align with schema: partnerId, not companyId)
    const token = jwt.sign(
      {
        userId: user._id,
        email: user.email,
        role: user.role,
        partnerId: user.partnerId || null
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Update last login (align with model: lastLoginAt)
    user.lastLoginAt = new Date();
    await user.save();

    console.log('Login successful for:', email);

    // Return token and user data (without password)
    const userObj = user.toObject();
    delete userObj.password;

    res.json({
      success: true,
      token,
      user: userObj
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'An error occurred during login. Please try again.' });
  }
});

// Keep /test-token endpoint for backward compatibility with frontend
router.post('/test-token', async (req, res) => {
  try {
    const { email, password } = req.body;

    console.log('Login attempt for:', email);

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = await User.findOne({ email: email.toLowerCase() }).select('+password');
    if (!user) {
      console.log('User not found:', email);
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    if (!user.active) {
      return res.status(403).json({ error: 'Account is suspended. Please contact administrator.' });
    }

    // DEBUG: Check what we're getting
    console.log('User password hash:', user.password);
    console.log('Password being tested:', password);
    console.log('Hash exists?', !!user.password);
    console.log('Hash length:', user.password ? user.password.length : 0);

    const isPasswordValid = await bcrypt.compare(password, user.password);
    console.log('Password comparison result:', isPasswordValid);

    if (!isPasswordValid) {
      console.log('Invalid password for user:', email);
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = jwt.sign(
      {
        userId: user._id,
        email: user.email,
        role: user.role,
        partnerId: user.partnerId || null
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    user.lastLoginAt = new Date();
    await user.save();

    console.log('Login successful for:', email);

    const userObj = user.toObject();
    delete userObj.password;

    // Match the expected response format
    res.json({
      token,
      userId: user._id,
      user: userObj
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'An error occurred during login. Please try again.' });
  }
});

// ─────────────────────────────────────────────────────────────
// Verify token endpoint
// ─────────────────────────────────────────────────────────────
router.get('/verify', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'No token provided' });

    const decoded = jwt.verify(token, JWT_SECRET);

    // Get fresh user data
    const user = await User.findById(decoded.userId).select('-password');
    if (!user || !user.active) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    res.json({ success: true, user });
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
    if (!token) return res.status(401).json({ error: 'No token provided' });

    const decoded = jwt.verify(token, JWT_SECRET);
    const { currentPassword, newPassword } = req.body;

    // Validate input
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current password and new password are required' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters long' });
    }

    // Get user WITH PASSWORD (select: false in schema)
    const user = await User.findById(decoded.userId).select('+password');
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Verify current password
    const isValid = await bcrypt.compare(currentPassword, user.password);
    if (!isValid) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    // Assign new password (pre-save hook will hash)
    user.password = newPassword;
    await user.save();

    res.json({ success: true, message: 'Password changed successfully' });
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
