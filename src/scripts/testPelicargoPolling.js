// src/scripts/testPelicargoPolling.js
require('dotenv').config();
const mongoose = require('mongoose');
const Request = require('../models/Request');
const Cost = require('../models/Cost');
const RateProvider = require('../models/RateProvider');
const ProviderFactory = require('../services/providers/ProviderFactory');

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m'
};

// Quick lanes that return in ~30 seconds
const QUICK_LANES = [
  { origin: 'IAH', destination: 'DXB' },
  { origin: 'LAX', destination: 'LHR' },
  { origin: 'JFK', destination: 'FRA' }
];

function isQuickLane(origin, destination) {
  return QUICK_LANES.some(lane => 
    lane.origin === origin && lane.destination === destination
  );
}

async function testPelicargoWithPolling() {
  try {
    // Connect to MongoDB
    console.log(`${colors.blue}🔌 Connecting to MongoDB...${colors.reset}`);
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/freight');
    console.log(`${colors.green}✅ Connected to MongoDB${colors.reset}\n`);

    // Test cases - including IAH to DXB quick lane
    const testCases = [
      {
        name: 'Quick Lane - IAH to DXB',
        origin: 'IAH',  // Houston
        destination: 'DXB',  // Dubai
        expectedTime: '30 seconds',
        cargo: {
          pieces: [{
            quantity: 1,
            weight: 50,
            weightKg: 22.68,
            length: 40,
            width: 30,
            height: 30,
            lengthCm: 101.6,
            widthCm: 76.2,
            heightCm: 76.2,
            commodity: 'Electronics'
          }]
        }
      },
      {
        name: 'Regular Lane - LAX to LHR',
        origin: 'LAX',
        destination: 'LHR',  // London - international route
        expectedTime: '20-30 minutes',
        cargo: {
          pieces: [{
            quantity: 2,
            weight: 100,
            weightKg: 45.36,
            length: 48,
            width: 36,
            height: 36,
            commodity: 'General Cargo'
          }]
        }
      }
    ];

    for (const testCase of testCases) {
      console.log(`${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
      console.log(`${colors.blue}Testing: ${testCase.name}${colors.reset}`);
      console.log(`Route: ${testCase.origin} → ${testCase.destination}`);
      console.log(`Expected Time: ${testCase.expectedTime}`);
      console.log(`${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}\n`);
      
      await submitAndPoll(testCase);
      console.log('');
    }

    console.log(`${colors.green}✅ All tests complete!${colors.reset}`);
    await showSummary();
    
    process.exit(0);
  } catch (error) {
    console.error(`${colors.red}❌ Error: ${error.message}${colors.reset}`);
    console.error(error.stack);
    process.exit(1);
  }
}

async function submitAndPoll(testCase) {
  const startTime = Date.now();
  
  try {
    // Get Pelicargo provider
    const providerConfig = await RateProvider.findOne({ code: 'PELICARGO' });
    if (!providerConfig) {
      console.log(`${colors.red}❌ Pelicargo not found in database${colors.reset}`);
      return;
    }

    const provider = ProviderFactory.create(providerConfig.toObject());
    
    // Create request
    const request = await Request.create({
      requestNumber: `REQ-${Date.now()}`,
      userId: new mongoose.Types.ObjectId(),
      userEmail: 'test@example.com',
      company: 'Test Company',
      shipment: {
        origin: {
          airport: testCase.origin,
          city: testCase.origin,
          state: 'TX',
          zipCode: '77001'
        },
        destination: {
          airport: testCase.destination,
          city: testCase.destination,
          country: 'AE'
        },
        cargo: testCase.cargo
      },
      status: 'processing'
    });

    console.log(`📋 Request ID: ${request.requestNumber}`);
    console.log(`Submitting to Pelicargo...`);
    
    // Submit quote request
    const result = await provider.getQuote(request);
    
    if (!result.requestId) {
      console.log(`${colors.red}❌ No requestId returned${colors.reset}`);
      return;
    }

    const pelicargoRequestId = result.requestId;
    console.log(`${colors.green}✅ Pelicargo Request ID: ${pelicargoRequestId}${colors.reset}`);
    
    // Save initial cost record (with dummy totalCost for pending status)
    const cost = await Cost.create({
      requestId: request._id,
      provider: 'Pelicargo',
      providerRequestId: pelicargoRequestId,
      rawRequest: request.shipment,
      status: 'pending',
      costs: {
        totalCost: 0,  // Required field, will update when quotes arrive
        currency: 'USD'
      },
      responseTimeMs: Date.now() - startTime
    });

    // Determine polling strategy
    const isQuick = isQuickLane(testCase.origin, testCase.destination);
    const pollConfig = isQuick ? {
      initialDelay: 5000,     // 5 seconds
      interval: 5000,         // 5 seconds
      maxAttempts: 20,        // 100 seconds max
      quickLane: true
    } : {
      initialDelay: 30000,    // 30 seconds
      interval: 60000,        // 60 seconds
      maxAttempts: 35,        // 35 minutes max
      quickLane: false
    };

    console.log(`${colors.magenta}⏱️  Polling strategy: ${isQuick ? 'QUICK LANE' : 'REGULAR'}${colors.reset}`);
    console.log(`   Initial wait: ${pollConfig.initialDelay / 1000}s`);
    console.log(`   Poll interval: ${pollConfig.interval / 1000}s`);
    console.log(`   Max attempts: ${pollConfig.maxAttempts}`);
    
    // Start polling
    const quotes = await pollForQuotes(provider, pelicargoRequestId, pollConfig);
    
    if (quotes && quotes.length > 0) {
      const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`${colors.green}✅ Received ${quotes.length} quotes in ${elapsedTime} seconds${colors.reset}`);
      
      // Update cost record
      await Cost.findByIdAndUpdate(cost._id, {
        status: 'completed',
        rawResponse: quotes,
        costs: {
          totalCost: quotes[0].costs?.totalCost || 0,
          currency: 'USD'
        },
        responseTimeMs: Date.now() - startTime
      });
      
      // Display quotes
      displayQuotes(quotes);
    } else {
      console.log(`${colors.yellow}⚠️  No quotes received after polling${colors.reset}`);
      
      await Cost.findByIdAndUpdate(cost._id, {
        status: 'failed',
        error: 'Timeout - no quotes received'
      });
    }
    
  } catch (error) {
    console.log(`${colors.red}❌ Error: ${error.message}${colors.reset}`);
  }
}

async function pollForQuotes(provider, requestId, config) {
  const { initialDelay, interval, maxAttempts, quickLane } = config;
  
  // Initial delay
  console.log(`\n⏳ Waiting ${initialDelay / 1000} seconds before first check...`);
  await sleep(initialDelay);
  
  let attempts = 0;
  let lastStatus = '';
  
  while (attempts < maxAttempts) {
    attempts++;
    
    const spinner = getSpinner(attempts);
    process.stdout.write(`\r${spinner} Checking status... (Attempt ${attempts}/${maxAttempts})`);
    
    try {
      const status = await provider.checkQuoteStatus(requestId);
      
      if (status.success && status.status === 'COMPLETED' && status.quotes) {
        process.stdout.write('\r' + ' '.repeat(60) + '\r'); // Clear line
        return status.quotes;
      } else if (status.status !== lastStatus) {
        lastStatus = status.status;
        process.stdout.write('\r' + ' '.repeat(60) + '\r');
        console.log(`   Status: ${colors.yellow}${status.status || 'PROCESSING'}${colors.reset}`);
      }
    } catch (error) {
      process.stdout.write('\r' + ' '.repeat(60) + '\r');
      console.log(`   ${colors.red}Check failed: ${error.message}${colors.reset}`);
    }
    
    // Don't wait after last attempt
    if (attempts < maxAttempts) {
      await sleep(interval);
    }
  }
  
  process.stdout.write('\r' + ' '.repeat(60) + '\r');
  console.log(`${colors.yellow}⚠️  Timeout after ${maxAttempts} attempts${colors.reset}`);
  return null;
}

function displayQuotes(quotes) {
  console.log(`\n${colors.cyan}📦 QUOTES RECEIVED:${colors.reset}`);
  
  quotes.forEach((quote, index) => {
    console.log(`\n  Quote ${index + 1}:`);
    console.log(`    Carrier: ${quote.carrier || quote.airlineCode}`);
    console.log(`    Service: ${quote.service} - ${quote.serviceType}`);
    console.log(`    Price: $${(quote.costs?.totalCost || 0).toFixed(2)} USD`);
    console.log(`    Transit: ${quote.transitTime}`);
    
    if (quote.costs?.freight || quote.costs?.fuel) {
      console.log(`    Breakdown:`);
      if (quote.costs.freight) console.log(`      - Freight: $${quote.costs.freight.toFixed(2)}`);
      if (quote.costs.fuel) console.log(`      - Fuel: $${quote.costs.fuel.toFixed(2)}`);
      if (quote.costs.screening) console.log(`      - Screening: $${quote.costs.screening.toFixed(2)}`);
    }
    
    if (quote.chargeableWeight) {
      console.log(`    Chargeable Weight: ${quote.chargeableWeight} kg`);
    }
  });
}

async function showSummary() {
  console.log(`\n${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
  console.log(`${colors.blue}📊 SUMMARY${colors.reset}`);
  console.log(`${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}\n`);
  
  const costs = await Cost.find({ provider: 'Pelicargo' })
    .sort('-createdAt')
    .limit(10);
  
  const completed = costs.filter(c => c.status === 'completed');
  const pending = costs.filter(c => c.status === 'pending');
  const failed = costs.filter(c => c.status === 'failed');
  
  console.log(`Total Pelicargo Requests: ${costs.length}`);
  console.log(`  ${colors.green}Completed: ${completed.length}${colors.reset}`);
  console.log(`  ${colors.yellow}Pending: ${pending.length}${colors.reset}`);
  console.log(`  ${colors.red}Failed: ${failed.length}${colors.reset}`);
  
  if (completed.length > 0) {
    console.log(`\nAverage Response Time: ${
      (completed.reduce((sum, c) => sum + c.responseTimeMs, 0) / completed.length / 1000).toFixed(1)
    } seconds`);
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getSpinner(frame) {
  const spinners = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  return spinners[frame % spinners.length];
}

// Run the test
testPelicargoWithPolling();
