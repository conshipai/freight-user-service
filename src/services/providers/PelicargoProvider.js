// src/services/providers/ECULinesProvider.js
const BaseProvider = require('./BaseProvider');
const https = require('https');

class ECULinesProvider extends BaseProvider {
  constructor(config) {
    super(config);
    this.baseURL = 'apim.ecuworldwide.com';
    this.apiKey = config.apiConfig.apiKey;
    this.accountId = config.apiConfig.accountId || '519222';
  }

  async makeRequest(path, data) {
    return new Promise((resolve, reject) => {
      const postData = JSON.stringify(data);
      
      const options = {
        hostname: this.baseURL,
        port: 443,
        path: path,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Ecuw-Api-Key': this.apiKey,
          'Content-Length': Buffer.byteLength(postData)
        }
      };

      const req = https.request(options, (res) => {
        let responseData = '';
        res.on('data', (chunk) => { responseData += chunk; });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(responseData);
            resolve({ status: res.statusCode, data: parsed });
          } catch (e) {
            reject(new Error(`Invalid JSON response`));
          }
        });
      });

      req.on('error', reject);
      req.setTimeout(30000, () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });
      
      req.write(postData);
      req.end();
    });
  }

  transformRequest(request) {
    return {
      weight: request.shipment.cargo.totalWeight || 100,
      volume: request.shipment.cargo.totalVolume || 1,
      poRUnCode: request.shipment.origin.portCode || 'USLAX',
      poDUnCode: request.shipment.destination.portCode || 'DEHAM',
      productType: 'LCL',
      accountId: parseInt(this.accountId),
      fromType: 'port',
      toType: 'port',
      isHazardousMaterial: request.hasDangerousGoods || false,
      currencyCode: 'USD'
    };
  }

  parseResponse(data) {
    const quotes = Array.isArray(data) ? data : [data];
    const bestQuote = quotes[0];
    
    if (!bestQuote) {
      throw new Error('No quotes returned from ECU Lines');
    }

    return {
      costs: {
        freight: parseFloat(bestQuote.rate) || 0,
        fuel: 0,
        screening: 0,
        handling: 0,
        documentation: 0,
        other: 0,
        totalCost: parseFloat(bestQuote.rate) || 0,
        currency: 'USD'
      },
      service: 'Ocean',
      serviceType: 'LCL',
      transitTime: bestQuote.transitTime || '30 days',
      validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      rawResponse: bestQuote
    };
  }

  async getQuote(request) {
    const startTime = Date.now();
    
    try {
      const ecuRequest = this.transformRequest(request);
      const response = await this.makeRequest('/quotations/v1/', ecuRequest);
      
      if (response.status !== 200) {
        throw new Error(`ECU Lines API error: ${response.status}`);
      }
      
      const result = this.parseResponse(response.data);
      result.responseTimeMs = Date.now() - startTime;
      
      return result;
    } catch (error) {
      throw new Error(`ECU Lines quote failed: ${error.message}`);
    }
  }
}

module.exports = ECULinesProvider;
