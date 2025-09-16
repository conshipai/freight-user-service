// src/services/providers/TForceProvider.js
const axios = require('axios');

class TForceProvider {
  constructor() {
    this.name = 'TForce Freight';
    this.code = 'TFORCE';
    
    // OAuth Configuration
    this.clientId = process.env.TFORCE_CLIENT_ID;
    this.clientSecret = process.env.TFORCE_CLIENT_SECRET;
    this.tokenUrl = 'https://login.microsoftonline.com/ca4f5969-c10f-40d4-8127-e74b691f95de/oauth2/v2.0/token';
    this.scope = 'https://tffproduction.onmicrosoft.com/04cc9749-dbe5-4914-b262-d866b907756b/.default';
    this.apiUrl = 'https://api.tforcefreight.com/rating';
    
    // Token storage
    this.accessToken = null;
    this.tokenExpiry = null;
    
    // Customer account support
    this.isCustomerAccount = false;
    this.accountNumber = null;
    this.credentials = null;
  }

  // Get OAuth token
  async getAccessToken() {
    try {
      // Check if using customer credentials
      const clientId = this.credentials?.apiKey || this.clientId;
      const clientSecret = this.credentials?.apiSecret || this.clientSecret;
      
      if (!clientId || !clientSecret) {
        console.warn('TForce credentials not configured');
        return null;
      }
      
      // Use cached token if still valid
      if (this.accessToken && this.tokenExpiry && new Date() < this.tokenExpiry) {
        return this.accessToken;
      }

      const response = await axios.post(
        this.tokenUrl,
        new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: clientId,
          client_secret: clientSecret,
          scope: this.scope
        }),
        {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        }
      );

      this.accessToken = response.data.access_token;
      this.tokenExpiry = new Date(Date.now() + (response.data.expires_in - 300) * 1000);
      
      return this.accessToken;
    } catch (error) {
      console.error('TForce OAuth failed:', error.response?.data || error.message);
      return null;
    }
  }

  // Main method matching your existing provider pattern
  async getRates(requestData) {
    try {
      console.log(`📦 ${this.code}: Getting rates...`);
      
      const token = await this.getAccessToken();
      if (!token) {
        console.log(`❌ ${this.code}: No OAuth token available`);
        return null;
      }
      
      const tforceRequest = this.buildRequest(requestData);
      const response = await this.callAPI(tforceRequest, token);
      
      if (!response) return null;
      
      return this.formatResponse(response);
    } catch (error) {
      console.error(`❌ ${this.code} error:`, error.message);
      return null;
    }
  }

  buildRequest(requestData) {
    const pickupDate = requestData.pickupDate 
      ? new Date(requestData.pickupDate)
      : new Date(Date.now() + 86400000);
    
    // Build commodities from requestData format
    const commodities = this.buildCommodities(requestData.commodities || []);
    
    const request = {
      requestOptions: {
        serviceCode: "308", // TForce Freight LTL
        pickupDate: pickupDate.toISOString().split('T')[0],
        type: "L",
        densityEligible: false,
        timeInTransit: true,
        quoteNumber: true,
        customerContext: "QUOTE"
      },
      shipFrom: {
        address: {
          city: requestData.origin?.city || "",
          stateProvinceCode: requestData.origin?.state || "",
          postalCode: requestData.origin?.zipCode || "",
          country: "US"
        }
      },
      shipTo: {
        address: {
          city: requestData.destination?.city || "",
          stateProvinceCode: requestData.destination?.state || "",
          postalCode: requestData.destination?.zipCode || "",
          country: "US"
        }
      },
      payment: {
        payer: {
          address: {
            city: requestData.origin?.city || "",
            stateProvinceCode: requestData.origin?.state || "",
            postalCode: requestData.origin?.zipCode || "",
            country: "US"
          }
        },
        billingCode: this.isCustomerAccount ? "10" : "30" // Prepaid or Third Party
      },
      commodities: commodities
    };

    // Add service options if accessorials present
    if (requestData.accessorials) {
      request.serviceOptions = this.buildServiceOptions(requestData.accessorials);
    }

    return request;
  }

  buildCommodities(commodities) {
    if (!commodities || commodities.length === 0) {
      return [{
        pieces: 1,
        weight: { weight: 100, weightUnit: "LBS" },
        packagingType: "PLT",
        class: "100",
        dimensions: { length: 48, width: 40, height: 40, unit: "IN" }
      }];
    }

    return commodities.map(item => ({
      pieces: parseInt(item.quantity) || 1,
      weight: {
        weight: parseFloat(item.weight) || 100,
        weightUnit: "LBS"
      },
      packagingType: this.mapPackagingType(item.unitType),
      class: String(item.freightClass || item.class || "100"),
      dimensions: {
        length: parseFloat(item.length) || 48,
        width: parseFloat(item.width) || 40,
        height: parseFloat(item.height) || 40,
        unit: "IN"
      }
    }));
  }

  mapPackagingType(unitType) {
    const mapping = {
      'Pallets': 'PLT',
      'Boxes': 'BOX',
      'Crates': 'CRT',
      'Bundles': 'BDL',
      'Rolls': 'ROL',
      'Bags': 'BAG',
      'Drums': 'DRM',
      'Totes': 'TNK'
    };
    return mapping[unitType] || 'PLT';
  }

  buildServiceOptions(accessorials) {
    const options = {
      pickup: [],
      delivery: []
    };

    if (accessorials.liftgatePickup) options.pickup.push('LIFO');
    if (accessorials.liftgateDelivery) options.delivery.push('LIFD');
    if (accessorials.residentialPickup) options.pickup.push('RESP');
    if (accessorials.residentialDelivery) options.delivery.push('RESD');
    if (accessorials.insidePickup) options.pickup.push('INPU');
    if (accessorials.insideDelivery) options.delivery.push('INDE');
    if (accessorials.limitedAccessPickup) options.pickup.push('LAPU');
    if (accessorials.limitedAccessDelivery) options.delivery.push('LADL');

    // Only return if we have options
    if (options.pickup.length > 0 || options.delivery.length > 0) {
      return options;
    }
    return undefined;
  }

  async callAPI(requestBody, token) {
    try {
      const clientId = this.credentials?.apiKey || this.clientId;
      
      const response = await axios.post(
        `${this.apiUrl}/getRate?api-version=v1`,
        requestBody,
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            'Ocp-Apim-Subscription-Key': clientId
          },
          timeout: 30000
        }
      );
      
      return response.data;
    } catch (error) {
      if (error.response?.status === 401) {
        this.accessToken = null;
        this.tokenExpiry = null;
      }
      console.error(`${this.code} API error:`, error.response?.data || error.message);
      return null;
    }
  }

  formatResponse(tforceResponse) {
    try {
      if (!tforceResponse?.detail?.[0]) {
        console.log(`${this.code}: No rates in response`);
        return null;
      }

      const detail = tforceResponse.detail[0];
      const rates = detail.rate || [];
      
      // Extract charges
      const grossCharge = rates.find(r => r.code === 'LND_GROSS')?.value || 0;
      const afterDiscount = rates.find(r => r.code === 'AFTR_DSCNT')?.value || 0;
      const fuelSurcharge = rates.find(r => r.code === 'FUEL_SUR')?.value || 0;
      
      // Calculate accessorials
      let accessorialTotal = 0;
      const accessorialCodes = ['INDE_INPU', 'LIFD', 'LIFO', 'RESP', 'RESD', 'LAPU_LADL'];
      rates.forEach(rate => {
        if (accessorialCodes.includes(rate.code)) {
          accessorialTotal += parseFloat(rate.value || 0);
        }
      });
      
      const totalCost = parseFloat(afterDiscount || grossCharge);
      const baseFreight = totalCost - fuelSurcharge - accessorialTotal;
      
      // Get transit time
      let transitDays = 5; // default
      if (detail.timeInTransit?.value) {
        transitDays = parseInt(detail.timeInTransit.value);
      }
      
      // Return in your standard format
      return {
        provider: this.code,
        carrierName: this.name,
        service: detail.service?.description || 'LTL Standard',
        
        // Match your existing format
        baseFreight: baseFreight,
        fuelSurcharge: fuelSurcharge,
        accessorialCharges: accessorialTotal,
        totalCost: totalCost,
        
        transitDays: transitDays,
        guaranteed: false,
        
        // Additional API response data
        quoteNumber: tforceResponse.summary?.quoteNumber,
        
        // Metadata
        accountType: this.isCustomerAccount ? 'customer' : 'company',
        requiresMarkup: !this.isCustomerAccount
      };
      
    } catch (error) {
      console.error(`${this.code}: Error formatting response:`, error);
      return null;
    }
  }
}

module.exports = TForceProvider;
