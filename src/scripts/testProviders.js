// src/scripts/testProviders.js
require('dotenv').config();
const mongoose = require('mongoose');
const RateProvider = require('../models/RateProvider');
const axios = require('axios');

// Color codes for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m'
};

async function seedAndTestProviders() {
  try {
    // Connect to MongoDB
    console.log(`${colors.blue}🔌 Connecting to MongoDB...${colors.reset}`);
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/freight');
    console.log(`${colors.green}✅ Connected to MongoDB${colors.reset}\n`);

    // Provider configurations
    const providers = [
      {
        name: 'FreightForce',
        code: 'FREIGHTFORCE',
        type: 'api',
        apiConfig: {
          baseUrl: process.env.FREIGHT_FORCE_BASE_URL || 'https://dev-ffapi.freightforce.com',
          username: process.env.FREIGHT_FORCE_USERNAME || 'test_user',
          password: process.env.FREIGHT_FORCE_PASSWORD || 'test_pass',
          email: process.env.FREIGHT_FORCE_EMAIL || 'test@example.com',
          accountId: process.env.FREIGHT_FORCE_ACCOUNT_ID || '7805'
        },
        services: [
          {
            mode: 'road',
            serviceTypes: ['pickup', 'delivery', 'door-to-airport'],
            active: true
          }
        ],
        priority: 10,
        status: 'active'
      },
      {
        name: 'ECU Lines',
        code: 'ECULINES',
        type: 'api',
        apiConfig: {
          baseUrl: 'apim.ecuworldwide.com',
          apiKey: process.env.ECU_LINES_API_KEY || 'test_key',
          accountId: process.env.ECU_LINES_ACCOUNT_ID || '519222'
        },
        services: [
          {
            mode: 'ocean',
            serviceTypes: ['LCL', 'FCL'],
            active: true
          }
        ],
        priority: 20,
        status: 'active'
      },
      {
        name: 'Pelicargo',
        code: 'PELICARGO',
        type: 'api',
        apiConfig: {
          baseUrl: process.env.PELICARGO_BASE_URL || 'https://staging-1-api.boardwalk.pelicargo.com/v3',
          apiKey: process.env.PELICARGO_API_KEY || 'test_key'
        },
        services: [
          {
            mode: 'air',
            serviceTypes: ['express', 'standard', 'economy'],
            active: true
          }
        ],
        priority: 5,
        status: 'active'
      }
    ];

    console.log(`${colors.blue}📦 Seeding providers...${colors.reset}`);
    
    // Seed providers
    for (const provider of providers) {
      const existing = await RateProvider.findOne({ code: provider.code });
      
      if (existing) {
        Object.assign(existing, provider);
        await existing.save();
        console.log(`  Updated: ${colors.yellow}${provider.name}${colors.reset}`);
      } else {
        await RateProvider.create(provider);
        console.log(`  Created: ${colors.green}${provider.name}${colors.reset}`);
      }
    }

    console.log(`\n${colors.blue}🧪 Testing provider connections...${colors.reset}\n`);

    // Test each provider
    for (const provider of providers) {
      await testProvider(provider);
    }

    console.log(`\n${colors.green}✅ All tests complete!${colors.reset}`);
    process.exit(0);
  } catch (error) {
    console.error(`${colors.red}❌ Error: ${error.message}${colors.reset}`);
    process.exit(1);
  }
}

async function testProvider(config) {
  console.log(`${colors.blue}Testing ${config.name}...${colors.reset}`);
  
  try {
    switch (config.code) {
      case 'FREIGHTFORCE':
        await testFreightForce(config);
        break;
      case 'ECULINES':
        await testECULines(config);
        break;
      case 'PELICARGO':
        await testPelicargo(config);
        break;
    }
  } catch (error) {
    console.log(`  ${colors.red}❌ Failed: ${error.message}${colors.reset}`);
  }
}

async function testFreightForce(config) {
  const { baseUrl, username, password, email } = config.apiConfig;
  
  // Test authentication
  console.log(`  Testing auth endpoint...`);
  
  try {
    const authResponse = await axios.post(
      `${baseUrl}/api/Auth/token`,
      { username, password, contactEmail: email },
      { 
        timeout: 10000,
        validateStatus: () => true // Don't throw on any status
      }
    );
    
    if (authResponse.status === 200) {
      console.log(`  ${colors.green}✅ Authentication successful${colors.reset}`);
      console.log(`  Token received: ${authResponse.data.token ? 'Yes' : 'No'}`);
    } else if (authResponse.status === 401) {
      console.log(`  ${colors.yellow}⚠️  Invalid credentials (401)${colors.reset}`);
      console.log(`  Note: You need valid FreightForce API credentials`);
    } else {
      console.log(`  ${colors.yellow}⚠️  Unexpected status: ${authResponse.status}${colors.reset}`);
    }
  } catch (error) {
    if (error.code === 'ENOTFOUND') {
      console.log(`  ${colors.red}❌ Cannot reach API server${colors.reset}`);
    } else if (error.code === 'ETIMEDOUT') {
      console.log(`  ${colors.red}❌ Connection timeout${colors.reset}`);
    } else {
      console.log(`  ${colors.red}❌ ${error.message}${colors.reset}`);
    }
  }
}

async function testECULines(config) {
  const { apiKey } = config.apiConfig;
  
  console.log(`  Testing API with key: ${apiKey ? apiKey.substring(0, 5) + '...' : 'Not set'}`);
  
  // Test with a simple ping-like request
  const https = require('https');
  
  return new Promise((resolve) => {
    const options = {
      hostname: 'apim.ecuworldwide.com',
      port: 443,
      path: '/quotations/v1/',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Ecuw-Api-Key': apiKey
      },
      timeout: 10000
    };

    const req = https.request(options, (res) => {
      if (res.statusCode === 401) {
        console.log(`  ${colors.yellow}⚠️  Invalid API key (401)${colors.reset}`);
        console.log(`  Note: You need a valid ECU Lines API key`);
      } else if (res.statusCode === 400) {
        console.log(`  ${colors.green}✅ API reachable (got 400 - missing data, which is expected)${colors.reset}`);
      } else {
        console.log(`  ${colors.yellow}Status: ${res.statusCode}${colors.reset}`);
      }
      resolve();
    });

    req.on('error', (error) => {
      console.log(`  ${colors.red}❌ Connection error: ${error.message}${colors.reset}`);
      resolve();
    });

    req.on('timeout', () => {
      console.log(`  ${colors.red}❌ Connection timeout${colors.reset}`);
      req.destroy();
      resolve();
    });

    // Send minimal data to test connection
    req.write(JSON.stringify({ test: true }));
    req.end();
  });
}

async function testPelicargo(config) {
  const { baseUrl, apiKey } = config.apiConfig;
  
  console.log(`  Testing API with key: ${apiKey ? apiKey.substring(0, 5) + '...' : 'Not set'}`);
  
  try {
    // Try to access the API
    const response = await axios.get(
      `${baseUrl}/health`, // Assuming they have a health endpoint
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'x-api-key': apiKey
        },
        timeout: 10000,
        validateStatus: () => true
      }
    );
    
    if (response.status === 200) {
      console.log(`  ${colors.green}✅ API accessible${colors.reset}`);
    } else if (response.status === 401 || response.status === 403) {
      console.log(`  ${colors.yellow}⚠️  Authentication required (${response.status})${colors.reset}`);
      console.log(`  Note: You need a valid Pelicargo API key`);
    } else if (response.status === 404) {
      console.log(`  ${colors.yellow}⚠️  Health endpoint not found (API may still work)${colors.reset}`);
    } else {
      console.log(`  ${colors.yellow}Status: ${response.status}${colors.reset}`);
    }
  } catch (error) {
    if (error.code === 'ENOTFOUND') {
      console.log(`  ${colors.red}❌ Cannot reach API server${colors.reset}`);
    } else if (error.code === 'ETIMEDOUT') {
      console.log(`  ${colors.red}❌ Connection timeout${colors.reset}`);
    } else {
      console.log(`  ${colors.yellow}⚠️  ${error.message}${colors.reset}`);
    }
  }
}

// Run the script
seedAndTestProviders();
