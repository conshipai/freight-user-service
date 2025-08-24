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

  async getQuote(request) {
    const { mode, origin, destination, cargo } = request;
    
    // ECU Lines handles ocean freight only
    if (mode !== 'ocean') {
      throw new Error('ECU Lines only handles ocean freight');
    }

    const ecuRequest = {
      weight: cargo.weight || 100,
      volume: cargo.volume || 1,
      poRUnCode: origin.portCode || 'USLAX',
      poDUnCode: destination.portCode || 'DEHAM',
      productType: cargo.containerType || 'LCL',
      accountId: parseInt(this.accountId),
      fromType: 'port',
      toType: 'port',
      isHazardousMaterial: cargo.dangerousGoods || false,
      currencyCode: 'USD'
    };

    const response = await this.executeWithRetry(async () => {
      return await this.makeRequest('/quotations/v1/', ecuRequest);
    });

    if (response.status !== 200) {
      throw new Error(`ECU Lines API error: ${response.status}`);
    }

    return this.parseResponse(response.data, request);
  }

  parseResponse(data, originalRequest) {
    const quotes = Array.isArray(data) ? data : [data];
    const bestQuote = quotes[0]; // Take the first/best quote
    
    if (!bestQuote) {
      throw new Error('No quotes returned from ECU Lines');
    }

    const totalCost = parseFloat(bestQuote.rate) || 0;
    
    // Apply markup
    const { markup, total: totalWithMarkup } = this.calculateMarkup(totalCost, 'ocean');
    
    // Apply additional fees
    const { fees, totalFees } = this.applyAdditionalFees(totalCost, 'ocean');
    
    const finalTotal = totalWithMarkup + totalFees;

    return {
      provider: this.name,
      providerCode: this.code,
      service: 'Ocean Freight (LCL)',
      mode: 'ocean',
      costs: {
        freight: totalCost,
        fuel: 0,
        security: 0,
        handling: 0,
        documentation: 0,
        other: bestQuote.quoteOfferDetails?.map(detail => ({
          name: detail.chargeName,
          amount: detail.amount
        })) || [],
        totalCost: totalCost
      },
      markup: {
        percentage: this.markupSettings.ocean.percentage,
        amount: markup,
        totalMarkup: markup
      },
      additionalFees: fees,
      sellRates: {
        freight: totalCost * (1 + this.markupSettings.ocean.percentage / 100),
        additionalFees: totalFees,
        totalSell: finalTotal
      },
      transitTime: bestQuote.transitTime || 30,
      routing: {
        origin: bestQuote.poRName,
        destination: bestQuote.poDName
      },
      validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      raw: bestQuote
    };
  }
}

module.exports = ECULinesProvider;
