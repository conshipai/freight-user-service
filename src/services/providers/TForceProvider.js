// src/services/providers/TForceProvider.js
const axios = require('axios');

class TForceProvider {
  constructor(config = {}) {
    // OAuth Configuration
    this.clientId = config.clientId || process.env.TFORCE_CLIENT_ID;
    this.clientSecret = config.clientSecret || process.env.TFORCE_CLIENT_SECRET;
    this.tokenUrl = process.env.TFORCE_TOKEN_URL;
    this.scope = process.env.TFORCE_SCOPE;
    this.apiUrl = process.env.TFORCE_API_URL || 'https://api.tforcefreight.com/rating';
    
    // Token storage
    this.accessToken = null;
    this.tokenExpiry = null;
    
    console.log('🚚 TForce Provider initialized (OAuth)');
    console.log('   - Client ID:', this.clientId ? 'Configured' : 'MISSING!');
    console.log('   - Client Secret:', this.clientSecret ? 'Configured' : 'MISSING!');
  }

  // Get OAuth token
  async getAccessToken() {
    try {
      // Check if we have a valid token
      if (this.accessToken && this.tokenExpiry && new Date() < this.tokenExpiry) {
        console.log('✅ Using cached OAuth token');
        return this.accessToken;
      }

      console.log('🔑 Getting new OAuth token from TForce...');

      // Request new token using client credentials flow
      const response = await axios.post(
        this.tokenUrl,
        new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: this.clientId,
          client_secret: this.clientSecret,
          scope: this.scope
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );

      // Store the token
      this.accessToken = response.data.access_token;
      // Set expiry to 5 minutes before actual expiry for safety
      const expiresIn = response.data.expires_in || 3600;
      this.tokenExpiry = new Date(Date.now() + (expiresIn - 300) * 1000);

      console.log('✅ Got OAuth token, expires at:', this.tokenExpiry.toISOString());
      return this.accessToken;

    } catch (error) {
      console.error('❌ Failed to get OAuth token:', error.response?.data || error.message);
      throw new Error('TForce OAuth authentication failed');
    }
  }

  // Main method - this gets called when your system needs a quote
  async getRates(quoteRequest) {
    try {
      console.log('📦 TForce getRates called');

      // Get OAuth token first
      const token = await this.getAccessToken();

      // Build the request in TForce format
      const tforceRequest = this.buildRequest(quoteRequest);
      
      // Make the API call with OAuth token
      const response = await this.callAPI(tforceRequest, token);
      
      // Format the response for your system
      return this.formatResponse(response, quoteRequest);
      
    } catch (error) {
      console.error('❌ TForce API error:', error.message);
      return null;
    }
  }

  // Build request in TForce's format (same as before)
  buildRequest(quoteRequest) {
    const pickupDate = quoteRequest.pickupDate 
      ? new Date(quoteRequest.pickupDate)
      : new Date(Date.now() + 24 * 60 * 60 * 1000);
    
    const pickupDateStr = pickupDate.toISOString().split('T')[0];

    const request = {
      requestOptions: {
        serviceCode: "308", // TForce Freight LTL
        pickupDate: pickupDateStr,
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
          postalCode: quoteRequest.origin?.zipCode || "",
          country: "US"
        }
      },
      
      shipTo: {
        address: {
          city: quoteRequest.destination?.city || "",
          stateProvinceCode: quoteRequest.destination?.state || "",
          postalCode: quoteRequest.destination?.zipCode || "",
          country: "US"
        }
      },
      
      payment: {
        payer: {
          address: {
            city: quoteRequest.origin?.city || "",
            stateProvinceCode: quoteRequest.origin?.state || "",
            postalCode: quoteRequest.origin?.zipCode || "",
            country: "US"
          }
        },
        billingCode: "10" // Prepaid
      },
      
      commodities: this.buildCommodities(quoteRequest.commodities || [])
    };

    if (quoteRequest.accessorials) {
      request.serviceOptions = this.buildServiceOptions(quoteRequest.accessorials);
    }

    return request;
  }

  // Convert your commodities to TForce format
  buildCommodities(commodities) {
    if (!commodities || commodities.length === 0) {
      // Default commodity if none provided
      return [{
        pieces: 1,
        weight: { weight: 100, weightUnit: "LBS" },
        packagingType: "PLT",
        class: "100",
        dimensions: {
          length: 48,
          width: 40,
          height: 40,
          unit: "IN"
        }
      }];
    }

    return commodities.map(item => ({
      pieces: item.quantity || 1,
      weight: {
        weight: item.weight || 100,
        weightUnit: "LBS"
      },
      packagingType: this.mapPackagingType(item.unitType),
      class: String(item.freightClass || "100"),
      dimensions: {
        length: item.length || 48,
        width: item.width || 40,
        height: item.height || 40,
        unit: "IN"
      }
    }));
  }

  // Map packaging types
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

  // Build service options
  buildServiceOptions(accessorials) {
    const options = {
      pickup: [],
      delivery: []
    };

    if (accessorials.includes('liftgate_pickup')) options.pickup.push('LIFO');
    if (accessorials.includes('liftgate_delivery')) options.delivery.push('LIFD');
    if (accessorials.includes('residential_pickup')) options.pickup.push('RESP');
    if (accessorials.includes('residential_delivery')) options.delivery.push('RESD');
    if (accessorials.includes('inside_pickup')) options.pickup.push('INPU');
    if (accessorials.includes('inside_delivery')) options.delivery.push('INDE');

    return options;
  }

  // Make the actual API call with OAuth
  async callAPI(requestBody, token) {
    try {
      console.log('🔌 Calling TForce API with OAuth token...');
      
      const response = await axios.post(
        `${this.apiUrl}/getRate?api-version=v1`,
        requestBody,
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            // Some TForce endpoints also want this header
            'Ocp-Apim-Subscription-Key': this.clientId
          },
          timeout: 30000
        }
      );

      console.log('✅ TForce API responded successfully');
      return response.data;
      
    } catch (error) {
      if (error.response) {
        console.error('❌ TForce API Error:', {
          status: error.response.status,
          statusText: error.response.statusText,
          data: error.response.data
        });
        
        // If 401, clear token so we get a new one next time
        if (error.response.status === 401) {
          this.accessToken = null;
          this.tokenExpiry = null;
        }
      } else {
        console.error('❌ TForce request failed:', error.message);
      }
      throw error;
    }
  }

  // Format response (same as before)
  formatResponse(tforceResponse, originalRequest) {
    try {
      if (!tforceResponse || !tforceResponse.detail || tforceResponse.detail.length === 0) {
        console.log('⚠️ No rates in TForce response');
        return null;
      }

      const detail = tforceResponse.detail[0];
      
      // Extract charges
      const grossCharge = detail.rate?.find(r => r.code === 'LND_GROSS');
      const discountedAmount = detail.rate?.find(r => r.code === 'AFTR_DSCNT');
      const fuelSurcharge = detail.rate?.find(r => r.code === 'FUEL_SUR');
      
      const totalCost = parseFloat(discountedAmount?.value || grossCharge?.value || 0);
      const fuel = parseFloat(fuelSurcharge?.value || 0);
      
      const transitDays = parseInt(detail.timeInTransit?.value || 3);

      return {
        provider: 'TFORCE',
        carrierName: 'TForce Freight',
        service: detail.service?.description || 'LTL Standard',
        
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
          rawResponse: tforceResponse
        },
        
        status: 'completed',
        expiresAt: this.calculateValidUntil()
      };
      
    } catch (error) {
      console.error('❌ Error formatting TForce response:', error);
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
