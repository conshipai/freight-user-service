require('dotenv').config();
const mongoose = require('mongoose');
const RateProvider = require('../models/RateProvider');

const providers = [
  {
    name: 'FreightForce',
    code: 'FREIGHTFORCE',
    type: 'api',
    apiConfig: {
      baseUrl: process.env.FREIGHT_FORCE_BASE_URL || 'https://dev-ffapi.freightforce.com',
      username: process.env.FREIGHT_FORCE_USERNAME,
      password: process.env.FREIGHT_FORCE_PASSWORD,
      email: process.env.FREIGHT_FORCE_EMAIL,
      accountId: process.env.FREIGHT_FORCE_ACCOUNT_ID || '7805'
    },
    services: [
      {
        mode: 'road',
        serviceTypes: ['pickup', 'delivery', 'door-to-airport'],
        active: true
      }
    ],
    markupSettings: {
      road: {
        percentage: 30,
        minimumMarkup: 40,
        maximumMarkup: 3000,
        flatFee: 0
      }
    },
    additionalFees: [
      {
        name: 'Documentation Fee',
        code: 'DOC',
        amount: 35,
        feeType: 'fixed',
        serviceType: 'road',
        mandatory: true,
        active: true
      },
      {
        name: 'Fuel Surcharge',
        code: 'FSC',
        amount: 5,
        feeType: 'percentage',
        serviceType: 'road',
        mandatory: true,
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
      apiKey: process.env.ECU_LINES_API_KEY,
      accountId: process.env.ECU_LINES_ACCOUNT_ID || '519222'
    },
    services: [
      {
        mode: 'ocean',
        serviceTypes: ['LCL', 'FCL'],
        active: true
      }
    ],
    markupSettings: {
      ocean: {
        percentage: 20,
        minimumMarkup: 75,
        maximumMarkup: 10000,
        flatFee: 0
      }
    },
    additionalFees: [
      {
        name: 'Documentation Fee',
        code: 'DOC',
        amount: 50,
        feeType: 'fixed',
        serviceType: 'ocean',
        mandatory: true,
        active: true
      },
      {
        name: 'THC (Terminal Handling)',
        code: 'THC',
        amount: 150,
        feeType: 'fixed',
        serviceType: 'ocean',
        mandatory: true,
        active: true
      }
    ],
    priority: 20,
    status: 'active'
  }
];

async function seedProviders() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/freight');
    console.log('Connected to MongoDB');
    
    for (const provider of providers) {
      const existing = await RateProvider.findOne({ code: provider.code });
      
      if (existing) {
        // Update existing
        Object.assign(existing, provider);
        await existing.save();
        console.log(`Updated provider: ${provider.name}`);
      } else {
        // Create new
        await RateProvider.create(provider);
        console.log(`Created provider: ${provider.name}`);
      }
    }
    
    console.log('Seed completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('Seed failed:', error);
    process.exit(1);
  }
}

seedProviders();
