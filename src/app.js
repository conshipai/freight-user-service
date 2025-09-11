// src/app.js
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();
const debugRoutes = require('./routes/debug');
const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
const userRoutes = require('./routes/users');
const authRoutes = require('./routes/auth');
const companyRoutes = require('./routes/companies');
const quoteRoutes = require('./routes/quotes');
const costRoutes = require('./routes/costs');
const partnerRoutes = require('./routes/partners');
const airportRoutes = require('./routes/airports');
const registryRoutes = require('./routes/registry');
const bookingRoutes = require('./routes/bookings');
const groundQuoteRoutes = require('./routes/groundQuotes');
const bolRoutes = require('./routes/bols');
const carrierAccountRoutes = require('./routes/carrierAccounts');

// ✅ NEW: sequences & storage
const sequenceRoutes = require('./routes/sequences');
const storageRoutes = require('./routes/storage');

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/companies', companyRoutes);
app.use('/api/quotes', quoteRoutes);
app.use('/api/costs', costRoutes);
app.use('/api/partners', partnerRoutes);
app.use('/api/airports', airportRoutes);
app.use('/api/apps/registry', registryRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/ground-quotes', groundQuoteRoutes);
app.use('/api/bols', bolRoutes);
app.use('/api/carrier-accounts', carrierAccountRoutes); 
app.use('/api/debug', debugRoutes);
// ✅ NEW: mount sequences & storage
app.use('/api/sequences', sequenceRoutes);
app.use('/api/storage', storageRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    service: 'Freight Backend API',
    timestamp: new Date().toISOString()
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({ 
    message: 'Freight Backend API is running',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      auth: '/api/auth',
      users: '/api/users',
      companies: '/api/companies',
      quotes: '/api/quotes',
      costs: '/api/costs',
      partners: '/api/partners',
      airports: '/api/airports',
      // ✅ NEW
      sequences: '/api/sequences',
      storage: '/api/storage',
      registry: '/api/apps/registry'
    }
  });
});

// 🔎 Test airport search directly (debug)
app.get('/api/test/airports', async (req, res) => {
  try {
    const db = mongoose.connection.db;

    // Test direct queries
    const usTest = await db.collection('us_gateways').findOne({ code: 'JFK' });
    const foreignTest = await db.collection('international_airports').findOne({ code: 'LHR' });

    // Test search
    const searchTest = await db.collection('international_airports').find({
      $or: [
        { code: { $regex: 'LH', $options: 'i' } },
        { name: { $regex: 'LH', $options: 'i' } },
        { city: { $regex: 'LH', $options: 'i' } }
      ]
    }).limit(5).toArray();

    res.json({
      collections: await db.listCollections().toArray().then(cols => cols.map(c => c.name)),
      us_sample: usTest,
      foreign_sample: foreignTest,
      search_results: searchTest,
      search_count: searchTest.length
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    error: 'Something went wrong!',
    message: err.message 
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ 
    error: 'Route not found' 
  });
});

// MongoDB connection and server start
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/freight', {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => {
  console.log('✅ Connected to MongoDB');
  
  app.listen(PORT, () => {
    console.log(`🚀 Server is running on port ${PORT}`);
    console.log(`📡 API available at http://localhost:${PORT}`);
    console.log(`🏥 Health check at http://localhost:${PORT}/health`);
    console.log(`🧪 Debug airport test at http://localhost:${PORT}/api/test/airports`);
  });
})
.catch(err => {
  console.error('❌ MongoDB connection error:', err);
  process.exit(1);
});

module.exports = app;
