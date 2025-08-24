// src/services/providers/PelicargoProvider.js
const BaseProvider = require('./BaseProvider');
const axios = require('axios');

class PelicargoProvider extends BaseProvider {
  constructor(config) {
    super(config);
    this.baseURL = config.apiConfig.baseUrl || 'https://staging-1-api.boardwalk.pelicargo.com/v3';
    this.apiKey = config.apiConfig.apiKey || process.env.PELICARGO_API_KEY;
    
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: 15000,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
        'Accept': 'application/json'
      }
    });
  }

  async getQuote(request) {
    try {
      // Submit the quote request
      const submitResult = await this.submitQuoteRequest(request);
      
      // Return immediately with requestId for polling
      return {
        provider: this.name,
        providerCode: this.code,
        requestId: submitResult.requestId,
        status: 'pending',
        message: 'Pelicargo processing (20-30 min). Poll with requestId.',
        costs: {
          totalCost: 0,
          currency: 'USD'
        },
        service: 'Air',
        serviceType: 'standard',
        transitTime: 'Pending',
        rawResponse: submitResult
      };
    } catch (error) {
      throw new Error(`Pelicargo quote failed: ${error.message}`);
    }
  }

  async submitQuoteRequest(request) {
    try {
      const pelicargoRequest = this.transformRequest(request);
      
      console.log('[Pelicargo] Submitting to /requests endpoint...');
      console.log('[Pelicargo] Request:', JSON.stringify(pelicargoRequest, null, 2));
      
      const response = await this.client.post('/requests', pelicargoRequest);
      
      if (!response.data?.success) {
        throw new Error(`Request failed: ${response.data?.message || 'Unknown'}`);
      }
      
      const requestId = response.data.data.id;
      console.log(`[Pelicargo] Quote request submitted - ID: ${requestId}`);
      
      return {
        success: true,
        provider: 'Pelicargo',
        requestId: requestId,
        status: 'SUBMITTED',
        message: 'Quote request submitted to Pelicargo',
        estimatedTime: '20-30 minutes',
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      if (error.response) {
        console.error('[Pelicargo] API Error:', error.response.status, error.response.data);
        throw new Error(`Pelicargo API error: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
      }
      throw error;
    }
  }

  transformRequest(request) {
    const shipment = request.shipment;
    
    // Calculate total weight in kg
    const totalWeightKg = this.calculateWeight(shipment.cargo?.pieces);
    
    // Use the working format from your PelicargoService
    return {
      freight_service: 'AFR',
      origin_airports: [shipment.origin.airport],
      destination_airports: [shipment.destination.airport],
      is_known_shipper: true,
      original_weight_unit: 'kg',
      original_dimension_unit: 'cm',
      cargo_details: 'Gross Weight',
      cargo_type: 'GeneralCargo',
      cargo: this.mapCargoFromPieces(shipment.cargo?.pieces, totalWeightKg),
      gross_weight: totalWeightKg,
      commodity: shipment.cargo?.description || 'General Cargo',
      freight_status: 'Quoting',
      customer_ref: `quote_${Date.now()}`,
      is_pre_screened: false
    };
  }

  mapCargoFromPieces(pieces, totalWeightKg) {
    if (!pieces || !Array.isArray(pieces) || pieces.length === 0) {
      return [{
        quantity: 1,
        weight: totalWeightKg || 100,
        length: 60,
        width: 40,
        height: 30,
        handling: ['Stackable']
      }];
    }

    return pieces.map(piece => ({
      quantity: piece.quantity || 1,
      weight: piece.weightKg || (piece.weight * 0.453592), // Convert lbs to kg if needed
      length: piece.lengthCm || (piece.length * 2.54), // Convert inches to cm if needed
      width: piece.widthCm || (piece.width * 2.54),
      height: piece.heightCm || (piece.height * 2.54),
      handling: piece.stackable === false ? ['Unstackable'] : ['Stackable']
    }));
  }

  calculateWeight(pieces) {
    if (!pieces || !Array.isArray(pieces)) return 100;
    
    return pieces.reduce((total, piece) => {
      const weight = piece.weightKg || (piece.weight * 0.453592) || 0;
      const quantity = piece.quantity || 1;
      return total + (weight * quantity);
    }, 0);
  }

  async checkQuoteStatus(requestId) {
    try {
      console.log(`[Pelicargo] Checking status for request ${requestId}...`);
      const response = await this.client.get(`/requests/${requestId}`);
      const data = response.data.data;
      
      if (data.quotes && data.quotes.length > 0) {
        console.log(`[Pelicargo] Found ${data.quotes.length} quotes for request ${requestId}`);
        return {
          success: true,
          status: 'COMPLETED',
          quotes: this.formatQuotes(data.quotes),
          rawData: data
        };
      } else {
        console.log(`[Pelicargo] No quotes ready yet for request ${requestId}`);
        return {
          success: true,
          status: 'PROCESSING',
          message: 'Quotes still processing'
        };
      }
    } catch (error) {
      console.error(`[Pelicargo] Error checking status:`, error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  formatQuotes(pelicargoQuotes) {
    const formattedQuotes = [];
    
    for (const quote of pelicargoQuotes) {
      if (!quote.quote_variants || quote.quote_variants.length === 0) continue;
      
      for (const variant of quote.quote_variants) {
        const items = Array.isArray(variant.line_items) ? variant.line_items : [];
        const totalCostCents = items.reduce((sum, item) => sum + (Number(item.cost) || 0), 0);
        const totalCostUSD = totalCostCents / 100;
        
        // Extract specific charge types
        const freightItem = items.find(it => it.type === 'TARIFF');
        const fuelItem = items.find(it => it.type === 'FUEL');
        const screeningItem = items.find(it => it.type === 'SCREENING');
        
        formattedQuotes.push({
          carrier: this.getAirlineName(quote.airline_id),
          airlineCode: quote.airline_id,
          service: variant.name,
          serviceType: variant.type,
          costs: {
            freight: freightItem ? freightItem.cost / 100 : 0,
            fuel: fuelItem ? fuelItem.cost / 100 : 0,
            screening: screeningItem ? screeningItem.cost / 100 : 0,
            totalCost: totalCostUSD,
            currency: 'USD'
          },
          transitTime: quote.estimated_transit_time || '2-4 days',
          validUntil: quote.expires_at,
          chargeableWeight: quote.chargeable_weight,
          quoteId: `${quote.id}_${variant.id}`,
          rawData: variant
        });
      }
    }
    
    return formattedQuotes;
  }

  getAirlineName(code) {
    const airlines = {
      TK: 'Turkish Airlines',
      AF: 'Air France', 
      EK: 'Emirates',
      AC: 'Air Canada',
      SQ: 'Singapore Airlines',
      QR: 'Qatar Airways',
      BA: 'British Airways',
      LH: 'Lufthansa',
      AA: 'American Airlines',
      UA: 'United Airlines'
    };
    return airlines[code] || code;
  }
}

module.exports = PelicargoProvider;
