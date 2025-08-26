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
const authRoutes = require('./routes/auth');
const companyRoutes = require('./routes/companies');
const quoteRoutes = require('./routes/quotes');
const costRoutes = require('./routes/costs');
const partnerRoutes = require('./routes/partners');
const airportRoutes = require('./routes/airports');  // ADD THIS LINE

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/companies', companyRoutes);
app.use('/api/quotes', quoteRoutes);
app.use('/api/costs', costRoutes);
app.use('/api/partners', partnerRoutes);
app.use('/api/airports', airportRoutes);  // ADD THIS LINE

// Health check (rest stays the same)
