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
        
        res.on('data', (chunk) => {
          responseData += chunk;
        });
        
        res.on('end', () => {
          try {
            const parsed = JSON.parse(responseData);
            resolve({ status: res.statusCode, data: parsed });
          } catch (e) {
            reject(new Error(`Invalid JSON response: ${responseData.substring(0, 200)}`));
          }
        });
      });

      req.on('error', reject);
      req.setTimeout(this.timeout, () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });
      
      req.write(postData);
      req.end();
    });
  }

  transformRequest(request) {
    const shipment = request.shipment;
    
    // ECU Lines expects weight in kg and volume in cbm
    const weight = shipment.cargo.totalWeightKg || 
                  (shipment.cargo.totalWeight * 0.453592) || 
                  100; // Default 100kg if not provided
    
    const volume = shipment.cargo.totalVolume || 1; // Default 1 cbm
    
    return {
      weight: weight,
      volume: volume,
      poRUnCode: shipment.origin.portCode || 'USLAX',
      poDUnCode: shipment.destination.portCode || 'DEHAM',
      productType: shipment.cargo.containerType || 'LCL',
      accountId: parseInt(this.accountId),
      fromType: 'port',
      toType: 'port',
      isHazardousMaterial: request.hasDangerousGoods || false,
      currencyCode: 'USD'
    };
  }

  parseResponse(data) {
    const quotes = Array.isArray(data) ? data : [data];
    const bestQuote = quotes[0]; // Take the first/best quote
    
    if (!bestQuote) {
      throw new Error('No quotes returned from ECU Lines');
    }

    const totalCost = parseFloat(bestQuote.rate) || 0;
    
    // Extract breakdown if available
    const breakdown = {
      freight: totalCost,
      fuel: 0,
      security: 0,
      handling: 0,
      documentation: 0,
      other: 0
    };
    
    // If quote has detailed charges, extract them
    if (bestQuote.quoteOfferDetails && Array.isArray(bestQuote.quoteOfferDetails)) {
      bestQuote.quoteOfferDetails.forEach(detail => {
        const amount = parseFloat(detail.amount) || 0;
        const chargeName = (detail.chargeName || '').toLowerCase();
        
        if (chargeName.includes('fuel')) {
          breakdown.fuel += amount;
        } else if (chargeName.includes('handling')) {
          breakdown.handling += amount;
        } else if (chargeName.includes('doc')) {
          breakdown.documentation += amount;
        } else {
          breakdown.other += amount;
        }
      });
    }

    return {
      costs: {
        ...breakdown,
        totalCost: totalCost,
        currency: 'USD'
      },
      service: 'Ocean',
      serviceType: bestQuote.productType || 'LCL',
      carrier: bestQuote.carrierName || 'ECU Lines',
      transitTime: `${bestQuote.transitTime || 30} days`,
      transitDays: bestQuote.transitTime || 30,
      validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days validity
      routing: {
        origin: bestQuote.poRName || shipment.origin.city,
        destination: bestQuote.poDName || shipment.destination.city
      },
      rawResponse: bestQuote
    };
  }

  async getQuote(request) {
    const startTime = Date.now();
    
    try {
      const ecuRequest = this.transformRequest(request);
      
      console.log(`    ECU Request: ${JSON.stringify(ecuRequest).substring(0, 200)}`);
      
      const response = await this.executeWithRetry(async () => {
        return await this.makeRequest('/quotations/v1/', ecuRequest);
      });
      
      if (response.status !== 200) {
        throw new Error(`ECU Lines API error: ${response.status} - ${JSON.stringify(response.data).substring(0, 200)}`);
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
