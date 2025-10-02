// src/services/providers/GroundProviderFactory.js
const STGProvider = require('./ground/STGProvider');
const SEFLProvider = require('./ground/SEFLProvider');
const CarrierAccount = require('../../models/CarrierAccount');
const AAACooperProvider = require('./AAACooperProvider');
const TForceProvider = require('./TForceProvider');
const GlobalTranzProvider = require('./GlobalTranzProvider');

class GroundProviderFactory {
  constructor() {
    // Register all available providers
    this.providerClasses = {
      'STG': STGProvider,
      'SEFL': SEFLProvider,
      'AAA_COOPER': AAACooperProvider,
      'TFORCE': TForceProvider,
      'GLOBALTRANZ': GlobalTranzProvider,
      // Add more as you create them:
      // 'FEDEX_FREIGHT': FedExFreightProvider,
      // 'OLD_DOMINION': OldDominionProvider,
      // 'XPO': XPOProvider,
      // 'ESTES': EstesProvider,
      // 'RL_CARRIERS': RLCarriersProvider,
      // 'TFORCE': TForceProvider,
      // 'SAIA': SaiaProvider,
      // 'ABF': ABFProvider,
    };

    // Control which providers are active for company accounts
    this.activeProviders = process.env.ACTIVE_GROUND_CARRIERS 
      ? process.env.ACTIVE_GROUND_CARRIERS.split(',')
      : ['STG', 'SEFL', 'AAA_COOPER', 'TFORCE', 'GLOBALTRANZ'];
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

  // Get provider with customer account credentials
  getProviderWithAccount(carrierCode, accountData) {
    // Map carrier account codes to provider codes
    const carrierToProvider = {
      'SEFL': 'SEFL',
      'AAA_COOPER': 'AAA_COOPER',
      'FEDEX_FREIGHT': 'FEDEX_FREIGHT',
      'OLD_DOMINION': 'OLD_DOMINION',
      'TFORCE': 'TFORCE',
      'XPO': 'XPO',
      'ESTES': 'ESTES',
      'RL_CARRIERS': 'RL_CARRIERS',
      'SAIA': 'SAIA',
      'ABF': 'ABF',
      // Add more mappings
    };

    const providerCode = carrierToProvider[carrierCode];
    if (!providerCode) {
      console.warn(`No provider mapping for carrier ${carrierCode}`);
      return null;
    }

    const ProviderClass = this.providerClasses[providerCode];
    if (!ProviderClass) {
      console.warn(`Provider class ${providerCode} not implemented yet`);
      return null;
    }

    // Create provider instance with customer credentials
    const provider = new ProviderClass();
    
    // Override with customer account credentials
    if (accountData) {
      const creds = accountData.getDecryptedCredentials ? 
        accountData.getDecryptedCredentials() : accountData.apiCredentials;
      
      provider.accountNumber = accountData.accountNumber;
      provider.credentials = creds;
      provider.isCustomerAccount = true;
      provider.accountId = accountData._id;
    }
    
    return provider;
  }

  // Get all active provider instances for company accounts
  getActiveProviders(serviceType = 'ltl') {
    return this.activeProviders
      .map(code => this.getProvider(code))
      .filter(provider => provider !== null);
  }

  // Get rates from multiple carriers including customer accounts
  async getRatesWithCustomerAccounts(requestData, userId, companyId) {
    const allRates = [];
    
    // Step 1: Get customer's carrier accounts if provided
    if (userId && companyId) {
      try {
        const customerAccounts = await CarrierAccount.find({
          $or: [
            { userId: userId },
            { companyId: companyId }
          ],
          isActive: true,
          useForQuotes: true
        });

        console.log(`📋 Found ${customerAccounts.length} customer carrier accounts`);

        // Get rates from customer accounts
        for (const account of customerAccounts) {
          const provider = this.getProviderWithAccount(account.carrier, account);
          
          if (provider) {
            try {
              console.log(`🔄 Getting rates from customer's ${account.carrier} account`);
              const result = await provider.getRates(requestData);
              
              // Handle both single rates and arrays of rates
              const rates = Array.isArray(result) ? result : (result ? [result] : []);
              
              if (rates.length > 0) {
                // Add account info to each rate
                rates.forEach(rate => {
                  allRates.push({
                    ...rate,
                    accountType: 'customer',
                    accountId: account._id,
                    accountName: account.accountName || `Your ${account.carrier} Account`,
                    requiresMarkup: false  // Customer accounts don't get markup
                  });
                });
                
                console.log(`✅ Customer ${account.carrier} returned ${rates.length} rate(s)`);
                
                // Update usage stats
                account.quoteCount = (account.quoteCount || 0) + 1;
                account.lastUsed = new Date();
                await account.save();
              }
            } catch (error) {
              console.error(`❌ Customer ${account.carrier} account failed:`, error.message);
            }
          }
        }
      } catch (error) {
        console.error('❌ Error fetching customer accounts:', error.message);
      }
    }

    // Step 2: Get rates from company accounts (your negotiated rates)
    const companyProviders = this.getActiveProviders();
    console.log(`🚚 Fetching rates from ${companyProviders.length} company carriers:`, 
      companyProviders.map(p => p.code).join(', '));

    for (const provider of companyProviders) {
      try {
        const result = await provider.getRates(requestData);
        
        // Handle both single rates and arrays of rates
        const rates = Array.isArray(result) ? result : (result ? [result] : []);
        
        if (rates.length > 0) {
          // Add account info to each rate
          rates.forEach(rate => {
            allRates.push({
              ...rate,
              accountType: 'company',
              accountName: `${rate.carrierName || provider.name} (Our Rates)`,
              requiresMarkup: true  // Company accounts get markup
            });
          });
          
          console.log(`✅ ${provider.code} returned ${rates.length} company rate(s)`);
        }
      } catch (error) {
        console.error(`❌ Company ${provider.code} failed:`, error.message);
      }
    }

    console.log(`📊 Total rates collected: ${allRates.length} (Customer: ${allRates.filter(r => r.accountType === 'customer').length}, Company: ${allRates.filter(r => r.accountType === 'company').length})`);
    
    return allRates;
  }

  // Updated method to handle both single rates and arrays of rates
  async getRatesFromAll(requestData, specificCarriers = null) {
    const providers = specificCarriers 
      ? specificCarriers.map(code => this.getProvider(code)).filter(p => p)
      : this.getActiveProviders();

    console.log(`🚚 Fetching rates from ${providers.length} carriers:`, 
      providers.map(p => p.code).join(', '));

    const promises = providers.map(provider => 
      provider.getRates(requestData)
        .then(result => {
          // Handle both single rates and arrays of rates
          if (Array.isArray(result)) {
            console.log(`✅ ${provider.code} returned ${result.length} rates`);
            return result;
          } else if (result) {
            console.log(`✅ ${provider.code} returned 1 rate`);
            return [result]; // Wrap single rate in array
          } else {
            console.log(`⚠️ ${provider.code} returned no rate`);
            return [];
          }
        })
        .catch(error => {
          console.error(`❌ ${provider.code} failed:`, error.message);
          return [];
        })
    );

    const results = await Promise.all(promises);
    // Flatten the array of arrays
    const validRates = results.flat().filter(rate => rate !== null);
    
    console.log(`📊 Got ${validRates.length} valid rates total`);
    return validRates;
  }
}

// Export singleton instance
module.exports = new GroundProviderFactory();
