// src/services/providers/BaseProvider.js
const axios = require('axios');

class BaseProvider {
  constructor(config) {
    this.name = config.name;
    this.code = config.code;
    this.type = config.type;
    this.apiConfig = config.apiConfig;
    this.timeout = config.timeout || 30000;
    this.retryAttempts = config.retryAttempts || 3;
  }

  // Retry logic
  async executeWithRetry(fn) {
    let lastError;
    for (let i = 0; i < this.retryAttempts; i++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        if (i < this.retryAttempts - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
        }
      }
    }
    throw lastError;
  }

  // Returns RAW costs only - no markup
  async getQuote(request) {
    throw new Error('getQuote must be implemented by provider');
  }

  // Transform request to provider format
  transformRequest(request) {
    throw new Error('transformRequest must be implemented by provider');
  }

  // Parse provider response to standard format
  parseResponse(response) {
    throw new Error('parseResponse must be implemented by provider');
  }
}

module.exports = BaseProvider;
