// src/app.js
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Routes
const userRoutes = require('./routes/users');
const companyRoutes = require('./routes/companies');
const quoteRoutes = require('./routes/quotes');
const costRoutes = require('./routes/costs');

app.use('/api/users', userRoutes);
app.use('/api/companies', companyRoutes);
app.use('/api/quotes', quoteRoutes);
app.use('/api/costs', costRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'freight-quote-service',
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  });
});

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/freight')
  .then(() => {
    console.log('✅ Connected to MongoDB');
    const PORT = process.env.PORT || 3001;
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
    });
  })
  .catch(err => {
    console.error('❌ MongoDB connection error:', err);
    process.exit(1);
  });
