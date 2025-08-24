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
      timeout: this.timeout,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
        'Accept': 'application/json'
      }
    });
  }

  // Transform request to Pelicargo format
  transformRequest(request) {
    const shipment = request.shipment;
    
    // Convert to metric (Pelicargo requires kg/cm)
    const pieces = shipment.cargo.pieces.map(piece => ({
      quantity: piece.quantity || 1,
      weight: piece.weightKg || (piece.weight * 0.453592), // lbs to kg
      length: piece.lengthCm || Math.round(piece.length * 2.54), // inches to cm
      width: piece.widthCm || Math.round(piece.width * 2.54),
      height: piece.heightCm || Math.round(piece.height * 2.54),
      handling: piece.stackable === false ? ['NonStackable'] : ['Stackable']
    }));

    const totalWeightKg = pieces.reduce(
      (sum, p) => sum + (p.weight * p.quantity), 
      0
    );

    // Build base request
    const pelicargoRequest = {
      freight_service: 'AFR',
      origin_airports: [shipment.origin.airport],
      destination_airports: [shipment.destination.airport],
      is_known_shipper: true,
      original_weight_unit: 'kg',
      original_dimension_unit: 'cm',
      cargo_details: 'Gross Weight',
      cargo_type: 'GeneralCargo',
      cargo: pieces,
      gross_weight: totalWeightKg,
      commodity: shipment.cargo.pieces[0]?.commodity || 'General Cargo',
      freight_status: 'Quoting',
      customer_ref: `quote_${Date.now()}`,
      is_pre_screened: false
    };

    // Add dangerous goods details if present
    if (request.dangerousGoods?.pelicargo) {
      Object.assign(pelicargoRequest, {
        cargo_type: 'DangerousGoods',
        ...request.dangerousGoods.pelicargo
      });
    }

    // Add battery details if present
    if (request.batteryDetails?.pelicargo) {
      Object.assign(pelicargoRequest, request.batteryDetails.pelicargo);
    }

    return pelicargoRequest;
  }

  // Submit quote request (returns immediately with requestId)
  async submitQuoteRequest(request) {
    try {
      const pelicargoRequest = this.transformRequest(request);
      
      console.log('[Pelicargo] Submitting request:', JSON.stringify(pelicargoRequest, null, 2));
      
      const response = await this.client.post('/requests', pelicargoRequest);
      
      if (!response.data?.success) {
        throw new Error(`Request failed: ${response.data?.message || 'Unknown error'}`);
      }

      const requestId = response.data.data.id;
      console.log(`[Pelicargo] Request submitted - ID: ${requestId}`);

      return {
        success: true,
        requestId,
        status: 'SUBMITTED',
        message: 'Quote request submitted to Pelicargo',
        estimatedTime: '20-30 minutes'
      };
    } catch (error) {
      console.error('[Pelicargo] Submit failed:', error.message);
      throw new Error(`Pelicargo submit failed: ${error.message}`);
    }
  }

  // Check quote status (for polling)
  async checkQuoteStatus(requestId) {
    try {
      console.log(`[Pelicargo] Checking status for request ${requestId}...`);
      
      const response = await this.client.get(`/requests/${requestId}`);
      const data = response.data.data;

      if (data.quotes && data.quotes.length > 0) {
        console.log(`[Pelicargo] Found ${data.quotes.length} quotes for request ${requestId}`);
        
        // Parse quotes
        const quotes = await this.parseQuotes(data.quotes);
        
        return {
          success: true,
          status: 'COMPLETED',
          quotes: quotes,
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
      console.error(`[Pelicargo] Status check error:`, error.message);
      return {
        success: false,
        status: 'ERROR',
        error: error.message
      };
    }
  }

  // Parse Pelicargo quotes to standard format
  async parseQuotes(pelicargoQuotes) {
    const quotes = [];
    
    for (const quote of pelicargoQuotes) {
      if (!quote.quote_variants || quote.quote_variants.length === 0) continue;

      // Get airline info
      const airline = this.getAirlineName(quote.airline_id);

      for (const variant of quote.quote_variants) {
        // Costs are in cents from Pelicargo
        const items = Array.isArray(variant.line_items) ? variant.line_items : [];
        
        // Parse cost breakdown
        const costs = this.parseCostBreakdown(items);
        
        quotes.push({
          carrier: airline,
          carrierCode: quote.airline_id,
          service: 'Air',
          serviceType: variant.type || 'STANDARD',
          serviceName: variant.name,
          
          costs: costs,
          
          transitTime: quote.estimated_transit_time || '3-5 days',
          validUntil: new Date(quote.expires_at || Date.now() + 15 * 24 * 60 * 60 * 1000),
          
          routing: {
            origin: quote.origin_airport,
            destination: quote.destination_airport,
            flightPath: quote.flight_path,
            transhipments: quote.transhipments || []
          },
          
          chargeableWeight: quote.chargeable_weight,
          
          bookingInstructions: quote.booking_instructions,
          dropoffInstructions: quote.dropoff_instructions,
          
          quoteId: `${quote.id}_${variant.id}`,
          rawData: variant
        });
      }
    }
    
    return quotes;
  }

  // Parse cost breakdown from line items
  parseCostBreakdown(lineItems) {
    const costs = {
      freight: 0,
      fuel: 0,
      screening: 0,
      security: 0,
      handling: 0,
      documentation: 0,
      other: 0,
      totalCost: 0,
      currency: 'USD'
    };

    // Map Pelicargo line item types to our cost categories
    const typeMapping = {
      'TARIFF': 'freight',
      'FUEL': 'fuel',
      'SCREENING': 'screening',
      'SECURITY': 'security',
      'TRUCKING': 'handling',
      'FWL_FHL_EDI': 'documentation',
      'NON_EAWB': 'documentation'
    };

    for (const item of lineItems) {
      const costInDollars = (item.cost || 0) / 100; // Convert cents to dollars
      const category = typeMapping[item.type] || 'other';
      costs[category] += costInDollars;
      costs.totalCost += costInDollars;
    }

    // Round to 2 decimal places
    Object.keys(costs).forEach(key => {
      if (typeof costs[key] === 'number') {
        costs[key] = Math.round(costs[key] * 100) / 100;
      }
    });

    return costs;
  }

  // Get airline name from code
  getAirlineName(code) {
    const airlines = {
      'TK': 'Turkish Airlines',
      'AF': 'Air France',
      'EK': 'Emirates',
      'AC': 'Air Canada',
      'SQ': 'Singapore Airlines',
      'QR': 'Qatar Airways',
      'BA': 'British Airways',
      'LH': 'Lufthansa',
      'AY': 'Finnair',
      'QY': 'European Air Transport',
      'JU': 'Air Serbia',
      'TP': 'TAP Air Portugal',
      'DE': 'Condor',
      'AA': 'American Airlines',
      'UA': 'United Airlines',
      'DL': 'Delta Airlines'
    };
    return airlines[code] || code;
  }

  // Test connection
  async testConnection() {
    try {
      const response = await this.client.get('/meta/pubkey');
      return {
        success: true,
        provider: 'Pelicargo',
        status: response.status,
        message: 'Pelicargo API connection successful'
      };
    } catch (error) {
      return {
        success: false,
        provider: 'Pelicargo',
        error: error.message
      };
    }
  }
}

module.exports = PelicargoProvider;
