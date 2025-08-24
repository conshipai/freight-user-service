// src/scripts/createAdminUser.js
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');

async function createAdminUser() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/freight');
    console.log('Connected to MongoDB');
    
    // Check if admin already exists
    const existingAdmin = await User.findOne({ email: 'admin@conship.ai' });
    if (existingAdmin) {
      console.log('Admin user already exists');
      process.exit(0);
    }
    
    // Hash the password
    const hashedPassword = await bcrypt.hash('ChangeThisPassword123!', 10);
    
    // Create admin user
    const adminUser = await User.create({
      email: 'thomas.ehler@conship.ai',
      password: hashedPassword,
      name: 'System Administrator',
      role: 'system_admin',
      active: true
    });
    
    console.log('Admin user created successfully:');
    console.log('Email: thomas.ehler@conship.ai');
    console.log('Password: ChangeThisPassword123!');
    console.log('Role: system_admin');
    console.log('\n⚠️  IMPORTANT: Change this password after first login!');
    
    process.exit(0);
  } catch (error) {
    console.error('Error creating admin user:', error);
    process.exit(1);
  }
}

createAdminUser();
