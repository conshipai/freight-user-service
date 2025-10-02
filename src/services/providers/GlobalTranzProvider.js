// src/services/providers/GlobalTranzProvider.js
const BaseGroundProvider = require('./ground/BaseGroundProvider');
const axios = require('axios');

class GlobalTranzProvider extends BaseGroundProvider {
  constructor() {
    super('GlobalTranz', 'GLOBALTRANZ');
    
    // Use dev environment that works with the test credentials
    this.baseUrl = process.env.GLOBALTRANZ_API_URL || 'https://dev.gtzintegrate.com';
    this.subscriptionKey = process.env.GLOBALTRANZ_SUBSCRIPTION_KEY || 'bcc0ec4997814c74a854f9a738a58cbd';
    
    // The authorization token from the working curl (already base64 encoded)
    this.authToken = process.env.GLOBALTRANZ_AUTH_TOKEN || 'YXBpdGVzdGluZzpBZ2VudCU5OTk5';
    
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
    
    // Create axios instance
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
      headers: {
        'accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Basic ${this.authToken}`
      }
    });
  }

  async getRates(requestData) {
    try {
      console.log('🚚 GlobalTranz: Fetching rates...');
      console.log('   Base URL:', this.baseUrl);
      console.log('   Subscription Key:', this.subscriptionKey ? '***' + this.subscriptionKey.slice(-4) : 'Not set');

      // Build the request in GlobalTranz format
      const gtzRequest = this.buildRequest(requestData);
      console.log('📤 GlobalTranz request:', JSON.stringify(gtzRequest, null, 2));

      // Use the correct endpoint from the working curl
      const endpoint = '/rate/ltl/v2';
      const fullUrl = `${endpoint}?subscription-key=${this.subscriptionKey}`;
      
      console.log(`🔍 Calling endpoint: ${this.baseUrl}${fullUrl}`);
      
      try {
        const response = await this.client.post(fullUrl, gtzRequest);
        console.log('✅ GlobalTranz API call successful');
        return this.parseResponse(response.data, requestData);
      } catch (error) {
        // Handle 422 error (no carriers found)
        if (error.response && error.response.status === 422) {
          console.log('⚠️ GlobalTranz: No carriers available for this route');
          console.log('   Response:', error.response.data);
          
          // Return a "no rates" response
          return {
            provider: this.name,
            success: false,
            error: 'No carriers available for this route',
            message: error.response.data || 'We were unable to find a carrier to provide a quote.',
            rates: []
          };
        }
        
        throw error;
      }
      
    } catch (error) {
      console.error('❌ GlobalTranz error:', error.response?.data || error.message);
      if (error.response) {
        console.error('   Status:', error.response.status);
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
      
      // Build item with required fields first
      const gtzItem = {
        PieceCount: quantity,
        PalletCount: item.unitType === 'Pallets' ? quantity : 0,
        Weight: weight,
        WeightType: 1, // 1 = Pounds
        ProductClass: parseFloat(item.freightClass || item.nmfcClass || item.calculatedClass || '50'),
        Description: item.description || 'General Freight',
        PackageType: this.getPackageType(item.unitType),
        Hazmat: item.hazmat || false,
        Stackable: item.stackable !== false
      };

      // Add dimensions only if provided
      if (item.length) gtzItem.Length = Math.ceil(item.length);
      if (item.width) gtzItem.Width = Math.ceil(item.width);
      if (item.height) gtzItem.Height = Math.ceil(item.height);
      
      // Add NMFC if provided
      if (item.nmfc) gtzItem.NmfcNumber = item.nmfc;
      
      // Add hazmat details if applicable
      if (item.hazmat) {
        gtzItem.HazmatClass = 10; // Default hazmat class
      }

      return gtzItem;
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

    // Check if shipment is stackable
    const isStackable = items.some(i => i.Stackable);

    // Build the request object matching the working API specification
    const request = {
      CustomerId: "012345", // Test customer ID from docs
      GuaranteedRates: false,
      PickupDate: formattedDate,
      Stackable: isStackable,
      TerminalPickup: false,
      ShipmentNew: false,
      Origin: {
        Street: requestData.origin?.address || "123 abc street",
        City: requestData.origin?.city || "Phoenix",
        State: requestData.origin?.state || "AZ",
        Zip: requestData.origin?.zipCode || "85008",
        Country: "USA"
      },
      Destination: {
        Street: requestData.destination?.address || "321 xyz street",
        City: requestData.destination?.city || "Navasota",
        State: requestData.destination?.state || "TX",
        Zip: requestData.destination?.zipCode || "77868",
        Country: "USA"
      },
      Items: items,
      Accessorials: accessorials
    };

    // Add optional fields if provided
    if (requestData.contactName) {
      request.ContactName = requestData.contactName;
    }
    
    if (requestData.valueOfGoods) {
      request.ValueOfGoods = requestData.valueOfGoods;
    }

    return request;
  }

  getPackageType(unitType) {
    // Map unit types to GlobalTranz package types
    const packageTypes = {
      'Pallets': 0,
      'Bags': 2,
      'Bales': 3,
      'Boxes': 4,
      'Bundles': 16,
      'Crates': 8,
      'Drums': 10,
      'Loose': 15,
      'Pieces': 0,
      'Rolls': 13,
      'Totes': 17
    };
    
    return packageTypes[unitType] || 0; // Default to pallets
  }

  parseResponse(response, requestData) {
    console.log('📦 Parsing GlobalTranz response...');
    
    // Handle both array and single object responses
    const quotes = Array.isArray(response) ? response : [response];
    
    if (quotes.length === 0) {
      console.log('⚠️ No quotes in response');
      return null;
    }

    console.log(`💰 Found ${quotes.length} carrier quotes`);

    // Parse all quotes
    const results = quotes.map(quote => {
      // Extract carrier info
      const carrierName = quote.CarrierDetail?.CarrierName || 'Unknown Carrier';
      const carrierCode = quote.CarrierDetail?.CarrierCode || 'UNK';
      
      // Extract the main price - LtlAmount is the total
      const totalCost = parseFloat(quote.LtlAmount || 0);
      
      // Extract charges breakdown if available
      let baseFreight = 0;
      let fuelSurcharge = 0;
      let discount = 0;
      let accessorialTotal = 0;
      
      if (quote.Charges && Array.isArray(quote.Charges)) {
        quote.Charges.forEach(charge => {
          const amount = parseFloat(charge.Charge || 0);
          const name = (charge.Name || '').toLowerCase();
          
          if (name.includes('initial') || name.includes('base') || name.includes('cost')) {
            baseFreight = amount;
          } else if (name.includes('fuel')) {
            fuelSurcharge = amount;
          } else if (name.includes('discount')) {
            discount = amount; // Note: discount is negative
          } else {
            accessorialTotal += amount;
          }
        });
      }
      
      // Extract transit time
      const transitDays = parseInt(quote.LtlServiceDays || quote.CalendarDays || 3);
      const deliveryDate = quote.EstimatedDeliveryDate || quote.LtlDeliveryDate;
      
      console.log(`  • ${carrierName}: $${totalCost.toFixed(2)} (${transitDays} days)`);

      return {
        carrierName: carrierName,
        carrierCode: carrierCode,
        service: quote.LtlServiceTypeName || 'LTL Standard',
        baseFreight: baseFreight,
        discount: discount,
        fuelSurcharge: fuelSurcharge,
        accessorialCharges: accessorialTotal,
        totalCost: totalCost,
        transitDays: transitDays,
        guaranteed: quote.GuaranteedRate ? true : false,
        quoteId: quote.QuoteId || `GTZ-${Date.now()}`,
        validUntil: new Date(Date.now() + 24 * 60 * 60 * 1000),
        deliveryDate: deliveryDate,
        // Include carrier performance metrics
        carrierOnTime: quote.CarrierDetail?.CarrierOnTimeforCustomer || 'N/A',
        // Include any special messages
        customMessage: quote.CustomMessage || null
      };
    });

    // Sort by price to find the best rate
    results.sort((a, b) => a.totalCost - b.totalCost);
    
    console.log(`\n✅ Best quote: ${results[0].carrierName} at $${results[0].totalCost.toFixed(2)}`);
    
    // Return the best (cheapest) quote using the standard format
    return this.formatStandardResponse({
      ...results[0],
      provider: this.name,
      carrier: results[0].carrierName,
      // You could also return all quotes if needed:
      // allQuotes: results
    });
  }
}

module.exports = GlobalTranzProvider;
