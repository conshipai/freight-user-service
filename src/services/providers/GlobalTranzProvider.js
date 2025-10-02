// src/services/providers/GlobalTranzProvider.js
const BaseGroundProvider = require('./ground/BaseGroundProvider');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

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

  // Helper to save API responses for debugging
  saveDebugLog(filename, data) {
    try {
      const debugDir = path.join(process.cwd(), 'debug_logs');
      if (!fs.existsSync(debugDir)) {
        fs.mkdirSync(debugDir, { recursive: true });
      }
      
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filepath = path.join(debugDir, `${filename}_${timestamp}.json`);
      
      fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
      console.log(`📝 Debug log saved: ${filepath}`);
    } catch (error) {
      console.log('Could not save debug log:', error.message);
    }
  }

  async getRates(requestData) {
    try {
      console.log('\n' + '='.repeat(80));
      console.log('🚚 GLOBALTRANZ API CALL STARTING');
      console.log('='.repeat(80));
      console.log('📅 Timestamp:', new Date().toISOString());
      console.log('🔗 Base URL:', this.baseUrl);
      console.log('🔑 Subscription Key:', this.subscriptionKey ? '***' + this.subscriptionKey.slice(-4) : 'Not set');

      const gtzRequest = this.buildRequest(requestData);
      
      console.log('\n📤 REQUEST PAYLOAD:');
      console.log(JSON.stringify(gtzRequest, null, 2));
      
      // Save request for debugging
      this.saveDebugLog('globaltranz_request', {
        timestamp: new Date().toISOString(),
        request: gtzRequest,
        originalRequest: requestData
      });

      const endpoint = '/rate/ltl/v2';
      const fullUrl = `${endpoint}?subscription-key=${this.subscriptionKey}`;
      console.log(`\n🔍 Full Endpoint: ${this.baseUrl}${fullUrl}`);
      
      const startTime = Date.now();
      
      try {
        const response = await this.client.post(fullUrl, gtzRequest);
        
        const responseTime = Date.now() - startTime;
        console.log(`\n✅ GLOBALTRANZ API RESPONSE RECEIVED (${responseTime}ms)`);
        console.log('📊 Status Code:', response.status);
        console.log('📋 Response Headers:', JSON.stringify(response.headers, null, 2));
        
        console.log('\n📥 FULL RAW RESPONSE:');
        console.log(JSON.stringify(response.data, null, 2));
        
        // Save response for debugging
        this.saveDebugLog('globaltranz_response', {
          timestamp: new Date().toISOString(),
          statusCode: response.status,
          responseTime: responseTime,
          headers: response.headers,
          data: response.data
        });
        
        return this.parseResponse(response.data, requestData);
        
      } catch (error) {
        const responseTime = Date.now() - startTime;
        
        if (error.response && error.response.status === 422) {
          console.log(`\n⚠️ GLOBALTRANZ: No carriers available (${responseTime}ms)`);
          console.log('📊 Status Code:', error.response.status);
          console.log('📝 Response:', JSON.stringify(error.response.data, null, 2));
          
          this.saveDebugLog('globaltranz_no_carriers', {
            timestamp: new Date().toISOString(),
            statusCode: error.response.status,
            responseTime: responseTime,
            data: error.response.data
          });
          
          return [];
        }
        
        console.log(`\n❌ GLOBALTRANZ API ERROR (${responseTime}ms)`);
        console.log('Error Type:', error.name);
        console.log('Error Message:', error.message);
        
        if (error.response) {
          console.log('📊 Status Code:', error.response.status);
          console.log('📝 Error Response:', JSON.stringify(error.response.data, null, 2));
          
          this.saveDebugLog('globaltranz_error', {
            timestamp: new Date().toISOString(),
            statusCode: error.response.status,
            responseTime: responseTime,
            errorData: error.response.data,
            errorMessage: error.message
          });
        }
        
        throw error;
      }
    } catch (error) {
      console.error('\n💥 GLOBALTRANZ FATAL ERROR:', error.message);
      console.log('='.repeat(80) + '\n');
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

  parseResponse(response, requestData) {
    console.log('\n' + '-'.repeat(80));
    console.log('📦 PARSING GLOBALTRANZ RESPONSE');
    console.log('-'.repeat(80));
    
    // 1) Unwrap RateResults → array, or accept array directly
    let quotes;
    if (response && Array.isArray(response.RateResults)) {
      quotes = response.RateResults;
      console.log('✅ Found RateResults array with', quotes.length, 'quotes');
    } else if (response && response.RateResults && typeof response.RateResults === 'object') {
      quotes = [response.RateResults];
      console.log('✅ Found single RateResults object, converting to array');
    } else if (Array.isArray(response)) {
      quotes = response;
      console.log('✅ Response is already an array with', quotes.length, 'quotes');
    } else {
      console.log('⚠️ Unexpected response structure');
      return [];
    }

    if (!quotes || quotes.length === 0) {
      console.log('⚠️ No quotes in response');
      return [];
    }

    console.log(`\n💰 Processing ${quotes.length} carrier quotes via GlobalTranz:`);
    console.log('-'.repeat(40));

    const results = quotes.map((quote, index) => {
      console.log(`\n📊 QUOTE #${index + 1} DETAILS:`);
      console.log('='.repeat(40));
      
      // Log ALL fields in the quote for analysis
      console.log('🔍 ALL QUOTE FIELDS:');
      Object.keys(quote).forEach(key => {
        const value = quote[key];
        if (typeof value === 'object' && value !== null) {
          console.log(`  ${key}:`, JSON.stringify(value, null, 2));
        } else {
          console.log(`  ${key}:`, value);
        }
      });

      // Extract carrier info
      const carrierName = quote.CarrierDetail?.CarrierName || 'Unknown Carrier';
      const carrierCode = quote.CarrierDetail?.CarrierCode || 'UNK';
      
      console.log('\n🚛 CARRIER INFORMATION:');
      console.log(`  Name: ${carrierName}`);
      console.log(`  Code: ${carrierCode}`);
      if (quote.CarrierDetail) {
        console.log('  Full Carrier Detail:', JSON.stringify(quote.CarrierDetail, null, 2));
      }

      // Quote ID from carrier (THIS IS WHERE QUOTE NUMBER COMES FROM!)
      const quoteId = quote.QuoteId || quote.QuoteNumber || quote.RateQuoteNumber || `GTZ-${carrierCode}-${Date.now()}`;
      console.log('\n📋 QUOTE IDENTIFICATION:');
      console.log(`  QuoteId from API: ${quote.QuoteId || 'Not provided'}`);
      console.log(`  QuoteNumber from API: ${quote.QuoteNumber || 'Not provided'}`);
      console.log(`  RateQuoteNumber from API: ${quote.RateQuoteNumber || 'Not provided'}`);
      console.log(`  Final Quote ID used: ${quoteId}`);

      // Service Level and Guaranteed Status
      console.log('\n🎯 SERVICE LEVEL:');
      console.log(`  LtlServiceTypeName: ${quote.LtlServiceTypeName || 'Not provided'}`);
      console.log(`  ServiceType: ${quote.ServiceType || 'Not provided'}`);
      console.log(`  ServiceLevel: ${quote.ServiceLevel || 'Not provided'}`);
      console.log(`  GuaranteedRate: ${quote.GuaranteedRate}`);
      console.log(`  IsGuaranteed: ${quote.IsGuaranteed}`);
      console.log(`  Guaranteed (any field): ${!!(quote.GuaranteedRate || quote.IsGuaranteed)}`);

      // Transit Time and Delivery
      console.log('\n📅 TRANSIT & DELIVERY:');
      console.log(`  LtlServiceDays: ${quote.LtlServiceDays}`);
      console.log(`  CalendarDays: ${quote.CalendarDays}`);
      console.log(`  TransitDays: ${quote.TransitDays}`);
      console.log(`  BusinessDays: ${quote.BusinessDays}`);
      console.log(`  EstimatedDeliveryDate: ${quote.EstimatedDeliveryDate}`);
      console.log(`  LtlDeliveryDate: ${quote.LtlDeliveryDate}`);
      console.log(`  CommittedDeliveryDate: ${quote.CommittedDeliveryDate}`);

      // Pricing
      console.log('\n💵 PRICING FIELDS:');
      console.log(`  LtlAmount (Total): $${quote.LtlAmount}`);
      console.log(`  LtlGrossCharge: $${quote.LtlGrossCharge}`);
      console.log(`  LtlNetCharge: $${quote.LtlNetCharge}`);
      console.log(`  LtlDiscountAmount: $${quote.LtlDiscountAmount}`);
      console.log(`  LtlDiscountPercent: ${quote.LtlDiscountPercent}%`);
      console.log(`  TotalCharge: $${quote.TotalCharge}`);
      console.log(`  TotalAmount: $${quote.TotalAmount}`);

      const totalCost = parseFloat(quote.LtlAmount || 0);

      // Process charges breakdown
      let baseFreight = 0;
      let grossFreight = 0;
      let fuelSurcharge = 0;
      let discount = 0;
      let accessorialTotal = 0;

      if (quote.Charges && Array.isArray(quote.Charges)) {
        console.log('\n📝 CHARGES BREAKDOWN:');
        quote.Charges.forEach((charge, chargeIndex) => {
          console.log(`  Charge #${chargeIndex + 1}:`);
          console.log(`    Name: ${charge.Name}`);
          console.log(`    Charge: $${charge.Charge}`);
          console.log(`    Type: ${charge.Type || 'N/A'}`);
          console.log(`    Code: ${charge.Code || 'N/A'}`);
          
          const amount = parseFloat(charge.Charge || 0);
          const name = (charge.Name || '').toLowerCase();
          
          if (name.includes('initial') || name.includes('cost') || name.includes('base')) {
            grossFreight = amount;
            baseFreight = amount;
          } else if (name.includes('fuel')) {
            fuelSurcharge = amount;
          } else if (name.includes('discount')) {
            discount = amount;
          } else {
            accessorialTotal += amount;
          }
        });
      }

      // Apply discount to base freight
      if (discount < 0 && baseFreight > 0) {
        baseFreight = grossFreight + discount;
        console.log(`\n💡 Adjusted base after discount: $${baseFreight.toFixed(2)} (gross: $${grossFreight.toFixed(2)}, discount: ${discount.toFixed(2)})`);
      }

      const transitDays = parseInt(quote.LtlServiceDays || quote.CalendarDays || quote.TransitDays || '3', 10) || 3;

      // Additional fields that might be useful
      console.log('\n📌 OTHER NOTABLE FIELDS:');
      if (quote.CustomMessage) console.log(`  CustomMessage: ${quote.CustomMessage}`);
      if (quote.Notes) console.log(`  Notes: ${quote.Notes}`);
      if (quote.SpecialInstructions) console.log(`  SpecialInstructions: ${quote.SpecialInstructions}`);
      if (quote.CarrierNotes) console.log(`  CarrierNotes: ${quote.CarrierNotes}`);

      console.log('\n' + '='.repeat(40));

      return this.formatStandardResponse({
        provider: `GLOBALTRANZ_${carrierCode}`,
        carrier: carrierName, 
        carrierName,
        carrierCode,
        service: quote.LtlServiceTypeName || quote.ServiceType || 'LTL Standard',

        baseFreight,
        discount: 0,
        fuelSurcharge,
        accessorialCharges: accessorialTotal,
        totalCost: Number.isFinite(totalCost) ? totalCost : 0,
        transitDays,
        guaranteed: !!(quote.GuaranteedRate || quote.IsGuaranteed),

        quoteId: quoteId,
        validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        deliveryDate: quote.EstimatedDeliveryDate || quote.LtlDeliveryDate || quote.CommittedDeliveryDate,

        brokerName: 'GlobalTranz',
        isBrokered: true,
        carrierOnTime: quote.CarrierDetail?.CarrierOnTimeforCustomer || 'N/A',
        customMessage: quote.CustomMessage || quote.Notes || null,

        // Store raw response for debugging
        rawResponse: quote,

        priceBreakdown: {
          baseFreight: grossFreight,
          discount: discount,
          netFreight: baseFreight,
          fuelSurcharge,
          accessorials: accessorialTotal,
          total: Number.isFinite(totalCost) ? totalCost : 0
        }
      });
    });

    results.sort((a, b) => (a.totalCost ?? 0) - (b.totalCost ?? 0));
    const validResults = results.filter(r => Number.isFinite(r.totalCost) && r.totalCost > 0);

    console.log('\n' + '='.repeat(80));
    console.log(`✅ GLOBALTRANZ PROCESSING COMPLETE`);
    console.log(`   Valid rates returned: ${validResults.length}`);
    if (validResults.length > 0) {
      console.log(`   Best rate: ${validResults[0].carrierName} at $${validResults[0].totalCost.toFixed(2)}`);
      console.log(`   Highest rate: ${validResults[validResults.length - 1].carrierName} at $${validResults[validResults.length - 1].totalCost.toFixed(2)}`);
    }
    console.log('='.repeat(80) + '\n');

    return validResults;
  }
}

module.exports = GlobalTranzProvider;
