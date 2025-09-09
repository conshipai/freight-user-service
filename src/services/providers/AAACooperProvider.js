// src/services/providers/ground/AAACooperProvider.js
const BaseGroundProvider = require('./BaseGroundProvider');
const axios = require('axios');

class AAACooperProvider extends BaseGroundProvider {
  constructor() {
    super('AAA Cooper Transportation', 'AAA_COOPER');
    
    // Configuration from environment
    this.baseUrl = process.env.AAACT_BASE_URL || 'https://www.aaacooper.com/web-services';
    this.apiToken = process.env.AAACT_API_TOKEN;
    this.accountNumber = process.env.AAACT_ACCOUNT_NUMBER;
    
    // Create axios instance with default headers
    this.http = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
      headers: {
        'Authorization': `Bearer ${this.apiToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });
  }

  async getRates(requestData) {
    try {
      // Skip if no token configured
      if (!this.apiToken) {
        console.warn('⚠️ AAA Cooper: Missing API token, skipping');
        return null;
      }

      console.log('🚚 AAA Cooper: Fetching rates...');

      const payload = this.buildRequest(requestData);
      console.log('📤 AAA Cooper request:', JSON.stringify(payload, null, 2));

      const { data } = await this.http.post('/rate-estimate', payload);
      console.log('📥 AAA Cooper response:', JSON.stringify(data, null, 2));

      return this.parseResponse(data);
      
    } catch (error) {
      if (error.response) {
        console.error('❌ AAA Cooper API error:', error.response.status, error.response.data);
        
        // Handle specific error codes
        if (error.response.status === 401) {
          console.error('   Token may be expired or invalid');
        } else if (error.response.status === 422) {
          console.error('   Invalid request data (check class/weight/zip)');
        }
      } else {
        console.error('❌ AAA Cooper network error:', error.message);
      }
      
      return this.logError(error, 'getRates');
    }
  }

  buildRequest(requestData) {
    // Extract origin and destination
    const origin = requestData.origin || {};
    const destination = requestData.destination || {};
    
    // Parse pickup date
    const pickupDate = requestData.pickupDate 
      ? new Date(requestData.pickupDate).toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0];
    
    // Build commodities array
    const commodities = this.buildCommodities(requestData.commodities || []);
    
    // Map accessorials to AAA Cooper codes
    const accessorials = this.mapAccessorials(requestData.accessorials || {});
    
    // Build the request according to AAA Cooper's contract
    const request = {
      accountNumber: this.accountNumber || 'DEFAULT',
      paymentTerms: 'Prepaid', // or 'Collect', 'ThirdParty' based on your needs
      shipDate: pickupDate,
      origin: {
        zip: String(origin.zipCode || ''),
        city: origin.city || '',
        state: origin.state || ''
      },
      destination: {
        zip: String(destination.zipCode || ''),
        city: destination.city || '',
        state: destination.state || ''
      },
      commodities: commodities,
      accessorials: accessorials
    };

    // Add insurance if needed
    if (requestData.insurance) {
      request.insurance = {
        fullValueCoverage: requestData.insurance.requested || false,
        declaredValue: requestData.insurance.value || 0
      };
    }

    return request;
  }

  buildCommodities(items) {
    return items.map((item, index) => {
      // Calculate class if not provided
      let freightClass = item.class;
      if (!freightClass && item.nmfc) {
        freightClass = this.getClassFromNMFC(item.nmfc);
      } else if (!freightClass) {
        // Calculate based on density
        const density = this.calculateDensity(
          item.weight,
          item.length || 48,
          item.width || 40,
          item.height || 40
        );
        freightClass = this.getFreightClass(density);
      }

      return {
        class: parseInt(freightClass) || 85,
        weightLbs: Math.ceil(item.weight * (item.quantity || 1)),
        nmfcItem: item.nmfc || undefined,
        nmfcSub: item.nmfcSub || undefined,
        pieces: item.quantity || 1,
        dimensionsIn: {
          l: Math.ceil(item.length || 48),
          w: Math.ceil(item.width || 40),
          h: Math.ceil(item.height || 40)
        },
        stackable: item.stackable !== false,
        hazmat: this.buildHazmat(item),
        description: item.description || 'General Freight'
      };
    });
  }

  buildHazmat(item) {
    if (!item.hazmat) {
      return { isHazmat: false };
    }

    return {
      isHazmat: true,
      unNumber: item.unNumber || undefined,
      hazmatClass: item.hazmatClass || undefined,
      packingGroup: item.packingGroup || undefined
    };
  }

  mapAccessorials(accessorials) {
    const mapped = [];
    
    // Map common accessorials to AAA Cooper codes
    // These codes should match AAA Cooper's API documentation
    const mappings = {
      liftgatePickup: 'LiftgatePickup',
      liftgateDelivery: 'LiftgateDelivery',
      residentialPickup: 'ResidentialPickup',
      residentialDelivery: 'ResidentialDelivery',
      insideDelivery: 'InsideDelivery',
      insidePickup: 'InsidePickup',
      limitedAccessPickup: 'LimitedAccessPickup',
      limitedAccessDelivery: 'LimitedAccessDelivery',
      appointmentPickup: 'AppointmentPickup',
      appointmentDelivery: 'AppointmentDelivery',
      protectFromFreeze: 'ProtectFromFreeze'
    };

    Object.keys(accessorials).forEach(key => {
      if (accessorials[key] && mappings[key]) {
        mapped.push(mappings[key]);
      }
    });

    return mapped;
  }

  parseResponse(data) {
    // Handle error response
    if (data.status === 'ERROR' || data.error) {
      throw new Error(data.message || data.error || 'AAA Cooper quote failed');
    }

    // Extract pricing components
    const charges = data.charges || {};
    const baseFreight = parseFloat(charges.base || 0);
    const fuelSurcharge = parseFloat(charges.fuelSurcharge || 0);
    
    // Calculate accessorials total
    let accessorialTotal = 0;
    if (charges.accessorials && Array.isArray(charges.accessorials)) {
      accessorialTotal = charges.accessorials.reduce((sum, acc) => {
        return sum + parseFloat(acc.amount || 0);
      }, 0);
    }
    
    // Use API's total or calculate
    const totalCost = parseFloat(charges.total || (baseFreight + fuelSurcharge + accessorialTotal));
    
    // Extract transit information
    const transitDays = parseInt(data.transitDays) || 3;
    const pickupDate = data.pickupEarliest || null;
    const deliveryDate = data.deliveryEstimate || null;
    
    console.log('💰 AAA Cooper Pricing:');
    console.log(`   Base Freight: $${baseFreight.toFixed(2)}`);
    console.log(`   Fuel Surcharge: $${fuelSurcharge.toFixed(2)}`);
    console.log(`   Accessorials: $${accessorialTotal.toFixed(2)}`);
    console.log(`   Total: $${totalCost.toFixed(2)}`);
    console.log(`   Transit: ${transitDays} days`);

    // Return in standardized format
    return this.formatStandardResponse({
      service: data.service || 'LTL Standard',
      baseFreight: baseFreight,
      fuelSurcharge: fuelSurcharge,
      accessorialCharges: accessorialTotal,
      totalCost: totalCost,
      transitDays: transitDays,
      guaranteed: false,
      quoteId: data.quoteId || `AAACT-${Date.now()}`,
      validUntil: data.validUntil || new Date(Date.now() + 24 * 60 * 60 * 1000),
      pickupDate: pickupDate,
      deliveryDate: deliveryDate,
      notes: data.notes || []
    });
  }

  // Helper to map NMFC to class (you can expand this mapping)
  getClassFromNMFC(nmfc) {
    const nmfcMappings = {
      '100240': 85,
      '100110': 70,
      '100130': 65,
      // Add more NMFC to class mappings as needed
    };
    
    return nmfcMappings[nmfc] || 85; // Default to class 85
  }

  // Optional: Get transit time separately if AAA Cooper provides this endpoint
  async getTransitTime(origin, destination) {
    try {
      const response = await this.http.post('/transit-time', {
        originZip: origin,
        destinationZip: destination
      });
      
      return response.data.transitDays || 3;
    } catch (error) {
      console.warn('Could not fetch transit time:', error.message);
      return 3; // Default transit time
    }
  }

  // Optional: Validate account credentials
  async validateAccount() {
    try {
      // Make a simple test request to validate the token
      const testRequest = this.buildRequest({
        origin: { zipCode: '30301', city: 'Atlanta', state: 'GA' },
        destination: { zipCode: '10001', city: 'New York', state: 'NY' },
        pickupDate: new Date(),
        commodities: [{
          quantity: 1,
          weight: 100,
          length: 48,
          width: 40,
          height: 40,
          description: 'Test validation'
        }]
      });

      const response = await this.http.post('/rate-estimate', testRequest);
      
      if (response.data && response.data.status !== 'ERROR') {
        console.log('✅ AAA Cooper account validated successfully');
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('❌ AAA Cooper account validation failed:', error.message);
      return false;
    }
  }
}

module.exports = AAACooperProvider;
