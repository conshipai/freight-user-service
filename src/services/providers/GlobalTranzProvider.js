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
        
        const rates = this.parseResponse(response.data, requestData);
        return rates;
        
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
      if (error.response) {
        console.error('   Status:', error.response.status);
      }
      return [];
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

      if (item.length) gtzItem.Length = Math.ceil(item.length);
      if (item.width) gtzItem.Width = Math.ceil(item.width);
      if (item.height) gtzItem.Height = Math.ceil(item.height);
      if (item.nmfc) gtzItem.NmfcNumber = item.nmfc;
      if (item.hazmat) gtzItem.HazmatClass = 10;

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

    const isStackable = items.some(i => i.Stackable);

    const request = {
      CustomerId: '012345', // Test customer ID from docs
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
    return packageTypes[unitType] || 0; // Default to pallets
  }

  // ===================== UPDATED FUNCTION =====================
  parseResponse(response, requestData) {
    console.log('📦 Parsing GlobalTranz response...');
    console.log('📥 RAW response type:', typeof response, ' | isArray:', Array.isArray(response));
    try {
      const preview = JSON.stringify(response, null, 2);
      console.log('📥 Response preview:', preview.length > 1000 ? preview.slice(0, 1000) + '…' : preview);
    } catch (_) {
      console.log('📥 Response preview: [unserializable]');
    }

    // Normalize various possible response shapes into an array of quote objects
    const normalizeToQuoteArray = (resp) => {
      if (!resp) return [];

      if (Array.isArray(resp)) return resp;

      // Common wrappers that might hold the quotes array
      const candidates = [
        resp.quotes,
        resp.Quotes,
        resp.data,
        resp.Data,
        resp.results,
        resp.Results,
        resp.ltlRates,
        resp.LtlRates,
        resp.LtlRateList,
        resp.Rates,
        resp.rateResults,
        resp.RateResults
      ].filter(Boolean);

      for (const c of candidates) {
        if (Array.isArray(c)) return c;
      }

      // Some APIs return a single quote object
      if (typeof resp === 'object' && (resp.LtlAmount || resp.CarrierDetail)) {
        return [resp];
      }

      return [];
    };

    const quotes = normalizeToQuoteArray(response);

    if (!Array.isArray(quotes) || quotes.length === 0) {
      console.log('⚠️ No quotes found after normalization');
      return [];
    }

    console.log(`💰 Found ${quotes.length} carrier quotes via GlobalTranz`);

    const results = quotes.map(quote => {
      // Carrier info
      const carrierName = quote.CarrierDetail?.CarrierName || 'Unknown Carrier';
      const carrierCode = quote.CarrierDetail?.CarrierCode || 'UNK';

      // Total cost (string -> number) with fallbacks
      const totalCost = parseFloat(
        quote.LtlAmount ?? quote.Total ?? quote.TotalPrice ?? quote.Amount ?? 0
      );

      // Charges breakdown
      let baseFreight = 0;
      let fuelSurcharge = 0;
      let discount = 0; // keep negative if provided negative

      let accessorialTotal = 0;

      if (Array.isArray(quote.Charges)) {
        quote.Charges.forEach(charge => {
          const amount = parseFloat(charge.Charge ?? charge.Amount ?? 0);
          const name = (charge.Name || '').toLowerCase();

          if (name.includes('initial') || name.includes('base') || name.includes('cost')) {
            baseFreight = amount;
          } else if (name.includes('fuel')) {
            fuelSurcharge = amount;
          } else if (name.includes('discount')) {
            discount = amount; // negative stays negative for math
          } else if (name.includes('metro') || (charge.AccessorialID ?? 0) > 10) {
            accessorialTotal += amount;
          }
        });
      }

      // Net freight math (base + discount where discount may be negative)
      const netFreight = (Number.isFinite(baseFreight) ? baseFreight : 0) + (Number.isFinite(discount) ? discount : 0);

      // Transit days
      const transitDaysRaw = quote.LtlServiceDays ?? quote.CalendarDays ?? '3';
      const transitDaysParsed = parseInt(String(transitDaysRaw), 10);
      const transitDays = Number.isFinite(transitDaysParsed) ? transitDaysParsed : 3;

      console.log(`  • ${carrierName}: $${Number.isFinite(totalCost) ? totalCost.toFixed(2) : '0.00'} (${transitDays} days)`);

      return this.formatStandardResponse({
        provider: `GLOBALTRANZ_${carrierCode}`,
        carrierName,
        carrierCode,
        service: quote.LtlServiceTypeName || 'LTL Standard',

        // expose gross/discount/net distinctly
        baseFreight,
        discount,                 // negative values reduce the base
        fuelSurcharge,
        accessorialCharges: accessorialTotal,
        totalCost: Number.isFinite(totalCost) ? totalCost : 0,
        transitDays,
        guaranteed: !!(quote.GuaranteedRate || quote.IsGuaranteed),

        quoteId: quote.QuoteId || `GTZ-${carrierCode}-${Date.now()}`,
        validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        deliveryDate: quote.EstimatedDeliveryDate || quote.LtlDeliveryDate,

        // Meta
        brokerName: 'GlobalTranz',
        isBrokered: true,
        carrierOnTime: quote.CarrierDetail?.CarrierOnTimeforCustomer || 'N/A',
        customMessage: quote.CustomMessage || null,

        // Helpful breakdown for UI/debug
        priceBreakdown: {
          baseFreight,
          discount,       // negative
          netFreight,     // base + discount
          fuelSurcharge,
          accessorials: accessorialTotal,
          total: Number.isFinite(totalCost) ? totalCost : 0
        }
      });
    });

    // Sort by price then filter invalid/zero totals
    results.sort((a, b) => (a.totalCost ?? 0) - (b.totalCost ?? 0));
    const validResults = results.filter(rate => Number.isFinite(rate.totalCost) && rate.totalCost > 0);

    console.log(`\n✅ Returning ${validResults.length} valid carrier rates via GlobalTranz`);
    if (validResults.length > 0) {
      console.log(`   Best rate: ${validResults[0].carrierName} at $${validResults[0].totalCost.toFixed(2)}`);
      console.log(`   Highest rate: ${validResults[validResults.length - 1].carrierName} at $${validResults[validResults.length - 1].totalCost.toFixed(2)}`);
    }

    return validResults;
  }
  // ============================================================
}

module.exports = GlobalTranzProvider;
