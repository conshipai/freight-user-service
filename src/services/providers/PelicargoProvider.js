// src/services/providers/PelicargoProvider.js
const BaseProvider = require('./BaseProvider');
const axios = require('axios');

class PelicargoProvider extends BaseProvider {
  constructor(config) {
    super(config);
    this.baseURL = config.apiConfig.baseUrl || 'https://staging-1-api.boardwalk.pelicargo.com/v3';
    this.apiKey = config.apiConfig.apiKey;
    
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: this.timeout,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'Authorization': `Bearer ${this.apiKey}`
      }
    });
  }

  // Submit async quote request to Pelicargo
  async submitQuoteRequest(pelicargoRequest) {
    try {
      const response = await this.client.post('/quotes/request', pelicargoRequest);
      
      return {
        requestId: response.data.requestId || response.data.id,
        status: response.data.status || 'PENDING'
      };
    } catch (error) {
      if (error.response) {
        throw new Error(`Pelicargo API error: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
      }
      throw new Error(`Pelicargo request failed: ${error.message}`);
    }
  }

  // Check status of async quote
  async checkQuoteStatus(requestId) {
    try {
      const response = await this.client.get(`/quotes/status/${requestId}`);
      
      return {
        status: response.data.status,
        quotes: response.data.quotes || []
      };
    } catch (error) {
      throw new Error(`Failed to check Pelicargo status: ${error.message}`);
    }
  }

  // For synchronous testing - not used in production
  async getQuote(request) {
    const pelicargoRequest = this.transformRequest(request);
    
    // Submit the request
    const submitResult = await this.submitQuoteRequest(pelicargoRequest);
    
    // For testing, return a pending status
    return {
      provider: this.name,
      providerCode: this.code,
      requestId: submitResult.requestId,
      status: 'pending',
      message: 'Pelicargo quote submitted. Use polling to check status.',
      costs: {
        totalCost: 0,
        currency: 'USD'
      },
      service: 'Air',
      serviceType: 'standard',
      transitTime: 'Pending',
      rawResponse: submitResult
    };
  }

  transformRequest(request) {
    const shipment = request.shipment;
    
    // Build Pelicargo format request
    const pelicargoRequest = {
      origin: { 
        airport: shipment.origin.airport 
      },
      destination: { 
        airport: shipment.destination.airport 
      },
      cargo: {
        pieces: []
      }
    };

    // Transform cargo pieces
    if (shipment.cargo && shipment.cargo.pieces) {
      pelicargoRequest.cargo.pieces = shipment.cargo.pieces.map(piece => ({
        quantity: piece.quantity || 1,
        weight: piece.weightKg || (piece.weight * 0.453592), // Convert lbs to kg if needed
        length: piece.lengthCm || (piece.length * 2.54), // Convert inches to cm
        width: piece.widthCm || (piece.width * 2.54),
        height: piece.heightCm || (piece.height * 2.54),
        handling: piece.stackable === false ? ['NonStackable'] : [],
        cargo_type: piece.cargoType || 'General'
      }));
    }

    // Add dangerous goods if present
    if (request.hasDangerousGoods && request.dangerousGoods?.pelicargo) {
      Object.assign(pelicargoRequest, request.dangerousGoods.pelicargo);
    }

    // Add battery details if present
    if (request.hasBatteries && request.batteryDetails?.pelicargo) {
      Object.assign(pelicargoRequest, request.batteryDetails.pelicargo);
    }

    return pelicargoRequest;
  }

  parseResponse(data) {
    // Parse Pelicargo response format
    if (!data.quotes || data.quotes.length === 0) {
      throw new Error('No quotes returned from Pelicargo');
    }

    const quotes = data.quotes.map(quote => ({
      carrier: quote.carrier || 'Unknown Carrier',
      costs: {
        freight: quote.breakdown?.freight || 0,
        fuel: quote.breakdown?.fuel || 0,
        screening: quote.breakdown?.screening || 0,
        handling: quote.breakdown?.handling || 0,
        other: quote.breakdown?.other || 0,
        totalCost: quote.totalRate || 0,
        currency: quote.currency || 'USD'
      },
      service: 'Air',
      serviceType: quote.serviceType || 'standard',
      transitTime: quote.transitTime || 'Unknown',
      transitDays: quote.transitDays,
      validUntil: quote.validUntil ? new Date(quote.validUntil) : new Date(Date.now() + 24 * 60 * 60 * 1000),
      routing: {
        origin: quote.origin,
        destination: quote.destination,
        transhipments: quote.transhipments || []
      },
      rawData: quote
    }));

    return quotes;
  }
}

module.exports = PelicargoProvider;
