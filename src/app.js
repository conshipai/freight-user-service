const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const jwt = require('jsonwebtoken');  // ADD THIS LINE
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Routes
const userRoutes = require('./routes/users');
app.use('/api/users', userRoutes);

const partnerRoutes = require('./routes/partners');
app.use('/api/partners', partnerRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    service: 'user-service',
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  });
});
app.get('/api/apps/registry', (req, res) => {
  res.json([]);  // Return empty array for now
});
// Test endpoint
app.get('/test', (req, res) => {
  res.json({ 
    message: 'User service is running',
    endpoints: [
      'GET /health',
      'GET /test',
      'POST /api/users',
      'GET /api/users/managed',
      'PUT /api/users/:userId/modules',
      'POST /test-token'
    ]
  });
});

// Temporary: Create a test admin user on startup
const User = require('./models/User');
async function createTestUser() {
  try {
    const exists = await User.findOne({ email: 'admin@test.com' });
    if (!exists) {
      const admin = new User({
        email: 'admin@test.com',
        password: 'testpass123',
        name: 'Test Admin',
        role: 'system_admin',
        active: true,
        modules: [  // CHANGED: Array of objects instead of strings
          {
            moduleId: 'quotes',
            name: 'Quotes & Pricing',
            permissions: ['read', 'write', 'delete', 'admin'],
            grantedAt: new Date()
          },
          {
            moduleId: 'tracking',
            name: 'Shipment Tracking',
            permissions: ['read', 'write', 'delete', 'admin'],
            grantedAt: new Date()
          },
          {
            moduleId: 'analytics',
            name: 'Analytics & Reports',
            permissions: ['read', 'write', 'delete', 'admin'],
            grantedAt: new Date()
          },
          {
            moduleId: 'users',
            name: 'User Management',
            permissions: ['read', 'write', 'delete', 'admin'],
            grantedAt: new Date()
          }
        ]
      });
      await admin.save();
      console.log('Test admin created: admin@test.com / testpass123');
    }
  } catch (error) {
    console.error('Test user creation error:', error.message);
  }
}

// TEMPORARY: Generate test token (remove in production!)
app.post('/test-token', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const token = jwt.sign(
      { userId: user._id, role: user.role },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '24h' }
    );
    
    res.json({ token, userId: user._id });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// MongoDB connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/freight';
mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(async () => {
  console.log('Connected to MongoDB');
  await createTestUser();
})
.catch(err => console.error('MongoDB connection error:', err));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`User Service running on port ${PORT}`);
});
