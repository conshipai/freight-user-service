// src/services/providers/GlobalTranzProvider.js
const BaseGroundProvider = require('./ground/BaseGroundProvider');
const axios = require('axios');

class GlobalTranzProvider extends BaseGroundProvider {
  constructor() {
    super('GlobalTranz', 'GLOBALTRANZ');
    
    this.baseUrl = process.env.GLOBALTRANZ_API_URL || 'https://dev.gtzintegrate.com';
    this.subscriptionKey = process.env.GLOBALTRANZ_SUBSCRIPTION_KEY || 'bcc0ec4997814c74a854f9a738a58cbd';
    this.authToken = process.env.GLOBALTRANZ_AUTH_TOKEN || 'YXBpdGVzdGluZzpBZ2VudCU5OTk5';
    
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
    
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
      headers: {
        accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Basic ${this.authToken}`
      }
    });
  }

  async getRates(requestData) {
    try {
      console.log('🚚 GlobalTranz: Fetching rates...');
      console.log('   Base URL:', this.baseUrl);
      console.log('   Subscription Key:', this.subscriptionKey ? '***' + this.subscriptionKey.slice(-4) : 'Not set');

      const gtzRequest = this.buildRequest(requestData);
      console.log('📤 GlobalTranz request:', JSON.stringify(gtzRequest, null, 2));

      const endpoint = '/rate/ltl/v2';
      const fullUrl = `${endpoint}?subscription-key=${this.subscriptionKey}`;
      console.log(`🔍 Calling endpoint: ${this.baseUrl}${fullUrl}`);
      
      try {
        const response = await this.client.post(fullUrl, gtzRequest);
        console.log('✅ GlobalTranz API call successful');
        return this.parseResponse(response.data, requestData);
      } catch (error) {
        if (error.response && error.response.status === 422) {
          console.log('⚠️ GlobalTranz: No carriers available for this route');
          console.log('   Response:', error.response.data);
          return [];
        }
        throw error;
      }
    } catch (error) {
      console.error('❌ GlobalTranz error:', error.response?.data || error.message);
      if (error.response) console.error('   Status:', error.response.status);
      return [];
    }
  }

  buildRequest(requestData) {
    const pickupDate = requestData.pickupDate 
      ? new Date(requestData.pickupDate) 
      : new Date(Date.now() + 86400000); // Tomorrow
    
    const month = String(pickupDate.getMonth() + 1).padStart(2, '0');
    const day = String(pickupDate.getDate()).padStart(2, '0');
    const year = pickupDate.getFullYear();
    const formattedDate = `${month}/${day}/${year}`;

    const items = (requestData.commodities || []).map(item => {
      const quantity = parseInt(item.quantity || 1);
      const weight = Math.ceil(item.weight || 0);
      
      const gtzItem = {
        PieceCount: quantity,
        PalletCount: item.unitType === 'Pallets' ? quantity : 0,
        Weight: weight,
        WeightType: 1,
        ProductClass: parseFloat(item.freightClass || item.nmfcClass || item.calculatedClass || '50'),
        Description: item.description || 'General Freight',
        PackageType: this.getPackageType(item.unitType),
        Hazmat: item.hazmat || false,
        Stackable: item.stackable !== false
      };

      if (item.length) gtzItem.Length = Math.ceil(item.length);
      if (item.width) gtzItem.Width = Math.ceil(item.width);
      if (item.height) gtzItem.Height = Math.ceil(item.height);
      if (item.nmfc) gtzItem.NmfcNumber = item.nmfc;
      if (item.hazmat) gtzItem.HazmatClass = 10;

      return gtzItem;
    });

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

    const isStackable = items.some(i => i.Stackable);

    const request = {
      CustomerId: '012345',
      GuaranteedRates: false,
      PickupDate: formattedDate,
      Stackable: isStackable,
      TerminalPickup: false,
      ShipmentNew: false,
      Origin: {
        Street: requestData.origin?.address || '123 abc street',
        City: requestData.origin?.city || 'Phoenix',
        State: requestData.origin?.state || 'AZ',
        Zip: requestData.origin?.zipCode || '85008',
        Country: 'USA'
      },
      Destination: {
        Street: requestData.destination?.address || '321 xyz street',
        City: requestData.destination?.city || 'Navasota',
        State: requestData.destination?.state || 'TX',
        Zip: requestData.destination?.zipCode || '77868',
        Country: 'USA'
      },
      Items: items,
      Accessorials: accessorials
    };

    if (requestData.contactName) request.ContactName = requestData.contactName;
    if (requestData.valueOfGoods) request.ValueOfGoods = requestData.valueOfGoods;

    return request;
  }

  getPackageType(unitType) {
    const packageTypes = {
      Pallets: 0,
      Bags: 2,
      Bales: 3,
      Boxes: 4,
      Bundles: 16,
      Crates: 8,
      Drums: 10,
      Loose: 15,
      Pieces: 0,
      Rolls: 13,
      Totes: 17
    };
    return packageTypes[unitType] || 0;
  }

  // ==== UPDATED PER YOUR NOTES ====
  parseResponse(response, requestData) {
    console.log('📦 Parsing GlobalTranz response...');
    
    // 1) Unwrap RateResults → array, or accept array directly
    let quotes;
    if (response && Array.isArray(response.RateResults)) {
      quotes = response.RateResults;
    } else if (response && response.RateResults && typeof response.RateResults === 'object') {
      // Sometimes a single object can appear here
      quotes = [response.RateResults];
    } else if (Array.isArray(response)) {
      quotes = response;
    } else {
      console.log('⚠️ Unexpected response structure');
      try {
        console.log('   Preview:', JSON.stringify(response, null, 2).slice(0, 800));
      } catch (_) {}
      return [];
    }

    if (!quotes || quotes.length === 0) {
      console.log('⚠️ No quotes in response');
      return [];
    }

    console.log(`💰 Found ${quotes.length} carrier quotes via GlobalTranz`);

    const results = quotes.map(quote => {
      // 2) Use LtlAmount as the final total (don’t recompute)
      const totalCost = parseFloat(quote.LtlAmount || 0);

     // Charges breakdown: keep discount negative
let baseFreight = 0;
let fuelSurcharge = 0;
let discount = 0;
let accessorialTotal = 0;

// Carrier info (move this up here so we have carrierName)
const carrierName = quote.CarrierDetail?.CarrierName || 'Unknown Carrier';
const carrierCode = quote.CarrierDetail?.CarrierCode || 'UNK';

console.log(`\n📊 Pricing for ${carrierName}:`);

// Log quote-level fields ONCE, outside the loop
console.log(`   LtlAmount (Total): $${quote.LtlAmount}`);
console.log(`   LtlGrossCharge: $${quote.LtlGrossCharge}`);
console.log(`   LtlNetCharge: $${quote.LtlNetCharge}`);
console.log(`   LtlDiscountAmount: $${quote.LtlDiscountAmount}`);
console.log(`   LtlDiscountPercent: ${quote.LtlDiscountPercent}%`);

// Now log individual charges
if (quote.Charges && Array.isArray(quote.Charges)) {
  console.log(`   Charges breakdown:`);
  quote.Charges.forEach(charge => {
    console.log(`     - ${charge.Name}: $${charge.Charge} (Type: ${charge.Type || 'N/A'})`);
    
    const amount = parseFloat(charge.Charge || 0);
    const name = (charge.Name || '').toLowerCase();
    
    if (name.includes('initial') || name.includes('cost') || name.includes('base')) {
      baseFreight = amount;
    } else if (name.includes('fuel')) {
      fuelSurcharge = amount;
    } else if (name.includes('discount')) {
      discount = amount; // keep negative for math
    } else {
      accessorialTotal += amount;
    }
  });
}
      // Helpful derived metric (not used for total)
      const netFreight = (Number.isFinite(baseFreight) ? baseFreight : 0) + (Number.isFinite(discount) ? discount : 0);

      // Transit
      const transitDays = parseInt(quote.LtlServiceDays || quote.CalendarDays || '3', 10) || 3;
      console.log(`  • ${carrierName}: $${Number.isFinite(totalCost) ? totalCost.toFixed(2) : '0.00'} (${transitDays} days)`);

      return this.formatStandardResponse({
        provider: `GLOBALTRANZ_${carrierCode}`,
        carrier: carrierName, 
        carrierName,
        carrierCode,
        service: quote.LtlServiceTypeName || 'LTL Standard',

        baseFreight,
        discount,                 // negative if a discount applies
        fuelSurcharge,
        accessorialCharges: accessorialTotal,
        totalCost: Number.isFinite(totalCost) ? totalCost : 0,
        transitDays,
        guaranteed: !!(quote.GuaranteedRate || quote.IsGuaranteed),

        quoteId: quote.QuoteId || `GTZ-${carrierCode}-${Date.now()}`,
        validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        deliveryDate: quote.EstimatedDeliveryDate || quote.LtlDeliveryDate,

        brokerName: 'GlobalTranz',
        isBrokered: true,
        carrierOnTime: quote.CarrierDetail?.CarrierOnTimeforCustomer || 'N/A',
        customMessage: quote.CustomMessage || null,

        // For your tooltip/diagnostics
        priceBreakdown: {
          baseFreight,
          discount,        // negative
          netFreight,      // base + discount
          fuelSurcharge,
          accessorials: accessorialTotal,
          total: Number.isFinite(totalCost) ? totalCost : 0
        }
      });
    });

    // 3) Sort + filter zero/invalid totals
    results.sort((a, b) => (a.totalCost ?? 0) - (b.totalCost ?? 0));
    const validResults = results.filter(r => Number.isFinite(r.totalCost) && r.totalCost > 0);

    console.log(`\n✅ Returning ${validResults.length} valid carrier rates via GlobalTranz`);
    if (validResults.length > 0) {
      console.log(`   Best rate: ${validResults[0].carrierName} at $${validResults[0].totalCost.toFixed(2)}`);
      console.log(`   Highest rate: ${validResults[validResults.length - 1].carrierName} at $${validResults[validResults.length - 1].totalCost.toFixed(2)}`);
    }

    return validResults;
  }
  // ================================
}

module.exports = GlobalTranzProvider;
