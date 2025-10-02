// src/services/providers/ground/BaseGroundProvider.js
const BaseProvider = require('../BaseProvider');

class BaseGroundProvider extends BaseProvider {
  constructor(name, code) {
    super({
      name,
      code,
      type: 'ground'
    });
  }

  /**
   * Format the provider's response into a standardized format
   * This ensures all providers return data in the same structure
   */
  formatStandardResponse(data) {
    // Ensure we have both carrier and carrierName fields
    const carrier = data.carrier || data.carrierName || data.provider || this.name;
    const carrierName = data.carrierName || data.carrier || data.provider || this.name;
    
    return {
      // Provider info
      provider: data.provider || this.code,
      providerName: this.name,
      
      // CARRIER INFO - Both fields to ensure compatibility
      carrier: carrier,                    // ← This is what your frontend might be looking for
      carrierName: carrierName,           // ← Also include this for redundancy
      carrierCode: data.carrierCode || data.carrier_code || '',
      
      // Broker info (if applicable)
      brokerName: data.brokerName || data.broker || null,
      isBrokered: data.isBrokered || !!data.brokerName || false,
      
      // Service details
      service: data.service || 'LTL Standard',
      serviceCode: data.serviceCode || data.service_code || '',
      serviceName: data.serviceName || data.service || '',
      
      // Pricing - ensure all numbers are valid
      baseFreight: this.sanitizeNumber(data.baseFreight),
      discount: this.sanitizeNumber(data.discount), // Keep negative if discount
      netFreight: this.sanitizeNumber(data.netFreight),
      fuelSurcharge: this.sanitizeNumber(data.fuelSurcharge),
      accessorialCharges: this.sanitizeNumber(data.accessorialCharges || data.accessorials),
      totalCost: this.sanitizeNumber(data.totalCost || data.total),
      
      // Price breakdown for UI tooltip
      priceBreakdown: data.priceBreakdown || {
        baseFreight: this.sanitizeNumber(data.baseFreight),
        discount: this.sanitizeNumber(data.discount),
        fuelSurcharge: this.sanitizeNumber(data.fuelSurcharge),
        accessorials: this.sanitizeNumber(data.accessorialCharges || data.accessorials),
        total: this.sanitizeNumber(data.totalCost || data.total)
      },
      
      // Transit info
      transitDays: parseInt(data.transitDays || data.transit_days || '0', 10) || 0,
      estimatedDeliveryDate: data.estimatedDeliveryDate || data.deliveryDate || null,
      guaranteed: data.guaranteed || false,
      
      // Quote metadata
      quoteId: data.quoteId || data.quote_id || `${this.code}-${Date.now()}`,
      quoteNumber: data.quoteNumber || data.quote_number || null,
      validUntil: data.validUntil || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      
      // Additional info
      notes: data.notes || data.customMessage || null,
      carrierNotes: data.carrierNotes || data.carrier_notes || null,
      specialInstructions: data.specialInstructions || null,
      
      // Performance metrics (if available)
      carrierOnTimePercentage: data.carrierOnTime || data.carrierOnTimePercentage || null,
      
      // Raw response (for debugging)
      rawResponse: data.rawResponse || null,
      
      // Timestamps
      createdAt: new Date().toISOString(),
      
      // Equipment type (if specified)
      equipmentType: data.equipmentType || null,
      
      // Additional fees breakdown (if available)
      additionalFees: data.additionalFees || []
    };
  }

  /**
   * Sanitize number values to ensure they're valid
   */
  sanitizeNumber(value) {
    if (value === null || value === undefined) return 0;
    const num = parseFloat(value);
    return Number.isFinite(num) ? num : 0;
  }

  /**
   * Standard method all ground providers must implement
   */
  async getRates(requestData) {
    throw new Error('getRates must be implemented by provider');
  }

  /**
   * Build standardized error response
   */
  buildErrorResponse(error, requestData) {
    console.error(`[${this.name}] Error:`, error.message);
    
    return {
      success: false,
      provider: this.code,
      error: {
        message: error.message,
        code: error.code || 'PROVIDER_ERROR',
        details: error.response?.data || null
      },
      request: requestData,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Validate request data has required fields
   */
  validateRequest(requestData) {
    const required = ['origin', 'destination', 'commodities'];
    const missing = required.filter(field => !requestData[field]);
    
    if (missing.length > 0) {
      throw new Error(`Missing required fields: ${missing.join(', ')}`);
    }

    // Validate origin
    if (!requestData.origin.zipCode && !requestData.origin.zip) {
      throw new Error('Origin zip code is required');
    }

    // Validate destination
    if (!requestData.destination.zipCode && !requestData.destination.zip) {
      throw new Error('Destination zip code is required');
    }

    // Validate commodities
    if (!Array.isArray(requestData.commodities) || requestData.commodities.length === 0) {
      throw new Error('At least one commodity is required');
    }

    requestData.commodities.forEach((item, index) => {
      if (!item.weight || item.weight <= 0) {
        throw new Error(`Commodity ${index + 1} must have a valid weight`);
      }
      if (!item.quantity || item.quantity <= 0) {
        throw new Error(`Commodity ${index + 1} must have a valid quantity`);
      }
    });

    return true;
  }

  /**
   * Calculate total weight from commodities
   */
  calculateTotalWeight(commodities) {
    return commodities.reduce((total, item) => {
      const weight = parseFloat(item.weight || 0);
      const quantity = parseInt(item.quantity || 1, 10);
      return total + (weight * quantity);
    }, 0);
  }

  /**
   * Calculate total pieces/units
   */
  calculateTotalPieces(commodities) {
    return commodities.reduce((total, item) => {
      return total + parseInt(item.quantity || 1, 10);
    }, 0);
  }

  /**
   * Get freight class or use default
   */
  getFreightClass(commodity) {
    return commodity.freightClass || 
           commodity.nmfcClass || 
           commodity.calculatedClass || 
           commodity.class || 
           '85'; // Default class
  }

  /**
   * Format date for API requests
   */
  formatDate(date, format = 'MM/DD/YYYY') {
    const d = date ? new Date(date) : new Date();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const year = d.getFullYear();
    
    switch(format) {
      case 'YYYY-MM-DD':
        return `${year}-${month}-${day}`;
      case 'MM-DD-YYYY':
        return `${month}-${day}-${year}`;
      case 'DD/MM/YYYY':
        return `${day}/${month}/${year}`;
      default: // MM/DD/YYYY
        return `${month}/${day}/${year}`;
    }
  }
}

module.exports = BaseGroundProvider;
