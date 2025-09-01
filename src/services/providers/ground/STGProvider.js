// services/providers/ground/STGProvider.js
const BaseGroundProvider = require('./BaseGroundProvider');

class STGProvider extends BaseGroundProvider {
  constructor() {
    super('STG Logistics', 'STG');
    this.apiUrl = process.env.FREIGHTFORCE_API_URL || 'https://api.freightforce.com/v1/quotes';
    this.apiKey = process.env.FREIGHTFORCE_API_KEY;
    this.accountNumber = process.env.FREIGHTFORCE_ACCOUNT;
  }

  async getRates(requestData) {
    try {
      if (!this.apiKey) {
        console.warn('⚠️ STG/FreightForce API key not configured');
        return null;
      }

      const payload = this.buildRequest(requestData);
      console.log('📤 STG request:', JSON.stringify(payload, null, 2));

      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(payload),
        timeout: this.timeout
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`API returned ${response.status}: ${error}`);
      }

      const data = await response.json();
      console.log('📥 STG response:', JSON.stringify(data, null, 2));

      return this.parseResponse(data);

    } catch (error) {
      return this.logError(error, 'getRates');
    }
  }

  buildRequest(requestData) {
    // Build FreightForce/STG specific request format
    const request = {
      account_number: this.accountNumber,
      quote_type: 'LTL',
      pickup_date: requestData.pickupDate,
      
      origin: {
        zip: requestData.origin.zipCode,
        city: requestData.origin.city,
        state: requestData.origin.state,
        country: 'US',
        is_business: !requestData.accessorials?.residentialPickup
      },
      
      destination: {
        zip: requestData.destination.zipCode,
        city: requestData.destination.city,
        state: requestData.destination.state,
        country: 'US',
        is_business: !requestData.accessorials?.residentialDelivery
      },
      
      items: requestData.commodities.map(item => ({
        quantity: item.quantity,
        packaging_type: item.unitType,
        weight: item.weight,
        length: item.length,
        width: item.width,
        height: item.height,
        freight_class: item.freightClass || this.calculateClass(item),
        description: item.description || 'General Freight',
        nmfc: item.nmfc || null,
        hazmat: item.hazmat || false,
        stackable: item.stackable !== false
      })),
      
      accessorials: this.mapAccessorials(requestData.accessorials)
    };

    return request;
  }

  calculateClass(item) {
    if (item.freightClass) return item.freightClass;
    
    const density = this.calculateDensity(
      item.weight,
      item.length,
      item.width,
      item.height
    );
    
    return this.getFreightClass(density);
  }

  mapAccessorials(accessorials) {
    const stgAccessorials = [];
    
    if (accessorials?.liftgatePickup) stgAccessorials.push('LIFTGATE_PICKUP');
    if (accessorials?.liftgateDelivery) stgAccessorials.push('LIFTGATE_DELIVERY');
    if (accessorials?.residentialDelivery) stgAccessorials.push('RESIDENTIAL_DELIVERY');
    if (accessorials?.insideDelivery) stgAccessorials.push('INSIDE_DELIVERY');
    if (accessorials?.limitedAccessPickup) stgAccessorials.push('LIMITED_ACCESS_PICKUP');
    if (accessorials?.limitedAccessDelivery) stgAccessorials.push('LIMITED_ACCESS_DELIVERY');
    if (accessorials?.appointmentRequired) stgAccessorials.push('APPOINTMENT');
    if (accessorials?.notifyBeforeDelivery) stgAccessorials.push('CALL_BEFORE_DELIVERY');
    
    return stgAccessorials;
  }

  parseResponse(data) {
    try {
      // Handle FreightForce response format
      // Adjust based on their actual API response
      if (!data.quotes || data.quotes.length === 0) {
        console.log('No quotes returned from STG');
        return null;
      }

      const quote = data.quotes[0]; // Take best rate
      
      return this.formatStandardResponse({
        service: quote.service_level || 'Standard LTL',
        baseFreight: parseFloat(quote.base_rate || quote.line_haul || 0),
        fuelSurcharge: parseFloat(quote.fuel_surcharge || 0),
        accessorialCharges: parseFloat(quote.accessorial_total || 0),
        transitDays: parseInt(quote.transit_days || quote.transit_time || 3),
        guaranteed: quote.guaranteed_service || false,
        quoteId: quote.quote_id || quote.reference_number,
        validUntil: quote.valid_until ? new Date(quote.valid_until) : undefined
      });

    } catch (error) {
      return this.logError(error, 'parseResponse');
    }
  }
}

module.exports = STGProvider;
