const axios = require('axios');

class BaseProvider {
  constructor(config) {
    this.name = config.name;
    this.code = config.code;
    this.type = config.type;
    this.apiConfig = config.apiConfig;
    this.markupSettings = config.markupSettings;
    this.timeout = config.timeout || 30000;
    this.retryAttempts = config.retryAttempts || 3;
    this.logger = console; // You can inject a proper logger
  }

  // Calculate markup based on cost and mode
  calculateMarkup(cost, mode) {
    const settings = this.markupSettings[mode];
    if (!settings) return { markup: 0, total: cost };
    
    let markupAmount = cost * (settings.percentage / 100);
    
    // Apply min/max constraints
    markupAmount = Math.max(markupAmount, settings.minimumMarkup || 0);
    markupAmount = Math.min(markupAmount, settings.maximumMarkup || Infinity);
    
    // Add flat fee
    markupAmount += settings.flatFee || 0;
    
    return {
      markup: Math.round(markupAmount * 100) / 100,
      total: Math.round((cost + markupAmount) * 100) / 100
    };
  }

  // Apply additional fees
  applyAdditionalFees(baseCost, mode) {
    const fees = [];
    let totalFees = 0;
    
    // Get fees from provider config
    if (this.additionalFees) {
      this.additionalFees
        .filter(fee => fee.active && (fee.serviceType === 'all' || fee.serviceType === mode))
        .forEach(fee => {
          const amount = fee.feeType === 'percentage' 
            ? baseCost * (fee.amount / 100)
            : fee.amount;
          
          fees.push({
            name: fee.name,
            code: fee.code,
            amount: Math.round(amount * 100) / 100
          });
          
          totalFees += amount;
        });
    }
    
    return { fees, totalFees: Math.round(totalFees * 100) / 100 };
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

  // Must be implemented by each provider
  async getQuote(request) {
    throw new Error('getQuote must be implemented by provider');
  }
}

module.exports = BaseProvider;
