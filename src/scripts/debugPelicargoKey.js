// src/scripts/debugPelicargoKey.js
require('dotenv').config();
const axios = require('axios');

const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
};

async function debugPelicargoKey() {
  console.log(`${colors.blue}=== PELICARGO API KEY DEBUG ===${colors.reset}\n`);
  
  // 1. Check environment variable
  const apiKey = process.env.PELICARGO_API_KEY;
  console.log(`1. Environment Variable Check:`);
  console.log(`   PELICARGO_API_KEY exists: ${apiKey ? 'YES' : 'NO'}`);
  if (apiKey) {
    console.log(`   Key starts with: ${apiKey.substring(0, 10)}...`);
    console.log(`   Key length: ${apiKey.length} characters`);
  }
  
  // 2. Test with axios (how your app does it)
  console.log(`\n2. Testing with Axios (like your app):`);
  
  const client = axios.create({
    baseURL: 'https://staging-1-api.boardwalk.pelicargo.com/v3',
    timeout: 15000,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'Accept': 'application/json'
    }
  });
  
  // Log the actual headers being sent
  client.interceptors.request.use(request => {
    console.log(`   Headers being sent:`);
    console.log(`   - Authorization: ${request.headers.Authorization ? request.headers.Authorization.substring(0, 20) + '...' : 'NOT SET'}`);
    console.log(`   - Content-Type: ${request.headers['Content-Type']}`);
    return request;
  });
  
  try {
    const response = await client.get('/meta/pubkey');
    console.log(`   ${colors.green}✅ SUCCESS: Got ${response.status} response${colors.reset}`);
  } catch (error) {
    console.log(`   ${colors.red}❌ FAILED: ${error.response?.status} - ${error.response?.data?.message || error.message}${colors.reset}`);
  }
  
  // 3. Test with raw axios (no client)
  console.log(`\n3. Testing with raw Axios request:`);
  try {
    const response = await axios.get('https://staging-1-api.boardwalk.pelicargo.com/v3/meta/pubkey', {
      headers: {
        'Authorization': `Bearer ${apiKey}`
      }
    });
    console.log(`   ${colors.green}✅ SUCCESS: Got ${response.status} response${colors.reset}`);
  } catch (error) {
    console.log(`   ${colors.red}❌ FAILED: ${error.response?.status} - ${error.response?.data?.message || error.message}${colors.reset}`);
  }
  
  // 4. Test with hardcoded key
  console.log(`\n4. Testing with hardcoded key:`);
  const hardcodedKey = 'peli-KZBzF2gyu6DvCG-12pLM-yCYxKU3-30biZnjDxk7jpQ';
  try {
    const response = await axios.get('https://staging-1-api.boardwalk.pelicargo.com/v3/meta/pubkey', {
      headers: {
        'Authorization': `Bearer ${hardcodedKey}`
      }
    });
    console.log(`   ${colors.green}✅ SUCCESS: Got ${response.status} response${colors.reset}`);
  } catch (error) {
    console.log(`   ${colors.red}❌ FAILED: ${error.response?.status} - ${error.response?.data?.message || error.message}${colors.reset}`);
  }
  
  // 5. Compare keys
  console.log(`\n5. Key Comparison:`);
  if (apiKey && apiKey !== hardcodedKey) {
    console.log(`   ${colors.yellow}⚠️  Environment key differs from hardcoded key${colors.reset}`);
    console.log(`   Env key:      ${apiKey.substring(0, 20)}...`);
    console.log(`   Hardcoded:    ${hardcodedKey.substring(0, 20)}...`);
  } else if (apiKey === hardcodedKey) {
    console.log(`   ${colors.green}✓ Keys match${colors.reset}`);
  }
  
  // 6. Check the actual provider file
  console.log(`\n6. Checking PelicargoProvider configuration:`);
  try {
    const RateProvider = require('../models/RateProvider');
    const mongoose = require('mongoose');
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/freight');
    
    const providerConfig = await RateProvider.findOne({ code: 'PELICARGO' });
    if (providerConfig) {
      console.log(`   Provider found in DB`);
      console.log(`   API Key in DB: ${providerConfig.apiConfig?.apiKey ? providerConfig.apiConfig.apiKey.substring(0, 10) + '...' : 'NOT SET'}`);
      
      // Test with DB key
      if (providerConfig.apiConfig?.apiKey) {
        try {
          const response = await axios.get('https://staging-1-api.boardwalk.pelicargo.com/v3/meta/pubkey', {
            headers: {
              'Authorization': `Bearer ${providerConfig.apiConfig.apiKey}`
            }
          });
          console.log(`   ${colors.green}✅ DB key works: Got ${response.status} response${colors.reset}`);
        } catch (error) {
          console.log(`   ${colors.red}❌ DB key failed: ${error.response?.status}${colors.reset}`);
        }
      }
    }
    
    await mongoose.disconnect();
  } catch (error) {
    console.log(`   Could not check DB: ${error.message}`);
  }
  
  console.log(`\n${colors.blue}=== END DEBUG ===${colors.reset}`);
}

debugPelicargoKey();
