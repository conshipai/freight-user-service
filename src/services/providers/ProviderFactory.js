const FreightForceProvider = require('./FreightForceProvider');
const ECULinesProvider = require('./ECULinesProvider');
const RateProvider = require('../../models/RateProvider');

class ProviderFactory {
  static async createFromDatabase(providerId) {
    const config = await RateProvider.findById(providerId);
    if (!config) {
      throw new Error(`Provider ${providerId} not found`);
    }
    
    return ProviderFactory.create(config.toObject());
  }

  static create(config) {
    switch (config.code) {
      case 'FREIGHTFORCE':
        return new FreightForceProvider(config);
      
      case 'ECULINES':
        return new ECULinesProvider(config);
      
      // Add more providers as needed
      // case 'PELICARGO':
      //   return new PelicargoProvider(config);
      
      default:
        throw new Error(`Unknown provider: ${config.code}`);
    }
  }

  static async getAllActive() {
    const configs = await RateProvider.find({ status: 'active' });
    return configs.map(config => ProviderFactory.create(config.toObject()));
  }
}

module.exports = ProviderFactory;
