// src/services/providers/TForceProvider.js
const axios = require('axios');

class TForceProvider {
  constructor(config = {}) {
    // OAuth Configuration
    this.clientId = config.clientId || process.env.TFORCE_CLIENT_ID;
    this.clientSecret = config.clientSecret || process.env.TFORCE_CLIENT_SECRET;
    this.tokenUrl = 'https://login.microsoftonline.com/ca4f5969-c10f-40d4-8127-e74b691f95de/oauth2/v2.0/token';
    this.scope = 'https://tffproduction.onmicrosoft.com/04cc9749-dbe5-4914-b262-d866b907756b/.default';
    this.apiUrl = 'https://api.tforcefreight.com/rating';
    
    // Token storage
    this.accessToken = null;
    this.tokenExpiry = null;
    
    console.log('🚚 TForce Provider initialized');
  }

  // Get OAuth token (with caching)
  async getAccessToken() {
    try {
      // Use cached token if still valid
      if (this.accessToken && this.tokenExpiry && new Date() < this.tokenExpiry) {
        return this.accessToken;
      }

      // Get new token
      const response = await axios.post(
        this.tokenUrl,
        new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: this.clientId,
          client_secret: this.clientSecret,
          scope: this.scope
        }),
        {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        }
      );

      // Cache the token
      this.accessToken = response.data.access_token;
      this.tokenExpiry = new Date(Date.now() + (response.data.expires_in - 300) * 1000);
      
      return this.accessToken;
    } catch (error) {
      console.error('TForce OAuth failed:', error.response?.data || error.message);
      throw new Error('TForce authentication failed');
    }
  }

  // Main method - gets rates
  async getRates(quoteRequest) {
    try {
      const token = await this.getAccessToken();
      const tforceRequest = this.buildRequest(quoteRequest);
      const response = await this.callAPI(tforceRequest, token);
      return this.formatResponse(response);
    } catch (error) {
      console.error('TForce getRates error:', error.message);
      return null;
    }
  }

  // Build TForce request format
  buildRequest(quoteRequest) {
    const pickupDate = quoteRequest.pickupDate 
      ? new Date(quoteRequest.pickupDate)
      : new Date(Date.now() + 86400000);
    
    return {
      requestOptions: {
        serviceCode: "308",
        pickupDate: pickupDate.toISOString().split('T')[0],
        type: "L",
        densityEligible: false,
        timeInTransit: true,
        quoteNumber: true,
        customerContext: quoteRequest.requestId || "QUOTE"
      },
      shipFrom: {
        address: {
          city: quoteRequest.origin?.city || "",
          stateProvinceCode: quoteRequest.origin?.state || "",
          postalCode: quoteRequest.origin?.zipCode || quoteRequest.origin?.zip || "",
          country: "US"
        }
      },
      shipTo: {
        address: {
          city: quoteRequest.destination?.city || quoteRequest.destCity || "",
          stateProvinceCode: quoteRequest.destination?.state || quoteRequest.destState || "",
          postalCode: quoteRequest.destination?.zipCode || quoteRequest.destination?.zip || quoteRequest.destZip || "",
          country: "US"
        }
      },
      payment: {
        payer: {
          address: {
            city: quoteRequest.origin?.city || "",
            stateProvinceCode: quoteRequest.origin?.state || "",
            postalCode: quoteRequest.origin?.zipCode || quoteRequest.origin?.zip || "",
            country: "US"
          }
        },
        billingCode: "10"
      },
      commodities: this.buildCommodities(quoteRequest.commodities || [])
    };
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
      pieces: item.quantity || 1,
      weight: {
        weight: item.weight || 100,
        weightUnit: "LBS"
      },
      packagingType: this.mapPackagingType(item.unitType),
      class: String(item.freightClass || item.class || "100"),
      dimensions: {
        length: item.length || 48,
        width: item.width || 40,
        height: item.height || 40,
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
      'Drums': 'DRM'
    };
    return mapping[unitType] || 'PLT';
  }

  async callAPI(requestBody, token) {
    try {
      const response = await axios.post(
        `${this.apiUrl}/getRate?api-version=v1`,
        requestBody,
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            'Ocp-Apim-Subscription-Key': this.clientId
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
      throw error;
    }
  }

  formatResponse(tforceResponse) {
    try {
      if (!tforceResponse?.detail?.[0]) return null;

      const detail = tforceResponse.detail[0];
      const rates = detail.rate || [];
      
      // Extract costs
      const grossCharge = rates.find(r => r.code === 'LND_GROSS')?.value || 0;
      const afterDiscount = rates.find(r => r.code === 'AFTR_DSCNT')?.value || 0;
      const fuelSurcharge = rates.find(r => r.code === 'FUEL_SUR')?.value || 0;
      
      const totalCost = parseFloat(afterDiscount || grossCharge);
      const fuel = parseFloat(fuelSurcharge);
      
      // Get transit time (handle undefined)
      let transitDays = 5; // default
      if (detail.timeInTransit?.value) {
        transitDays = parseInt(detail.timeInTransit.value);
      }

      return {
        provider: 'TFORCE',
        carrierName: 'TForce Freight',
        carrierCode: 'TFORCE',
        service: detail.service?.description || 'LTL Standard',
        serviceType: 'ltl',
        
        costs: {
          baseFreight: totalCost - fuel,
          fuelSurcharge: fuel,
          accessorials: 0,
          totalCost: totalCost,
          currency: 'USD'
        },
        
        transit: {
          days: transitDays,
          businessDays: transitDays,
          estimatedDelivery: this.calculateDeliveryDate(transitDays),
          guaranteed: false
        },
        
        apiResponse: {
          quoteId: tforceResponse.summary?.quoteNumber,
          validUntil: this.calculateValidUntil(),
          responseTimeMs: 0
        },
        
        status: 'completed'
      };
    } catch (error) {
      console.error('Error formatting TForce response:', error);
      return null;
    }
  }

  calculateDeliveryDate(transitDays) {
    const date = new Date();
    date.setDate(date.getDate() + transitDays);
    if (date.getDay() === 0) date.setDate(date.getDate() + 1);
    if (date.getDay() === 6) date.setDate(date.getDate() + 2);
    return date;
  }

  calculateValidUntil() {
    const date = new Date();
    date.setDate(date.getDate() + 30);
    return date;
  }
}

module.exports = TForceProvider;
