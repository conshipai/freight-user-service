// src/services/providers/TForceProvider.js
const axios = require('axios');

class TForceProvider {
  constructor(config = {}) {
    // TForce API configuration
    this.baseURL = 'https://api.tforcefreight.com/rating';
    this.apiKey = config.apiKey || process.env.TFORCE_API_KEY;
    this.accountNumber = config.accountNumber || process.env.TFORCE_ACCOUNT_NUMBER;
    
    // Check if we have required credentials
    if (!this.apiKey) {
      console.warn('TForce API key not configured');
    }
  }

  // Main method to get rates
  async getRates(quoteRequest) {
    try {
      console.log('🚚 Getting TForce rates for:', {
        origin: quoteRequest.origin?.zipCode,
        destination: quoteRequest.destination?.zipCode
      });

      // We'll build this next
      const tforceRequest = this.buildRequest(quoteRequest);
      
      // Make the API call
      const response = await this.callAPI(tforceRequest);
      
      // Format the response for your system
      return this.formatResponse(response);
      
    } catch (error) {
      console.error('TForce API error:', error);
      throw error;
    }
  }

  // More methods to come...
}

module.exports = TForceProvider;
