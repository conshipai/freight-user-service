const BaseProvider = require('./BaseProvider');
const axios = require('axios');

class FreightForceProvider extends BaseProvider {
  constructor(config) {
    super(config);
    
    this.baseURL = config.apiConfig.baseUrl || 'https://dev-ffapi.freightforce.com';
    this.credentials = {
      username: config.apiConfig.username,
      password: config.apiConfig.password,
      contactEmail: config.apiConfig.email,
      accountId: config.apiConfig.accountId || '7805'
    };
    
    this.token = null;
    this.tokenExpiry = null;
    
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: this.timeout,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'FreightPlatform/1.0'
      }
    });
  }

  async authenticate() {
    try {
      // Try registration first (in case it's a new account)
      try {
        await this.client.post('/api/Auth/register', {
          accountId: this.credentials.accountId,
          username: this.credentials.username,
          password: this.credentials.password,
          contactEmail: this.credentials.contactEmail
        });
      } catch (regError) {
        // Registration might fail if already registered, that's OK
      }

      // Now authenticate
      const response = await this.client.post('/api/Auth/token', {
        username: this.credentials.username,
        password: this.credentials.password,
        contactEmail: this.credentials.contactEmail
      });

      this.token = response.data.token || response.data.access_token;
      this.tokenExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
      this.client.defaults.headers.common['Authorization'] = `Bearer ${this.token}`;
      
      return this.token;
    } catch (error) {
      throw new Error(`FreightForce auth failed: ${error.message}`);
    }
  }

  async ensureValidToken() {
    if (!this.token || (this.tokenExpiry && new Date() >= this.tokenExpiry)) {
      await this.authenticate();
    }
    return this.token;
  }

  async getQuote(request) {
    const { mode, origin, destination, cargo } = request;
    
    // FreightForce handles ground/pickup only
    if (mode !== 'road') {
      throw new Error('FreightForce only handles ground transportation');
    }

    await this.ensureValidToken();

    // Build FreightForce request
    const ffRequest = {
      rateType: "L",
      origin: origin.postalCode,
      originType: "Z",
      destination: destination.airportCode || destination.city,
      destinationType: destination.airportCode ? "T" : "C",
      weight: Math.ceil(cargo.weight),
      dimensions: cargo.pieces ? [{
        qty: cargo.pieces,
        weight: Math.ceil(cargo.weight / cargo.pieces),
        length: cargo.length || 24,
        width: cargo.width || 24,
        height: cargo.height || 24,
        description: cargo.description || "General Cargo"
      }] : [{
        qty: 1,
        weight: Math.ceil(cargo.weight),
        length: 24,
        width: 24,
        height: 24,
        description: cargo.description || "General Cargo"
      }]
    };

    const response = await this.executeWithRetry(async () => {
      return await this.client.post('/api/Quote', ffRequest);
    });

    return this.parseResponse(response.data, request);
  }

  parseResponse(data, originalRequest) {
    const freightCharge = parseFloat(data.freight_Charge) || 0;
    const fuelSurcharge = parseFloat(data.freight_FSC) || 0;
    const accessorials = parseFloat(data.accessorialTotal) || 0;
    const totalCost = freightCharge + fuelSurcharge + accessorials;

    // Apply markup
    const { markup, total: totalWithMarkup } = this.calculateMarkup(totalCost, 'road');
    
    // Apply additional fees
    const { fees, totalFees } = this.applyAdditionalFees(totalCost, 'road');
    
    const finalTotal = totalWithMarkup + totalFees;

    return {
      provider: this.name,
      providerCode: this.code,
      service: 'Ground Transportation',
      mode: 'road',
      costs: {
        freight: freightCharge,
        fuel: fuelSurcharge,
        security: 0,
        handling: accessorials,
        documentation: 0,
        other: [],
        totalCost: totalCost
      },
      markup: {
        percentage: this.markupSettings.road.percentage,
        amount: markup,
        totalMarkup: markup
      },
      additionalFees: fees,
      sellRates: {
        freight: freightCharge * (1 + this.markupSettings.road.percentage / 100),
        fuel: fuelSurcharge * (1 + this.markupSettings.road.percentage / 100),
        handling: accessorials * (1 + this.markupSettings.road.percentage / 100),
        additionalFees: totalFees,
        totalSell: finalTotal
      },
      transitTime: 1,
      validUntil: new Date(Date.now() + 24 * 60 * 60 * 1000),
      raw: data
    };
  }
}

module.exports = FreightForceProvider;
