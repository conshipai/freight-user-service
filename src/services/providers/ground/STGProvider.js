// In src/services/providers/ground/STGProvider.js

const axios = require('axios');

class STGProvider extends BaseGroundProvider {
  constructor() {
    super('STG Logistics', 'STG');
    this.baseUrl = process.env.FREIGHTFORCE_API_URL || 'https://dev-ffapi.freightforce.com';
    this.username = process.env.FREIGHTFORCE_USERNAME;
    this.password = process.env.FREIGHTFORCE_PASSWORD;
    this.email = process.env.FREIGHTFORCE_EMAIL;
    this.accountId = process.env.FREIGHTFORCE_ACCOUNT;
    this.token = null;
    this.tokenExpiry = null;
  }

  async authenticate() {
    try {
      console.log('🔐 STG/FreightForce: Authenticating...');
      
      const response = await axios.post(`${this.baseUrl}/api/Auth/token`, {
        username: this.username,
        password: this.password,
        contactEmail: this.email
      });

      this.token = response.data.token || response.data.access_token;
      this.tokenExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
      
      console.log('✅ STG/FreightForce: Authenticated successfully');
      return this.token;
    } catch (error) {
      console.error('❌ STG/FreightForce Auth failed:', error.response?.data || error.message);
      throw error;
    }
  }

  async getRates(requestData) {
    try {
      // Check credentials
      if (!this.username || !this.password) {
        console.warn('⚠️ STG/FreightForce: Missing credentials, skipping');
        return null;
      }

      // Ensure we have valid token
      if (!this.token || !this.tokenExpiry || new Date() >= this.tokenExpiry) {
        await this.authenticate();
      }

      const payload = this.buildRequest(requestData);
      console.log('📤 STG/FreightForce request:', JSON.stringify(payload, null, 2));

      const response = await axios.post(`${this.baseUrl}/api/Quote`, payload, {
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json'
        }
      });

      console.log('📥 STG/FreightForce response:', JSON.stringify(response.data, null, 2));
      return this.parseResponse(response.data);

    } catch (error) {
      console.error('❌ STG/FreightForce error:', error.response?.data || error.message);
      return null;
    }
  }

  buildRequest(requestData) {
    // Use "N" for nationwide LTL service
    return {
      rateType: "N",
      origin: requestData.origin.zipCode,
      originType: "Z",
      destination: requestData.destination.zipCode,
      destinationType: "Z",
      weight: Math.ceil(
        requestData.commodities.reduce((total, item) => 
          total + (item.weight * item.quantity), 0
        )
      ),
      dimensions: requestData.commodities.map(item => ({
        qty: item.quantity,
        weight: Math.ceil(item.weight),
        length: Math.ceil(item.length),
        width: Math.ceil(item.width),
        height: Math.ceil(item.height),
        description: item.description || 'General Freight'
      }))
    };
  }

  parseResponse(data) {
    // Parse FreightForce response
    const baseFreight = parseFloat(data.freight_Charge) || 0;
    const fuelSurcharge = parseFloat(data.freight_FSC) || 0;
    const accessorials = parseFloat(data.accessorialTotal) || 0;
    const total = parseFloat(data.quoteRateTotal) || 0;

    return this.formatStandardResponse({
      service: 'Standard LTL',
      baseFreight: baseFreight,
      fuelSurcharge: fuelSurcharge,
      accessorialCharges: accessorials,
      transitDays: parseInt(data.transitTime) || 3,
      guaranteed: false,
      quoteId: data.quoteNumber,
      validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    });
  }
}

module.exports = STGProvider;
