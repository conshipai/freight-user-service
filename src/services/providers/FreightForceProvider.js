// src/services/providers/FreightForceProvider.js
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
        'Content-Type': 'application/json'
      }
    });
  }

  async authenticate() {
    try {
      // Try registration first (in case new account)
      try {
        await this.client.post('/api/Auth/register', {
          accountId: this.credentials.accountId,
          username: this.credentials.username,
          password: this.credentials.password,
          contactEmail: this.credentials.contactEmail
        });
      } catch (regError) {
        // Already registered is fine
      }

      const response = await this.client.post('/api/Auth/token', {
        username: this.credentials.username,
        password: this.credentials.password,
        contactEmail: this.credentials.contactEmail
      });

      this.token = response.data.token || response.data.access_token;
      this.tokenExpiry = new Date(Date.now() + 60 * 60 * 1000);
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

  // 🔎 Helper: pick the class to send for FreightForce only
  pickFreightClass(piece) {
    // Prefer explicit override when flagged; otherwise calculated
    const raw =
      (piece?.useOverride && piece?.overrideClass) ? piece.overrideClass
      : (piece?.freightClass) ? piece.freightClass
      : (piece?.nmfcClass) ? piece.nmfcClass
      : piece?.calculatedClass;

    if (raw == null) return undefined;
    const v = String(raw).trim();
    return v.length ? v : undefined;
  }

  transformRequest(request) {
    // Calculate total weight in lbs
    const totalWeight = request.shipment.cargo.pieces.reduce(
      (sum, piece) => sum + ((Number(piece.weight) || 0) * (Number(piece.quantity) || 1)),
      0
    );

    // Map pieces and attach class ONLY for FreightForce
    const dims = request.shipment.cargo.pieces.map(piece => {
      const qty = Math.max(1, parseInt(piece.quantity, 10) || 1);
      const weight = Math.ceil(Number(piece.weight) || 0);
      const length = Math.ceil(Number(piece.length) || 24);
      const width  = Math.ceil(Number(piece.width)  || 24);
      const height = Math.ceil(Number(piece.height) || 24);

      const classToSend = this.pickFreightClass(piece);

      // Build the dimension object; include class fields only if present
      const dimObj = {
        qty,
        weight,
        length,
        width,
        height,
        description: piece.commodity || "General Cargo"
      };

      // Many APIs ignore unknown fields; adding both improves compatibility
      if (classToSend) {
        dimObj.freightClass = classToSend; // common field name
        dimObj.nmfcClass = classToSend;    // alternate; harmless if ignored
      }

      return dimObj;
    });

    return {
      rateType: "L",
      origin: request.shipment.origin.zipCode,
      originType: "Z",
      destination: request.shipment.origin.airport, // (kept as-is per your current logic)
      destinationType: "T",
      weight: Math.ceil(totalWeight),
      dimensions: dims
    };
  }

  parseResponse(apiResponse, originalRequest) {
    const freightCharge = parseFloat(apiResponse.freight_Charge) || 0;
    const fuelSurcharge = parseFloat(apiResponse.freight_FSC) || 0;
    const accessorials = parseFloat(apiResponse.accessorialTotal) || 0;
    const totalCost = parseFloat(apiResponse.quoteRateTotal) || 0;

    return {
      costs: {
        freight: freightCharge,
        fuel: fuelSurcharge,
        accessorials: accessorials,
        totalCost: totalCost,
        currency: 'USD'
      },
      service: 'Ground',
      serviceType: 'Door-to-Airport',
      transitTime: '1 day',
      transitDays: 1,
      validUntil: new Date(Date.now() + 24 * 60 * 60 * 1000),
      rawResponse: apiResponse
    };
  }

  async getQuote(request) {
    const startTime = Date.now();
    try {
      await this.ensureValidToken();
      const ffRequest = this.transformRequest(request);
      const response = await this.executeWithRetry(async () => {
        return await this.client.post('/api/Quote', ffRequest);
      });
      const result = this.parseResponse(response.data, request);
      result.responseTimeMs = Date.now() - startTime;
      return result;
    } catch (error) {
      throw new Error(`FreightForce quote failed: ${error.message}`);
    }
  }
}

module.exports = FreightForceProvider;
