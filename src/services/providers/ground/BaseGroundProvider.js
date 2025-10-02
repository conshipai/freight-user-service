// services/providers/ground/BaseGroundProvider.js
class BaseGroundProvider {
  constructor(name, code) {
    this.name = name;
    this.code = code;
    this.timeout = 30000; // 30 seconds default
    this.isActive = true;
  }

  // Every carrier must implement this
  async getRates(requestData) {
    throw new Error(`getRates must be implemented by ${this.name}`);
  }

  // Common helper methods all carriers can use
  calculateDensity(weight, length, width, height) {
    const cubicFeet = (length * width * height) / 1728;
    return weight / cubicFeet;
  }

  getFreightClass(density) {
    if (density >= 50) return '50';
    if (density >= 35) return '55';
    if (density >= 30) return '60';
    if (density >= 22.5) return '65';
    if (density >= 15) return '70';
    if (density >= 13.5) return '77.5';
    if (density >= 12) return '85';
    if (density >= 10.5) return '92.5';
    if (density >= 9) return '100';
    if (density >= 8) return '110';
    if (density >= 7) return '125';
    if (density >= 6) return '150';
    if (density >= 5) return '175';
    if (density >= 4) return '200';
    if (density >= 3) return '250';
    if (density >= 2) return '300';
    if (density >= 1) return '400';
    return '500';
  }

  // Standard format all providers should return
  formatStandardResponse(carrierData) {
    // FIX: Ensure both carrier and carrierName fields are populated
    const carrier = carrierData.carrier || carrierData.carrierName || carrierData.provider || this.name;
    const carrierName = carrierData.carrierName || carrierData.carrier || carrierData.provider || this.name;
    
    return {
      provider: carrierData.provider || this.code,
      
      // BOTH fields for compatibility with frontend
      carrier: carrier,           // Frontend might look for this
      carrierName: carrierName,   // Or this
      carrierCode: carrierData.carrierCode || '',
      
      // Broker info if applicable
      brokerName: carrierData.brokerName || null,
      isBrokered: carrierData.isBrokered || !!carrierData.brokerName || false,
      
      service: carrierData.service || 'LTL Standard',
      
      // Pricing
      baseFreight: this.sanitizeNumber(carrierData.baseFreight),
      discount: this.sanitizeNumber(carrierData.discount),
      fuelSurcharge: this.sanitizeNumber(carrierData.fuelSurcharge),
      accessorialCharges: this.sanitizeNumber(carrierData.accessorialCharges || carrierData.accessorials || 0),
      totalCost: this.sanitizeNumber(carrierData.totalCost || carrierData.total || 
                 (carrierData.baseFreight + carrierData.fuelSurcharge + (carrierData.accessorialCharges || 0))),
      
      // Price breakdown for tooltips
      priceBreakdown: carrierData.priceBreakdown || null,
      
      // Transit info
      transitDays: carrierData.transitDays || carrierData.transit_days || 0,
      guaranteed: carrierData.guaranteed || false,
      
      // Quote metadata
      quoteId: carrierData.quoteId || `${this.code}-${Date.now()}`,
      validUntil: carrierData.validUntil || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      
      // Additional fields that might be used
      deliveryDate: carrierData.deliveryDate || carrierData.estimatedDeliveryDate || null,
      notes: carrierData.notes || carrierData.customMessage || null,
      carrierOnTime: carrierData.carrierOnTime || carrierData.carrierOnTimePercentage || null
    };
  }

  // Sanitize number values to prevent NaN/undefined
  sanitizeNumber(value) {
    if (value === null || value === undefined) return 0;
    const num = parseFloat(value);
    return Number.isFinite(num) ? num : 0;
  }

  // Log errors consistently
  logError(error, context = '') {
    console.error(`❌ ${this.name} error ${context}:`, error.message);
    return null; // Return null so other carriers continue
  }
}

module.exports = BaseGroundProvider;
