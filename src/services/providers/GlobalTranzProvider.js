// src/services/providers/GlobalTranzProvider.js
const BaseGroundProvider = require('./ground/BaseGroundProvider');
const axios = require('axios');

class GlobalTranzProvider extends BaseGroundProvider {
  constructor() {
    super('GlobalTranz', 'GLOBALTRANZ');
    
    this.baseUrl = process.env.GLOBALTRANZ_API_URL || 'https://api.gtzintegrate.com';
    this.accessKey = process.env.GLOBALTRANZ_ACCESS_KEY;
    this.username = process.env.GLOBALTRANZ_USERNAME;
    this.password = process.env.GLOBALTRANZ_PASSWORD;
    
    // Create axios instance with basic auth
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${Buffer.from(`${this.username}:${this.password}`).toString('base64')}`
      }
    });
  }

  async getRates(requestData) {
    try {
      if (!this.accessKey || !this.username || !this.password) {
        console.warn('⚠️ GlobalTranz: Missing credentials, skipping');
        return null;
      }

      console.log('🚚 GlobalTranz: Fetching rates...');

      // Build the request
      const gtzRequest = this.buildRequest(requestData);
      console.log('📤 GlobalTranz request:', JSON.stringify(gtzRequest, null, 2));

      // Call the Rate V2 API for all carrier rates
      const response = await this.client.post('/RateV2', gtzRequest, {
        params: {
          accessKey: this.accessKey
        }
      });

      console.log('📥 GlobalTranz response received');

      // Parse and return the best rate
      return this.parseResponse(response.data, requestData);
      
    } catch (error) {
      console.error('❌ GlobalTranz error:', error.response?.data || error.message);
      return this.logError(error, 'getRates');
    }
  }

  buildRequest(requestData) {
    // Calculate total weight
    const totalWeight = (requestData.commodities || []).reduce((sum, item) => {
      return sum + ((item.quantity || 1) * (item.weight || 0));
    }, 0);

    // Build items array
    const items = (requestData.commodities || []).map(item => ({
      itemClass: item.freightClass || item.nmfcClass || item.calculatedClass || '100',
      weight: Math.ceil(item.weight || 0),
      pieces: parseInt(item.quantity || 1),
      length: Math.ceil(item.length || 48),
      width: Math.ceil(item.width || 40),
      height: Math.ceil(item.height || 40),
      description: item.description || 'General Freight',
      nmfc: item.nmfc || '',
      hazmat: item.hazmat || false
    }));

    // Build the request object
    return {
      originZip: requestData.origin?.zipCode || '',
      originCity: requestData.origin?.city || '',
      originState: requestData.origin?.state || '',
      originCountry: 'US',
      
      destinationZip: requestData.destination?.zipCode || '',
      destinationCity: requestData.destination?.city || '',
      destinationState: requestData.destination?.state || '',
      destinationCountry: 'US',
      
      pickupDate: requestData.pickupDate || new Date().toISOString().split('T')[0],
      
      items: items,
      
      // Accessorials
      liftgateOrigin: requestData.accessorials?.liftgatePickup || false,
      liftgateDestination: requestData.accessorials?.liftgateDelivery || false,
      residentialOrigin: requestData.accessorials?.residentialPickup || false,
      residentialDestination: requestData.accessorials?.residentialDelivery || false,
      insidePickup: requestData.accessorials?.insidePickup || false,
      insideDelivery: requestData.accessorials?.insideDelivery || false,
      limitedAccessOrigin: requestData.accessorials?.limitedAccessPickup || false,
      limitedAccessDestination: requestData.accessorials?.limitedAccessDelivery || false,
      
      // Optional parameters
      linearFeet: null,
      totalCube: null
    };
  }

  parseResponse(response, requestData) {
    // GlobalTranz returns an array of quotes
    const quotes = response.quotes || response || [];
    
    if (!Array.isArray(quotes) || quotes.length === 0) {
      console.log('⚠️ GlobalTranz: No quotes in response');
      return null;
    }

    // Find the best quote (you can adjust this logic)
    // For now, let's take the cheapest one
    const bestQuote = quotes.reduce((best, current) => {
      const currentTotal = parseFloat(current.totalAmount || current.total || 0);
      const bestTotal = parseFloat(best.totalAmount || best.total || 0);
      return currentTotal < bestTotal ? current : best;
    });

    console.log(`💰 GlobalTranz: Found ${quotes.length} quotes, selected ${bestQuote.carrierName}`);

    // Parse the pricing
    const baseFreight = parseFloat(bestQuote.freightCharge || bestQuote.linehaul || 0);
    const fuelSurcharge = parseFloat(bestQuote.fuelCharge || bestQuote.fuel || 0);
    const accessorialTotal = parseFloat(bestQuote.accessorialCharge || bestQuote.accessorials || 0);
    const totalCost = parseFloat(bestQuote.totalAmount || bestQuote.total || 0);
    
    const transitDays = parseInt(bestQuote.transitDays || bestQuote.estimatedTransitDays || 3);

    console.log('💰 GlobalTranz Pricing:');
    console.log(`   Carrier: ${bestQuote.carrierName || 'Unknown'}`);
    console.log(`   Base Freight: $${baseFreight.toFixed(2)}`);
    console.log(`   Fuel Surcharge: $${fuelSurcharge.toFixed(2)}`);
    console.log(`   Accessorials: $${accessorialTotal.toFixed(2)}`);
    console.log(`   Total: $${totalCost.toFixed(2)}`);
    console.log(`   Transit: ${transitDays} days`);

    // Return in standardized format
    return this.formatStandardResponse({
      service: bestQuote.service || 'LTL Standard',
      baseFreight: baseFreight,
      fuelSurcharge: fuelSurcharge,
      accessorialCharges: accessorialTotal,
      totalCost: totalCost,
      transitDays: transitDays,
      guaranteed: bestQuote.guaranteed || false,
      quoteId: bestQuote.quoteId || `GTZ-${Date.now()}`,
      validUntil: new Date(Date.now() + 24 * 60 * 60 * 1000),
      
      // Additional GlobalTranz specific data
      carrierName: bestQuote.carrierName,
      carrierCode: bestQuote.carrierCode || bestQuote.scac,
      serviceType: bestQuote.serviceType,
      gtzQuoteId: bestQuote.quoteId  // Store for booking later
    });
  }

  // Method to book a shipment (for future use)
  async bookShipment(quoteId, shipmentDetails) {
    try {
      const response = await this.client.post('/Shipment', {
        quoteId: quoteId,
        ...shipmentDetails
      }, {
        params: {
          accessKey: this.accessKey
        }
      });
      
      return {
        success: true,
        bolNumber: response.data.bolNumber,
        orderNumber: response.data.orderNumber,
        ...response.data
      };
    } catch (error) {
      console.error('❌ GlobalTranz booking error:', error.response?.data || error.message);
      throw error;
    }
  }

  // Method to track shipment (for future use)
  async trackShipment(bolNumber, destinationZip) {
    try {
      const response = await this.client.get('/Tracking', {
        params: {
          accessKey: this.accessKey,
          bolNumber: bolNumber,
          destinationZip: destinationZip
        }
      });
      
      return response.data;
    } catch (error) {
      console.error('❌ GlobalTranz tracking error:', error.response?.data || error.message);
      throw error;
    }
  }
}

module.exports = GlobalTranzProvider;
