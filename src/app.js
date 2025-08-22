const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const userRoutes = require('./routes/users');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use('/api/users', userRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    service: 'user-service',
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  });
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
      'PUT /api/users/:userId/modules'
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
        modules: ['quotes', 'tracking', 'analytics', 'users']
      });
      await admin.save();
      console.log('✅ Test admin created: admin@test.com / testpass123');
    }
  } catch (error) {
    console.error('❌ Test user creation error:', error.message);
  }
}

// MongoDB connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/freight';

mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(async () => {
  console.log('✅ Connected to MongoDB');
  await createTestUser(); // Create the admin user once DB is ready
})
.catch(err => console.error('❌ MongoDB connection error:', err));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 User Service running on port ${PORT}`);
});
