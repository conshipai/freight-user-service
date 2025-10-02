// src/services/providers/GlobalTranzProvider.js
const BaseGroundProvider = require('./ground/BaseGroundProvider');
const axios = require('axios');

class GlobalTranzProvider extends BaseGroundProvider {
  constructor() {
    super('GlobalTranz', 'GLOBALTRANZ');
    
    this.baseUrl = process.env.GLOBALTRANZ_API_URL || 'https://api.gtzintegrate.com';
    this.accessKey = process.env.GLOBALTRANZ_ACCESS_KEY || 'bcc0ec4997814c74a854f9a738a58cbd';
    this.username = process.env.GLOBALTRANZ_USERNAME || 'apitesting';
    this.password = process.env.GLOBALTRANZ_PASSWORD || 'Agent%9999';
    
    // Accessorial code mappings from API documentation
    this.accessorialCodes = {
      liftgatePickup: 11,
      liftgateDelivery: 12,
      residentialPickup: 13,
      residentialDelivery: 14,
      insideDelivery: 15,
      notifyPriorToArrival: 17,
      notificationPickup: 103,
      notificationDelivery: 104,
      insidePickup: 105,
      sortAndSegregate: 108,
      protectFromFreeze: 116,
      limitedAccessPickup: 138,
      limitedAccessDelivery: 139,
      appointmentPickup: 152,
      appointmentDelivery: 153
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
      console.log('🚚 GlobalTranz: Fetching rates...');
      console.log('   Base URL:', this.baseUrl);
      console.log('   Access Key:', this.accessKey);

      // Build the request in GlobalTranz format
      const gtzRequest = this.buildRequest(requestData);
      console.log('📤 GlobalTranz request:', JSON.stringify(gtzRequest, null, 2));

      // Try different endpoint variations
      const endpoints = [
        '/RateV2',           // Most likely based on docs
        '/api/RateV2',
        '/api/rate/v2',
        '/Rate',             
        '/api/Rate'
      ];

      let response = null;
      let lastError = null;

      for (const endpoint of endpoints) {
        try {
          const fullUrl = `${endpoint}?accessKey=${this.accessKey}`;
          console.log(`🔍 Trying endpoint: ${fullUrl}`);
          
          response = await this.client.post(fullUrl, gtzRequest);
          console.log(`✅ Success with endpoint: ${endpoint}`);
          break;
        } catch (err) {
          lastError = err;
          console.log(`❌ Failed ${endpoint}: ${err.response?.status || err.message}`);
          
          // Log non-404 errors as they might give us clues
          if (err.response && err.response.status !== 404) {
            console.log('Response data:', JSON.stringify(err.response.data, null, 2));
          }
        }
      }

      if (!response) {
        console.error('❌ All endpoints failed.');
        if (lastError?.response?.data) {
          console.error('Last error details:', JSON.stringify(lastError.response.data, null, 2));
        }
        throw lastError || new Error('No endpoints worked');
      }

      console.log('📥 GlobalTranz response received');
      return this.parseResponse(response.data, requestData);
      
    } catch (error) {
      console.error('❌ GlobalTranz final error:', error.response?.data || error.message);
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
        // Required fields
        PieceCount: quantity,
        PalletCount: item.unitType === 'Pallets' ? quantity : 0,
        Weight: weight,
        WeightType: 1, // 1 = Pounds, 0 = Kilograms
        ProductClass: parseFloat(item.freightClass || item.nmfcClass || item.calculatedClass || '50'),
        Description: item.description || 'General Freight',
        PackageType: this.getPackageType(item.unitType),
        Hazmat: item.hazmat || false,
        Stackable: item.stackable !== false,
        
        // Optional fields
        Length: item.length ? Math.ceil(item.length) : null,
        Width: item.width ? Math.ceil(item.width) : null,
        Height: item.height ? Math.ceil(item.height) : null,
        LinearFeet: null,
        NmfcNumber: item.nmfc || null,
        HazmatClass: item.hazmat ? 30 : null, // 30 = Flammable Liquid (default hazmat class)
        PackingGroupNumber: null,
        UnPoNumber: null
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
    if (acc.appointmentPickup) accessorials.push(this.accessorialCodes.appointmentPickup);
    if (acc.appointmentDelivery) accessorials.push(this.accessorialCodes.appointmentDelivery);

    // Check if shipment is stackable (any item can be stacked)
    const isStackable = items.some(i => i.Stackable);

    // Build the request object matching the exact API specification
    const request = {
      // Required fields
      CustomerId: "012345", // Test customer ID from docs
      PickupDate: formattedDate,
      Stackable: isStackable,
      TerminalPickup: false,
      ShipmentNew: false, // Used goods by default
      Origin: {
        Zip: requestData.origin?.zipCode || "",
        Country: "USA",
        // Optional origin fields
        Street: requestData.origin?.address || null,
        City: requestData.origin?.city || null,
        State: requestData.origin?.state || null
      },
      Destination: {
        Zip: requestData.destination?.zipCode || "",
        Country: "USA",
        // Optional destination fields
        Street: requestData.destination?.address || null,
        City: requestData.destination?.city || null,
        State: requestData.destination?.state || null
      },
      Items: items,
      
      // Optional fields
      GuaranteedRates: false,
      ExtremeLength: null,
      ExtremeLengthBundleCount: null,
      ContactName: requestData.contactName || null,
      ValueOfGoods: null,
      Accessorials: accessorials.length > 0 ? accessorials : null
    };

    // Remove null fields to clean up the request
    Object.keys(request).forEach(key => {
      if (request[key] === null) {
        delete request[key];
      }
    });

    return request;
  }

  getPackageType(unitType) {
    // Map unit types to GlobalTranz package types based on API docs
    const packageTypes = {
      'Pallets': 0,        // Std Pallets
      'NonStdPallets': 1,  // Pallets - Non Std
      'Bags': 2,
      'Bales': 3,
      'Boxes': 4,
      'Bunches': 5,
      'Carpets': 6,
      'Coils': 7,
      'Crates': 8,
      'Cylinders': 9,
      'Drums': 10,
      'Pails': 11,
      'Reels': 12,
      'Rolls': 13,
      'Tubes': 14,
      'Pipes': 14,
      'Loose': 15,
      'Bundles': 16,
      'Totes': 17,
      'Tote': 17
    };
    
    return packageTypes[unitType] !== undefined ? packageTypes[unitType] : 0; // Default to standard pallets
  }

  parseResponse(response, requestData) {
    console.log('📦 GlobalTranz raw response:', JSON.stringify(response, null, 2));
    
    // GlobalTranz response might have different structures
    let quotes = [];
    
    // Try to extract quotes from various possible response formats
    if (response?.Quotes) {
      quotes = response.Quotes;
    } else if (response?.quotes) {
      quotes = response.quotes;
    } else if (response?.Results) {
      quotes = response.Results;
    } else if (response?.results) {
      quotes = response.results;
    } else if (response?.data) {
      quotes = Array.isArray(response.data) ? response.data : [response.data];
    } else if (Array.isArray(response)) {
      quotes = response;
    } else if (response && typeof response === 'object') {
      // Single quote response
      quotes = [response];
    }
    
    if (quotes.length === 0) {
      console.log('⚠️ GlobalTranz: No quotes in response');
      return null;
    }

    // Find the best quote (cheapest)
    const bestQuote = quotes[0]; // For now, take the first one
    
    console.log(`💰 GlobalTranz: Found ${quotes.length} quotes`);

    // Parse the pricing - try various field names
    const baseFreight = parseFloat(
      bestQuote.FreightCharge || 
      bestQuote.freightCharge ||
      bestQuote.LineHaul || 
      bestQuote.linehaul || 
      bestQuote.BaseRate ||
      bestQuote.baseRate ||
      0
    );
    
    const fuelSurcharge = parseFloat(
      bestQuote.FuelCharge || 
      bestQuote.fuelCharge ||
      bestQuote.FuelSurcharge ||
      bestQuote.fuelSurcharge ||
      0
    );
    
    const accessorialTotal = parseFloat(
      bestQuote.AccessorialCharge || 
      bestQuote.accessorialCharge ||
      bestQuote.AccessorialCharges ||
      bestQuote.accessorialCharges ||
      0
    );
    
    const totalCost = parseFloat(
      bestQuote.TotalAmount || 
      bestQuote.totalAmount ||
      bestQuote.Total || 
      bestQuote.total || 
      baseFreight + fuelSurcharge + accessorialTotal
    );
    
    const transitDays = parseInt(
      bestQuote.TransitDays || 
      bestQuote.transitDays ||
      bestQuote.TransitTime ||
      bestQuote.transitTime ||
      3
    );

    console.log('💰 GlobalTranz Pricing:');
    console.log(`   Base Freight: $${baseFreight.toFixed(2)}`);
    console.log(`   Fuel Surcharge: $${fuelSurcharge.toFixed(2)}`);
    console.log(`   Accessorials: $${accessorialTotal.toFixed(2)}`);
    console.log(`   Total: $${totalCost.toFixed(2)}`);
    console.log(`   Transit: ${transitDays} days`);

    // Return in standardized format
    return this.formatStandardResponse({
      service: 'LTL Standard',
      baseFreight: baseFreight,
      fuelSurcharge: fuelSurcharge,
      accessorialCharges: accessorialTotal,
      totalCost: totalCost,
      transitDays: transitDays,
      guaranteed: false,
      quoteId: bestQuote.QuoteId || bestQuote.quoteId || `GTZ-${Date.now()}`,
      validUntil: new Date(Date.now() + 24 * 60 * 60 * 1000)
    });
  }
}

module.exports = GlobalTranzProvider;
