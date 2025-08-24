const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();

/* ---------- Middleware ---------- */
app.use(cors()); // optionally: cors({ origin: ['https://your-frontend'], credentials: true })
app.use(express.json());

/* ---------- Routes (imports) ---------- */
const userRoutes = require('./routes/users');
const partnerRoutes = require('./routes/partners');
const rateProviderRoutes = require('./routes/rateProviders');
const quoteRoutes = require('./routes/quotes');

/* ---------- Routes (mounts) ---------- */
app.use('/api/users', userRoutes);
app.use('/api/partners', partnerRoutes);
app.use('/api/rate-providers', rateProviderRoutes);
app.use('/api/quotes', quoteRoutes);

/* ---------- Simple endpoints ---------- */
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'user-service',
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  });
});

app.get('/api/apps/registry', (req, res) => {
  res.json([]); // placeholder
});

app.get('/test', (req, res) => {
  res.json({
    message: 'User service is running',
    endpoints: [
      'GET /health',
      'GET /test',
      'GET /api/apps/registry',
      'POST /api/users',
      'GET /api/users/managed',
      'PUT /api/users/:userId/modules',
      'POST /test-token' // DEV ONLY
    ]
  });
});

app.get('/api/routes', (req, res) => {
  res.json({
    message: 'Available API routes',
    routes: {
      users: [
        'GET /api/users/me',
        'POST /api/users',
        'GET /api/users/managed',
        'PUT /api/users/:userId/modules',
        'PUT /api/users/:userId/status'
      ],
      partners: [
        'POST /api/partners/invite',
        'GET /api/partners',
        'GET /api/partners/:id',
        'PUT /api/partners/:id/approve',
        'PUT /api/partners/:id/markup',
        'GET /api/partners/register/verify/:token',
        'POST /api/partners/register/complete',
        'POST /api/partners/auth/magic-link',
        'GET /api/partners/auth/verify/:token'
      ],
      rateProviders: [
        'GET /api/rate-providers',
        'POST /api/rate-providers',
        'GET /api/rate-providers/:id',
        'PUT /api/rate-providers/:id',
        'PUT /api/rate-providers/:id/markup',
        'POST /api/rate-providers/:id/test',
        'PUT /api/rate-providers/:id/status',
        'GET /api/rate-providers/:id/metrics'
      ],
      quotes: [
        'POST /api/quotes/create',
        'GET /api/quotes/:quoteNumber',
        'POST /api/quotes/:quoteNumber/accept',
        'GET /api/quotes'
      ]
    }
  });
});

/* ---------- Models & dev helpers ---------- */
const User = require('./models/User');

async function createTestUser() {
  try {
    const exists = await User.findOne({ email: 'admin@test.com' });
    if (!exists) {
      const admin = new User({
        email: 'admin@test.com',
        password: 'testpass123', // ensure your model hashes on save
        name: 'Test Admin',
        role: 'system_admin',
        active: true,
        modules: [
          { moduleId: 'quotes', name: 'Quotes & Pricing', permissions: ['read','write','delete','admin'], grantedAt: new Date() },
          { moduleId: 'tracking', name: 'Shipment Tracking', permissions: ['read','write','delete','admin'], grantedAt: new Date() },
          { moduleId: 'analytics', name: 'Analytics & Reports', permissions: ['read','write','delete','admin'], grantedAt: new Date() },
          { moduleId: 'users', name: 'User Management', permissions: ['read','write','delete','admin'], grantedAt: new Date() }
        ]
      });
      await admin.save();
      console.log('✅ Test admin created: admin@test.com / testpass123');
    }
  } catch (err) {
    console.error('Test user creation error:', err.message);
  }
}

/* ---------- DEV ONLY: issue a JWT for testing ---------- */
// Remove or protect behind NODE_ENV === 'development'
app.post('/test-token', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    const user = await User.findOne({ email });
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const token = jwt.sign(
      { userId: user._id.toString(), role: user.role },
      process.env.JWT_SECRET, // do not fallback to a hardcoded secret
      { expiresIn: '24h' }
    );
    res.json({ token, userId: user._id });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/* ---------- DB & server startup ---------- */
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/freight';
mongoose.connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(async () => {
    console.log('✅ Connected to MongoDB');
    if (process.env.NODE_ENV !== 'production') await createTestUser();
    const PORT = process.env.PORT || 3001;
    app.listen(PORT, () => console.log(`🚀 User Service listening on :${PORT}`));
  })
  .catch(err => {
    console.error('❌ MongoDB connection error:', err);
    process.exit(1);
  });
