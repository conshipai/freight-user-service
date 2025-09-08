// src/diagnose.js
// Run this to diagnose server issues: node src/diagnose.js

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

console.log('🔍 FREIGHT BACKEND DIAGNOSTIC TOOL\n');
console.log('=' .repeat(50));

// Check environment variables
console.log('\n📋 ENVIRONMENT VARIABLES CHECK:');
const requiredEnvVars = [
  'MONGODB_URI',
  'JWT_SECRET',
  'PORT',
  'S3_BUCKET',
  'S3_REGION',
  'PELICARGO_API_KEY',
  'FREIGHT_FORCE_USERNAME',
  'FREIGHT_FORCE_PASSWORD'
];

const envStatus = {};
requiredEnvVars.forEach(key => {
  const exists = !!process.env[key];
  envStatus[key] = exists;
  console.log(`  ${exists ? '✅' : '❌'} ${key}: ${exists ? 'Set' : 'MISSING'}`);
});

// Check critical files
console.log('\n📁 CRITICAL FILES CHECK:');
const criticalFiles = [
  'src/app.js',
  'src/middleware/auth.js',
  'src/middleware/authorize.js',
  'src/routes/auth.js',
  'src/routes/users.js',
  'src/routes/quotes.js',
  'src/routes/groundQuotes.js',
  'src/models/User.js',
  'src/models/Request.js'
];

const fileStatus = {};
criticalFiles.forEach(file => {
  const fullPath = path.join(process.cwd(), file);
  const exists = fs.existsSync(fullPath);
  fileStatus[file] = exists;
  console.log(`  ${exists ? '✅' : '❌'} ${file}`);
});

// Check MongoDB connection
console.log('\n🗄️  DATABASE CONNECTION CHECK:');
const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/freight';
console.log(`  Connecting to: ${mongoUri.replace(/\/\/[^:]+:[^@]+@/, '//***:***@')}`);

mongoose.connect(mongoUri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverSelectionTimeoutMS: 5000
})
.then(async () => {
  console.log('  ✅ MongoDB connected successfully');
  
  // Check collections
  const db = mongoose.connection.db;
  const collections = await db.listCollections().toArray();
  console.log(`  📊 Found ${collections.length} collections`);
  
  // Check for admin user
  const User = require('./models/User');
  const adminCount = await User.countDocuments({ role: 'system_admin' });
  console.log(`  👤 Admin users: ${adminCount}`);
  
  if (adminCount === 0) {
    console.log('  ⚠️  No admin user found! Run: node src/scripts/createAdminUser.js');
  }
  
  await mongoose.disconnect();
  console.log('\n✅ Database check complete');
  checkRouteFiles();
})
.catch(err => {
  console.log('  ❌ MongoDB connection failed:', err.message);
  console.log('  💡 Make sure MongoDB is running');
  checkRouteFiles();
});

// Check route files for issues
function checkRouteFiles() {
  console.log('\n🔧 ROUTE FILES INTEGRITY CHECK:');
  
  // Check groundQuotes.js specifically
  const groundQuotesPath = path.join(process.cwd(), 'src/routes/groundQuotes.js');
  if (fs.existsSync(groundQuotesPath)) {
    const content = fs.readFileSync(groundQuotesPath, 'utf8');
    const lastLine = content.trim().split('\n').pop();
    
    if (lastLine === 'module.export') {
      console.log('  ❌ groundQuotes.js is incomplete (ends with module.export)');
      console.log('     Fix: Add "s" to make it "module.exports = router;"');
    } else if (lastLine.includes('module.exports')) {
      console.log('  ✅ groundQuotes.js exports correctly');
    } else {
      console.log('  ⚠️  groundQuotes.js may be incomplete');
    }
  }
  
  // Check for auth middleware usage
  const routeFiles = fs.readdirSync(path.join(process.cwd(), 'src/routes'));
  let authImportIssues = [];
  
  routeFiles.forEach(file => {
    if (file.endsWith('.js')) {
      const content = fs.readFileSync(path.join(process.cwd(), 'src/routes', file), 'utf8');
      if (content.includes("require('../middleware/auth')") && !fileStatus['src/middleware/auth.js']) {
        authImportIssues.push(file);
      }
    }
  });
  
  if (authImportIssues.length > 0) {
    console.log(`  ❌ ${authImportIssues.length} files import missing auth.js:`, authImportIssues.join(', '));
  } else {
    console.log('  ✅ All middleware imports resolved');
  }
  
  generateReport();
}

// Generate final report
function generateReport() {
  console.log('\n' + '=' .repeat(50));
  console.log('📊 DIAGNOSTIC SUMMARY:\n');
  
  const missingEnvVars = Object.entries(envStatus).filter(([k, v]) => !v).map(([k]) => k);
  const missingFiles = Object.entries(fileStatus).filter(([k, v]) => !v).map(([k]) => k);
  
  let criticalIssues = [];
  let warnings = [];
  
  if (missingEnvVars.includes('MONGODB_URI')) {
    criticalIssues.push('MongoDB URI not configured');
  }
  if (missingEnvVars.includes('JWT_SECRET')) {
    criticalIssues.push('JWT_SECRET not set (authentication will fail)');
  }
  if (missingFiles.includes('src/middleware/auth.js')) {
    criticalIssues.push('auth.js middleware missing (routes will crash)');
  }
  
  missingEnvVars.forEach(v => {
    if (!['MONGODB_URI', 'JWT_SECRET'].includes(v)) {
      warnings.push(`Missing ${v} (some features may not work)`);
    }
  });
  
  if (criticalIssues.length > 0) {
    console.log('🚨 CRITICAL ISSUES (server won\'t start):');
    criticalIssues.forEach(issue => console.log(`   - ${issue}`));
  }
  
  if (warnings.length > 0) {
    console.log('\n⚠️  WARNINGS:');
    warnings.forEach(warn => console.log(`   - ${warn}`));
  }
  
  if (criticalIssues.length === 0 && warnings.length === 0) {
    console.log('✅ No issues found! Server should start normally.');
  }
  
  console.log('\n💡 TO FIX:');
  console.log('1. Create src/middleware/auth.js (copy from artifact above)');
  console.log('2. Fix groundQuotes.js ending: change "module.export" to "module.exports = router;"');
  console.log('3. Set missing environment variables in .env file');
  console.log('4. Ensure MongoDB is running');
  console.log('5. Create admin user: node src/scripts/createAdminUser.js');
  
  console.log('\n🚀 Then start server: npm start or node src/app.js');
  
  process.exit(0);
}
