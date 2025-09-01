// services/providers/GroundProviderFactory.js
const STGProvider = require('./ground/STGProvider');
const SEFLProvider = require('./ground/SEFLProvider');

class GroundProviderFactory {
  constructor() {
    // Register all available providers
    this.providerClasses = {
      'STG': STGProvider,
      'SEFL': SEFLProvider,
      // Add more as you create them:
      // 'YRC': YRCProvider,
      // 'ESTES': EstesProvider,
      // 'ABF': ABFProvider,
      // etc...
    };

    // Control which providers are active (could come from DB)
    this.activeProviders = process.env.ACTIVE_GROUND_CARRIERS 
      ? process.env.ACTIVE_GROUND_CARRIERS.split(',')
      : ['STG', 'SEFL'];
  }

  // Get a specific provider instance
  getProvider(code) {
    const ProviderClass = this.providerClasses[code];
    if (!ProviderClass) {
      console.warn(`Provider ${code} not found`);
      return null;
    }
    return new ProviderClass();
  }

  // Get all active provider instances
  getActiveProviders(serviceType = 'ltl') {
    return this.activeProviders
      .map(code => this.getProvider(code))
      .filter(provider => provider !== null);
  }

  // Get rates from multiple carriers in parallel
  async getRatesFromAll(requestData, specificCarriers = null) {
    const providers = specificCarriers 
      ? specificCarriers.map(code => this.getProvider(code)).filter(p => p)
      : this.getActiveProviders();

    console.log(`🚚 Fetching rates from ${providers.length} carriers:`, 
      providers.map(p => p.code).join(', '));

    // Run all carrier requests in parallel
    const promises = providers.map(provider => 
      provider.getRates(requestData)
        .then(result => {
          if (result) {
            console.log(`✅ ${provider.code} returned rate`);
          } else {
            console.log(`⚠️ ${provider.code} returned no rate`);
          }
          return result;
        })
        .catch(error => {
          console.error(`❌ ${provider.code} failed:`, error.message);
          return null; // Don't let one failure stop others
        })
    );

    const results = await Promise.all(promises);
    
    // Filter out nulls and return valid rates
    const validRates = results.filter(rate => rate !== null);
    console.log(`📊 Got ${validRates.length} valid rates out of ${providers.length} carriers`);
    
    return validRates;
  }
}

// Export singleton instance
module.exports = new GroundProviderFactory();
