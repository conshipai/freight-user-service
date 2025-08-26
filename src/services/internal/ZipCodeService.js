// src/services/internal/ZipCodeService.js
const { ZipCodeAirport } = require('../../models');

class ZipCodeService {
  static async findOriginAirport(zipCode) {
    try {
      const result = await ZipCodeAirport.findOne({ 
        zipCode: zipCode,
        isActive: true 
      });
      return result;
    } catch (error) {
      console.error('Error finding airport for ZIP:', error);
      return null;
    }
  }

  static async findZipCodesByAirport(airportCode) {
    try {
      const results = await ZipCodeAirport.find({ 
        airportCode: airportCode.toUpperCase(),
        isActive: true 
      });
      return results.map(r => r.zipCode);
    } catch (error) {
      console.error('Error finding ZIP codes for airport:', error);
      return [];
    }
  }

  static async getCoverageStats() {
    try {
      const totalZips = await ZipCodeAirport.countDocuments({ isActive: true });
      const uniqueAirports = await ZipCodeAirport.distinct('airportCode', { isActive: true });
      
      return {
        totalZipCodes: totalZips,
        totalAirports: uniqueAirports.length,
        airports: uniqueAirports
      };
    } catch (error) {
      console.error('Error getting coverage stats:', error);
      return null;
    }
  }
}

module.exports = ZipCodeService;
