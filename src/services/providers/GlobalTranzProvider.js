// src/services/providers/GlobalTranzProvider.js
const BaseGroundProvider = require('./ground/BaseGroundProvider');
const axios = require('axios');

class GlobalTranzProvider extends BaseGroundProvider {
  constructor() {
    super('GlobalTranz', 'GLOBALTRANZ');
    
    this.baseUrl = process.env.GLOBALTRANZ_API_URL || 'https://api.gtzintegrate.com';
    this.accessKey = process.env.GLOBALTRANZ_ACCESS_KEY;
    this.username = process.env.GLOBALTRANZ_USERNAME;
    this.password = process.env.GLOBALTRANZ_PASSWORD;
    
    // Accessorial code mappings for GlobalTranz
    this.accessorialCodes = {
      liftgatePickup: 12,
      liftgateDelivery: 13,
      residentialPickup: 14,
      residentialDelivery: 15,
      insidePickup: 16,
      insideDelivery: 17,
      limitedAccessPickup: 18,
      limitedAccessDelivery: 19,
      appointmentPickup: 20,
      appointmentDelivery: 21,
      protectFromFreeze: 22
    };
    
    // Create axios instance with basic auth
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${Buffer.from(`${this.username}:${this.password}`).toString('base64')}`
      }
    });
  }

  async getRates(requestData) {
    try {
      if (!this.accessKey || !this.username || !this.password) {
        console.warn('⚠️ GlobalTranz: Missing credentials, skipping');
        return null;
      }

      console.log('🚚 GlobalTranz: Fetching rates...');

      // Build the request in GlobalTranz format
      const gtzRequest = this.buildRequest(requestData);
      console.log('📤 GlobalTranz request:', JSON.stringify(gtzRequest, null, 2));

      // Call the API - the endpoint should include the accessKey as a query param
      const response = await this.client.post(`/api/rate/v2?accessKey=${this.accessKey}`, gtzRequest);

      console.log('📥 GlobalTranz response received');

      // Parse and return the best rate
      return this.parseResponse(response.data, requestData);
      
    } catch (error) {
      console.error('❌ GlobalTranz error:', error.response?.data || error.message);
      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response URL:', error.config?.url);
      }
      return this.logError(error, 'getRates');
    }
  }

  buildRequest(requestData) {
    // Format date as MM/DD/YYYY
    const pickupDate = requestData.pickupDate 
      ? new Date(requestData.pickupDate) 
      : new Date(Date.now() + 86400000); // Tomorrow
    
    const month = String(pickupDate.getMonth() + 1).padStart(2, '0');
    const day = String(pickupDate.getDate()).padStart(2, '0');
    const year = pickupDate.getFullYear();
    const formattedDate = `${month}/${day}/${year}`;

    // Build items array in GlobalTranz format
    const items = (requestData.commodities || []).map(item => {
      const quantity = parseInt(item.quantity || 1);
      const weight = Math.ceil(item.weight || 0);
      
      return {
        PieceCount: quantity,
        PalletCount: item.unitType === 'Pallets' ? quantity : 0,
        Length: Math.ceil(item.length || 48),
        Width: Math.ceil(item.width || 40),
        Height: Math.ceil(item.height || 0),
        Weight: weight,
        WeightType: 1, // 1 = per piece, 0 = total
        ProductClass: parseInt(item.freightClass || item.nmfcClass || item.calculatedClass || '50'),
        LinearFeet: 0, // Calculate if needed
        NmfcNumber: item.nmfc || '',
        Description: item.description || 'General Freight',
        PackageType: this.getPackageType(item.unitType),
        Hazmat: item.hazmat || false,
        HazmatClass: item.hazmat ? 10 : null,
        PackingGroupNumber: '',
        UnPoNumber: '',
        Stackable: item.stackable !== false
      };
    });

    // Build accessorials array
    const accessorials = [];
    const acc = requestData.accessorials || {};
    
    if (acc.liftgatePickup) accessorials.push(this.accessorialCodes.liftgatePickup);
    if (acc.liftgateDelivery) accessorials.push(this.accessorialCodes.liftgateDelivery);
    if (acc.residentialPickup) accessorials.push(this.accessorialCodes.residentialPickup);
    if (acc.residentialDelivery) accessorials.push(this.accessorialCodes.residentialDelivery);
    if (acc.insidePickup) accessorials.push(this.accessorialCodes.insidePickup);
    if (acc.insideDelivery) accessorials.push(this.accessorialCodes.insideDelivery);
    if (acc.limitedAccessPickup) accessorials.push(this.accessorialCodes.limitedAccessPickup);
    if (acc.limitedAccessDelivery) accessorials.push(this.accessorialCodes.limitedAccessDelivery);

    // Build the request object in GlobalTranz format
    return {
      CustomerId: process.env.GLOBALTRANZ_CUSTOMER_ID || "012345",
      GuaranteedRates: false,
      PickupDate: formattedDate,
      ExtremeLength: null,
      ExtremeLengthBundleCount: null,
      Stackable: items.some(i => i.Stackable),
      TerminalPickup: false,
      ContactName: requestData.contactName || "Shipping Department",
      ValueOfGoods: null,
      ShipmentNew: true,
      Origin: {
        Street: requestData.origin?.address || "",
        City: requestData.origin?.city || "",
        State: requestData.origin?.state || "",
        Zip: requestData.origin?.zipCode || "",
        Country: "USA"
      },
      Destination: {
        Street: requestData.destination?.address || "",
        City: requestData.destination?.city || "",
        State: requestData.destination?.state || "",
        Zip: requestData.destination?.zipCode || "",
        Country: "USA"
      },
      Items: items,
      Accessorials: accessorials
    };
  }

  getPackageType(unitType) {
    // Map unit types to GlobalTranz package types
    // You may need to adjust these based on their API documentation
    const packageTypes = {
      'Pallets': 0,
      'Boxes': 1,
      'Crates': 2,
      'Bundles': 3,
      'Rolls': 4,
      'Bags': 5,
      'Drums': 6,
      'Totes': 7
    };
    return packageTypes[unitType] || 0;
  }

  parseResponse(response, requestData) {
    // GlobalTranz response might have different structures
    let quotes = [];
    
    // Try to extract quotes from various possible response formats
    if (response?.Quotes) {
      quotes = response.Quotes;
    } else if (response?.quotes) {
      quotes = response.quotes;
    } else if (response?.data) {
      quotes = response.data;
    } else if (Array.isArray(response)) {
      quotes = response;
    } else if (response && typeof response === 'object') {
      // Single quote response
      quotes = [response];
    }
    
    if (quotes.length === 0) {
      console.log('⚠️ GlobalTranz: No quotes in response');
      console.log('Response structure:', JSON.stringify(response, null, 2));
      return null;
    }

    // Find the best quote (cheapest)
    const bestQuote = quotes.reduce((best, current) => {
      const currentTotal = parseFloat(
        current.TotalAmount || 
        current.totalAmount || 
        current.Total || 
        current.total || 
        current.TotalCharge ||
        current.totalCharge ||
        0
      );
      const bestTotal = parseFloat(
        best.TotalAmount || 
        best.totalAmount || 
        best.Total || 
        best.total || 
        best.TotalCharge ||
        best.totalCharge ||
        999999
      );
      return currentTotal < bestTotal ? current : best;
    });

    console.log(`💰 GlobalTranz: Found ${quotes.length} quotes`);

    // Parse the pricing - handle PascalCase and camelCase
    const baseFreight = parseFloat(
      bestQuote.FreightCharge || 
      bestQuote.freightCharge ||
      bestQuote.LineHaul || 
      bestQuote.linehaul || 
      bestQuote.BaseRate ||
      bestQuote.baseRate ||
      bestQuote.Freight ||
      bestQuote.freight ||
      0
    );
    
    const fuelSurcharge = parseFloat(
      bestQuote.FuelCharge || 
      bestQuote.fuelCharge ||
      bestQuote.FuelSurcharge ||
      bestQuote.fuelSurcharge ||
      bestQuote.Fuel || 
      bestQuote.fuel ||
      bestQuote.FSC ||
      bestQuote.fsc ||
      0
    );
    
    const accessorialTotal = parseFloat(
      bestQuote.AccessorialCharge || 
      bestQuote.accessorialCharge ||
      bestQuote.AccessorialCharges ||
      bestQuote.accessorialCharges ||
      bestQuote.Accessorials || 
      bestQuote.accessorials ||
      0
    );
    
    const totalCost = parseFloat(
      bestQuote.TotalAmount || 
      bestQuote.totalAmount ||
      bestQuote.Total || 
      bestQuote.total || 
      bestQuote.TotalCharge ||
      bestQuote.totalCharge ||
      bestQuote.GrandTotal ||
      bestQuote.grandTotal ||
      0
    );
    
    const transitDays = parseInt(
      bestQuote.TransitDays || 
      bestQuote.transitDays ||
      bestQuote.TransitTime ||
      bestQuote.transitTime ||
      bestQuote.EstimatedTransitDays || 
      bestQuote.estimatedTransitDays ||
      3
    );

    const carrierName = 
      bestQuote.CarrierName || 
      bestQuote.carrierName ||
      bestQuote.Carrier ||
      bestQuote.carrier ||
      'Unknown Carrier';

    console.log('💰 GlobalTranz Pricing:');
    console.log(`   Carrier: ${carrierName}`);
    console.log(`   Base Freight: $${baseFreight.toFixed(2)}`);
    console.log(`   Fuel Surcharge: $${fuelSurcharge.toFixed(2)}`);
    console.log(`   Accessorials: $${accessorialTotal.toFixed(2)}`);
    console.log(`   Total: $${totalCost.toFixed(2)}`);
    console.log(`   Transit: ${transitDays} days`);

    // Return in standardized format
    return this.formatStandardResponse({
      service: bestQuote.Service || bestQuote.service || bestQuote.ServiceName || bestQuote.serviceName || 'LTL Standard',
      baseFreight: baseFreight,
      fuelSurcharge: fuelSurcharge,
      accessorialCharges: accessorialTotal,
      totalCost: totalCost,
      transitDays: transitDays,
      guaranteed: bestQuote.Guaranteed || bestQuote.guaranteed || false,
      quoteId: bestQuote.QuoteId || bestQuote.quoteId || bestQuote.Id || bestQuote.id || `GTZ-${Date.now()}`,
      validUntil: new Date(Date.now() + 24 * 60 * 60 * 1000),
      
      // Additional GlobalTranz specific data
      carrierName: carrierName,
      carrierCode: bestQuote.CarrierCode || bestQuote.carrierCode || bestQuote.SCAC || bestQuote.scac,
      serviceType: bestQuote.ServiceType || bestQuote.serviceType || bestQuote.Service || bestQuote.service,
      gtzQuoteId: bestQuote.QuoteId || bestQuote.quoteId || bestQuote.Id || bestQuote.id
    });
  }
}

module.exports = GlobalTranzProvider;
