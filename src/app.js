// src/app.js
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

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

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/companies', companyRoutes);
app.use('/api/quotes', quoteRoutes);
app.use('/api/costs', costRoutes);
app.use('/api/partners', partnerRoutes);
app.use('/api/airports', airportRoutes);

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
      partners: '/api/partners',
      airports: '/api/airports'
    }
  });
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
  });
})
.catch(err => {
  console.error('❌ MongoDB connection error:', err);
  process.exit(1);
});

module.exports = app;
