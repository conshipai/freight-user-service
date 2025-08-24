// src/scripts/testRealQuotes.js
require('dotenv').config();
const mongoose = require('mongoose');
const Request = require('../models/Request');
const Cost = require('../models/Cost');
const Quote = require('../models/Quote');
const RateProvider = require('../models/RateProvider');
const ProviderFactory = require('../services/providers/ProviderFactory');

// Color codes for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

async function testRealQuotes() {
  try {
    // Connect to MongoDB
    console.log(`${colors.blue}🔌 Connecting to MongoDB...${colors.reset}`);
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/freight');
    console.log(`${colors.green}✅ Connected to MongoDB${colors.reset}\n`);

    // Create test requests for each provider
    const testRequests = [
      {
        name: 'FreightForce - Ground Transport',
        provider: 'FREIGHTFORCE',
        request: {
          shipment: {
            origin: {
              airport: 'LAX',
              city: 'Los Angeles', 
              state: 'CA',
              zipCode: '90045'
            },
            destination: {
              airport: 'LAX', // Same city for ground transport test
              city: 'Los Angeles',
              country: 'US'
            },
            cargo: {
              pieces: [{
                id: '1',
                quantity: 2,
                weight: 50, // lbs per piece
                length: 24,
                width: 18,
                height: 12,
                commodity: 'Electronics',
                stackable: true
              }],
              totalPieces: 2,
              totalWeight: 100 // total lbs
            }
          }
        }
      },
      {
        name: 'ECU Lines - Ocean Freight',
        provider: 'ECULINES',
        request: {
          shipment: {
            origin: {
              airport: 'LAX',
              city: 'Los Angeles',
              state: 'CA',
              zipCode: '90045',
              portCode: 'USLAX' // LA port
            },
            destination: {
              airport: 'HAM',
              city: 'Hamburg',
              country: 'DE',
              portCode: 'DEHAM' // Hamburg port
            },
            cargo: {
              pieces: [{
                id: '1',
                quantity: 1,
                weight: 1000, // kg
                weightKg: 1000,
                length: 100,
                width: 100,
                height: 100,
                commodity: 'General Cargo'
              }],
              totalWeight: 1000,
              totalWeightKg: 1000,
              totalVolume: 1, // cubic meter
              containerType: 'LCL'
            }
          }
        }
      },
      {
        name: 'Pelicargo - Air Freight',
        provider: 'PELICARGO',
        request: {
          shipment: {
            origin: {
              airport: 'LAX',
              city: 'Los Angeles',
              state: 'CA'
            },
            destination: {
              airport: 'JFK',
              city: 'New York',
              country: 'US'
            },
            cargo: {
              pieces: [{
                id: '1',
                quantity: 1,
                weight: 100,
                weightKg: 45.36,
                length: 40,
                width: 30,
                height: 30,
                lengthCm: 101.6,
                widthCm: 76.2,
                heightCm: 76.2,
                commodity: 'Documents',
                cargoType: 'General',
                stackable: true
              }],
              totalPieces: 1,
              totalWeight: 100,
              totalWeightKg: 45.36
            }
          }
        }
      }
    ];

    // Test each provider
    for (const test of testRequests) {
      console.log(`${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
      console.log(`${colors.blue}Testing: ${test.name}${colors.reset}`);
      console.log(`${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
      
      await testProvider(test);
      console.log('');
    }

    console.log(`${colors.green}✅ All quote tests complete!${colors.reset}`);
    
    // Show summary
    await showSummary();
    
    process.exit(0);
  } catch (error) {
    console.error(`${colors.red}❌ Error: ${error.message}${colors.reset}`);
    console.error(error.stack);
    process.exit(1);
  }
}

async function testProvider(test) {
  const startTime = Date.now();
  
  try {
    // Get provider config
    const providerConfig = await RateProvider.findOne({ code: test.provider });
    if (!providerConfig) {
      console.log(`  ${colors.red}❌ Provider ${test.provider} not found in database${colors.reset}`);
      return;
    }

    console.log(`  Provider: ${providerConfig.name}`);
    console.log(`  Mode: ${providerConfig.services[0].mode}`);
    console.log(`  Origin: ${test.request.shipment.origin.city}`);
    console.log(`  Destination: ${test.request.shipment.destination.city}`);
    console.log(`  Cargo: ${test.request.shipment.cargo.totalWeight} ${test.provider === 'ECULINES' ? 'kg' : 'lbs'}`);
    console.log('');
    
    // Create provider instance
    const provider = ProviderFactory.create(providerConfig.toObject());
    
    // Create request record
    const request = await Request.create({
      userId: new mongoose.Types.ObjectId(), // Dummy user ID for testing
      userEmail: 'test@example.com',
      company: 'Test Company',
      shipment: test.request.shipment,
      status: 'processing'
    });
    
    console.log(`  📋 Request ID: ${request.requestNumber}`);
    
    // Special handling for Pelicargo (async)
    if (test.provider === 'PELICARGO') {
      console.log(`  ${colors.yellow}⏳ Pelicargo is async - submitting request...${colors.reset}`);
      
      try {
        const pelicargoRequest = transformForPelicargo(request);
        console.log(`  Sending to Pelicargo API...`);
        
        const submitResult = await provider.submitQuoteRequest(pelicargoRequest);
        
        console.log(`  ${colors.green}✅ Request submitted successfully${colors.reset}`);
        console.log(`  Pelicargo Request ID: ${submitResult.requestId}`);
        console.log(`  Status: Will need to poll for results (async)`);
        
        // Save pending cost record
        await Cost.create({
          requestId: request._id,
          provider: 'Pelicargo',
          providerRequestId: submitResult.requestId,
          rawRequest: pelicargoRequest,
          status: 'pending'
        });
        
      } catch (error) {
        console.log(`  ${colors.red}❌ Failed: ${error.message}${colors.reset}`);
      }
      
    } else {
      // Synchronous providers (FreightForce, ECU Lines)
      console.log(`  Getting quote from ${providerConfig.name}...`);
      
      try {
        const result = await provider.getQuote(request);
        
        // Save cost record
        const cost = await Cost.create({
          requestId: request._id,
          provider: providerConfig.name,
          rawRequest: test.request.shipment,
          rawResponse: result.rawResponse,
          costs: result.costs,
          service: result.service,
          serviceType: result.serviceType,
          transitTime: result.transitTime,
          transitDays: result.transitDays,
          validUntil: result.validUntil,
          responseTimeMs: Date.now() - startTime,
          status: 'completed'
        });
        
        console.log(`  ${colors.green}✅ Quote received successfully${colors.reset}`);
        console.log(`  Base Cost: $${result.costs.totalCost.toFixed(2)} ${result.costs.currency || 'USD'}`);
        console.log(`  Service: ${result.service} - ${result.serviceType}`);
        console.log(`  Transit Time: ${result.transitTime}`);
        console.log(`  Response Time: ${cost.responseTimeMs}ms`);
        
        // Show cost breakdown if available
        if (result.costs.freight || result.costs.fuel) {
          console.log(`  Breakdown:`);
          if (result.costs.freight) console.log(`    - Freight: $${result.costs.freight.toFixed(2)}`);
          if (result.costs.fuel) console.log(`    - Fuel: $${result.costs.fuel.toFixed(2)}`);
          if (result.costs.accessorials) console.log(`    - Accessorials: $${result.costs.accessorials.toFixed(2)}`);
        }
        
      } catch (error) {
        console.log(`  ${colors.red}❌ Failed to get quote: ${error.message}${colors.reset}`);
        
        // Save failed cost record
        await Cost.create({
          requestId: request._id,
          provider: providerConfig.name,
          status: 'failed',
          error: error.message,
          responseTimeMs: Date.now() - startTime
        });
      }
    }
    
    // Update request status
    await Request.findByIdAndUpdate(request._id, {
      status: 'completed',
      completedAt: new Date()
    });
    
  } catch (error) {
    console.log(`  ${colors.red}❌ Test failed: ${error.message}${colors.reset}`);
  }
}

// Transform request for Pelicargo
function transformForPelicargo(request) {
  const shipment = request.shipment;
  
  return {
    origin: { airport: shipment.origin.airport },
    destination: { airport: shipment.destination.airport },
    cargo: {
      pieces: shipment.cargo.pieces.map(piece => ({
        quantity: piece.quantity,
        weight: piece.weightKg || piece.weight * 0.453592,
        length: piece.lengthCm || piece.length * 2.54,
        width: piece.widthCm || piece.width * 2.54,
        height: piece.heightCm || piece.height * 2.54,
        handling: piece.stackable === false ? ['NonStackable'] : []
      }))
    }
  };
}

async function showSummary() {
  console.log(`\n${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
  console.log(`${colors.blue}📊 SUMMARY${colors.reset}`);
  console.log(`${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}\n`);
  
  const costs = await Cost.find().sort('-createdAt').limit(10);
  
  console.log(`Total Costs Retrieved: ${costs.length}`);
  console.log('');
  
  const successful = costs.filter(c => c.status === 'completed');
  const pending = costs.filter(c => c.status === 'pending');
  const failed = costs.filter(c => c.status === 'failed');
  
  if (successful.length > 0) {
    console.log(`${colors.green}Successful Quotes (${successful.length}):${colors.reset}`);
    successful.forEach(c => {
      console.log(`  • ${c.provider}: $${c.costs.totalCost.toFixed(2)} - ${c.service} (${c.responseTimeMs}ms)`);
    });
  }
  
  if (pending.length > 0) {
    console.log(`\n${colors.yellow}Pending (Async) Quotes (${pending.length}):${colors.reset}`);
    pending.forEach(c => {
      console.log(`  • ${c.provider}: Request ID ${c.providerRequestId}`);
    });
  }
  
  if (failed.length > 0) {
    console.log(`\n${colors.red}Failed Quotes (${failed.length}):${colors.reset}`);
    failed.forEach(c => {
      console.log(`  • ${c.provider}: ${c.error}`);
    });
  }
}

// Run the test
testRealQuotes();
