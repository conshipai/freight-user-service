// src/test/testQuoteFlow.js
const axios = require('axios');

const API_URL = 'http://localhost:3001/api';

async function testQuoteFlow() {
  try {
    // 1. Create a test quote request
    const quoteRequest = {
      shipment: {
        origin: {
          airport: 'LAX',
          city: 'Los Angeles',
          state: 'CA',
          zipCode: '90045'
        },
        destination: {
          airport: 'LHR',
          city: 'London',
          country: 'GB'
        },
        cargo: {
          pieces: [{
            quantity: 2,
            weight: 100,
            length: 48,
            width: 40,
            height: 36,
            cargoType: 'General',
            commodity: 'Electronics'
          }],
          totalWeight: 200,
          totalPieces: 2
        }
      }
    };

    console.log('📤 Submitting quote request...');
    const response = await axios.post(`${API_URL}/quotes/create`, quoteRequest);
    console.log('✅ Request created:', response.data.requestNumber);

    // 2. Check status periodically
    const requestId = response.data.data._id;
    
    for (let i = 0; i < 10; i++) {
      await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
      
      const status = await axios.get(`${API_URL}/quotes/status/${requestId}`);
      console.log(`📊 Status check ${i + 1}:`, status.data);
      
      if (status.data.quote) {
        console.log('✅ Quote ready!', status.data.quote);
        break;
      }
    }
  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
  }
}

testQuoteFlow();
