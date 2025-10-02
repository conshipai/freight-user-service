// services/providers/ground/SEFLProvider.js
const BaseGroundProvider = require('./BaseGroundProvider');
const fs = require('fs');
const path = require('path');

class SEFLProvider extends BaseGroundProvider {
  constructor() {
    super('Southeastern Freight Lines', 'SEFL');
    this.baseUrl = 'https://www.sefl.com/webconnect/ratequotes/rest';
    this.username = process.env.SEFL_USERNAME || 'CONSHIP';
    this.password = process.env.SEFL_PASSWORD || 'CON712';
    this.accountNumber = process.env.SEFL_ACCOUNT || '999851099';
    this.maxPollAttempts = 10;
    this.pollDelay = 800; // ms between polls
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
      console.log('🚚 SEFL API CALL STARTING');
      console.log('='.repeat(80));
      console.log('📅 Timestamp:', new Date().toISOString());
      console.log('🔗 Base URL:', this.baseUrl);
      console.log('👤 Account:', this.accountNumber);

      // Step 1: Submit quote
      const formData = this.buildFormData(requestData);
      console.log('\n📤 SEFL FORM DATA:');
      // Convert URLSearchParams to object for logging
      const formObject = {};
      formData.forEach((value, key) => {
        formObject[key] = value;
      });
      console.log(JSON.stringify(formObject, null, 2));

      // Save request for debugging
      this.saveDebugLog('sefl_request', {
        timestamp: new Date().toISOString(),
        formData: formObject,
        originalRequest: requestData
      });

      const startTime = Date.now();
      const submitResult = await this.submitQuote(formData);
      const submitTime = Date.now() - startTime;

      console.log(`\n✅ SEFL SUBMIT RESPONSE (${submitTime}ms):`);
      console.log(JSON.stringify(submitResult, null, 2));

      // Save submit response
      this.saveDebugLog('sefl_submit_response', {
        timestamp: new Date().toISOString(),
        responseTime: submitTime,
        data: submitResult
      });

      // Analyze submit response fields
      console.log('\n🔍 SUBMIT RESPONSE ANALYSIS:');
      console.log('  Quote Number:', submitResult.quoteNumber || 'Not provided');
      console.log('  Error Occurred:', submitResult.errorOccured);
      console.log('  Error Message:', submitResult.errorMessage || 'None');
      
      // Log all fields in submit response
      console.log('\n  All Fields in Submit Response:');
      Object.keys(submitResult).forEach(key => {
        console.log(`    ${key}:`, submitResult[key]);
      });

      if (!submitResult.quoteNumber) {
        console.log('❌ SEFL: No quote number in response');
        return null;
      }

      console.log(`\n📋 SEFL Quote Number: ${submitResult.quoteNumber}`);
      console.log('⏳ Starting polling for rated quote...');

      // Step 2: Poll for rated quote
      const pollStartTime = Date.now();
      const detail = await this.pollForRate(submitResult.quoteNumber);
      const pollTime = Date.now() - pollStartTime;

      if (!detail) {
        console.log(`⚠️ SEFL: Quote not rated after ${this.maxPollAttempts} attempts (${pollTime}ms)`);
        return null;
      }

      console.log(`\n✅ SEFL RATE RESPONSE (${pollTime}ms):`);
      console.log(JSON.stringify(detail, null, 2));

      // Save rate response
      this.saveDebugLog('sefl_rate_response', {
        timestamp: new Date().toISOString(),
        quoteNumber: submitResult.quoteNumber,
        pollTime: pollTime,
        data: detail
      });

      // Analyze rate response
      console.log('\n🔍 RATE RESPONSE ANALYSIS:');
      console.log('  Status:', detail.status);
      console.log('  Quote Number:', detail.quoteNumber);
      console.log('  Rate Quote:', detail.rateQuote);
      console.log('  Transit Time:', detail.transitTime);
      
      // Service level analysis
      console.log('\n🎯 SERVICE LEVEL INFORMATION:');
      console.log('  Service Type:', detail.serviceType || 'Not provided');
      console.log('  Service Level:', detail.serviceLevel || 'Not provided');
      console.log('  Service Name:', detail.serviceName || 'Not provided');
      console.log('  Guaranteed:', detail.guaranteed || detail.isGuaranteed || 'Not specified');
      console.log('  Expedited:', detail.expedited || 'Not specified');
      console.log('  Priority:', detail.priority || 'Not specified');

      // Delivery date analysis
      console.log('\n📅 DELIVERY INFORMATION:');
      console.log('  Estimated Delivery:', detail.estimatedDelivery || 'Not provided');
      console.log('  Delivery Date:', detail.deliveryDate || 'Not provided');
      console.log('  Committed Delivery:', detail.committedDelivery || 'Not provided');
      console.log('  Transit Days:', detail.transitDays || detail.transitTime || 'Not provided');

      // Charges analysis
      if (detail.details && Array.isArray(detail.details)) {
        console.log('\n💵 CHARGES BREAKDOWN:');
        detail.details.forEach((charge, index) => {
          console.log(`  Charge #${index + 1}:`);
          console.log(`    Type Code: ${charge.typeCharge}`);
          console.log(`    Description: ${charge.description}`);
          console.log(`    Amount: $${charge.charges}`);
          console.log(`    All fields:`, JSON.stringify(charge, null, 2));
        });
      }

      // Log ALL fields in the detail response for discovery
      console.log('\n📌 ALL RATE RESPONSE FIELDS:');
      Object.keys(detail).forEach(key => {
        const value = detail[key];
        if (typeof value === 'object' && value !== null) {
          console.log(`  ${key}:`, JSON.stringify(value, null, 2));
        } else {
          console.log(`  ${key}:`, value);
        }
      });

      if (detail.status !== 'RAT') {
        console.log('⚠️ SEFL: Quote status is not RAT, status:', detail.status);
        return null;
      }

      console.log('\n✅ SEFL: Got rated quote successfully!');

      // Step 3: Map to normalized format
      const result = this.mapToNormalized(detail, requestData);
      
      console.log('\n📦 NORMALIZED RESULT:');
      console.log(JSON.stringify(result, null, 2));

      console.log('\n' + '='.repeat(80));
      console.log('✅ SEFL PROCESSING COMPLETE');
      console.log('='.repeat(80) + '\n');

      return result;

    } catch (error) {
      console.error('\n💥 SEFL FATAL ERROR:', error.message);
      if (error.stack) console.error('Stack:', error.stack);
      
      this.saveDebugLog('sefl_error', {
        timestamp: new Date().toISOString(),
        error: {
          message: error.message,
          stack: error.stack
        }
      });
      
      console.log('='.repeat(80) + '\n');
      return this.logError(error, 'getRates');
    }
  }

  buildFormData(req) {
    const pickupDate = new Date(req.pickupDate);
    const params = new URLSearchParams({
      // Account
      CustomerAccount: this.accountNumber,
      CustomerName: 'Conship',
      CustomerCity: req.origin.city,
      CustomerState: req.origin.state,
      CustomerZip: req.origin.zipCode,

      // Shipment
      Option: 'S',
      Terms: 'P',

      // Date
      PickupDateMM: String(pickupDate.getMonth() + 1).padStart(2, '0'),
      PickupDateDD: String(pickupDate.getDate()).padStart(2, '0'),
      PickupDateYYYY: String(pickupDate.getFullYear()),

      // Locations
      OriginCity: req.origin.city,
      OriginState: req.origin.state,
      OriginZip: req.origin.zipCode,
      DestinationCity: req.destination.city,
      DestinationState: req.destination.state,
      DestinationZip: req.destination.zipCode,

      DimsOption: 'I'
    });

    // Add pieces
    req.commodities?.forEach((item, i) => {
      const n = i + 1;
      params.set(`NumberOfUnits${n}`, String(item.quantity));
      params.set(`PieceLength${n}`, String(Math.round(item.length)));
      params.set(`PieceWidth${n}`, String(Math.round(item.width)));
      params.set(`PieceHeight${n}`, String(Math.round(item.height)));
      params.set(`UnitOfMeasure${n}`, 'I');
      params.set(`Weight${n}`, String(Math.round(item.weight)));
      params.set(`WeightUnitOfMeasure${n}`, 'LBS');
      params.set(`Description${n}`, item.description || 'General Merchandise');
    });

    // Add accessorials
    const acc = req.accessorials;
    if (acc?.residentialPickup) params.set('ResidentialPickup', 'Y');
    if (acc?.residentialDelivery) params.set('ResidentialDelivery', 'Y');
    if (acc?.liftgatePickup) params.set('LiftgatePickup', 'Y');
    if (acc?.liftgateDelivery) params.set('LiftgateDelivery', 'Y');
    if (acc?.insidePickup) params.set('InsidePickup', 'Y');
    if (acc?.insideDelivery) params.set('InsideDelivery', 'Y');
    if (acc?.limitedAccessPickup) params.set('LimitedAccessPickup', 'Y');
    if (acc?.limitedAccessDelivery) params.set('LimitedAccessDelivery', 'Y');

    return params;
  }

  async submitQuote(formData) {
    console.log(`\n🌐 Calling: POST ${this.baseUrl}/submitQuote`);
    
    const response = await fetch(`${this.baseUrl}/submitQuote`, {
      method: 'POST',
      headers: {
        'Authorization': this.getAuthHeader(),
        'Accept': 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: formData.toString()
    });

    console.log(`   Response Status: ${response.status} ${response.statusText}`);
    console.log(`   Response Headers:`, response.headers);

    if (!response.ok) {
      const errorText = await response.text();
      console.log(`   Error Response Body:`, errorText);
      throw new Error(`SEFL submit failed: ${response.status} - ${errorText}`);
    }

    const data = await response.json();

    if (data.errorOccured === 'true') {
      throw new Error(data.errorMessage || 'SEFL submit error');
    }

    return data;
  }

  async pollForRate(quoteNumber) {
    for (let i = 0; i < this.maxPollAttempts; i++) {
      console.log(`\n   Poll attempt ${i + 1}/${this.maxPollAttempts} for quote ${quoteNumber}`);
      
      const pollUrl = `${this.baseUrl}/${quoteNumber}?ReturnDetail=Y`;
      console.log(`   🌐 GET ${pollUrl}`);
      
      const response = await fetch(pollUrl, {
        headers: {
          'Authorization': this.getAuthHeader(),
          'Accept': 'application/json'
        }
      });

      console.log(`   Response Status: ${response.status}`);

      if (!response.ok) {
        const errorText = await response.text();
        console.log(`   Error Response:`, errorText);
        throw new Error(`SEFL fetch failed: ${response.status} - ${errorText}`);
      }

      const detail = await response.json();
      console.log(`   Status: ${detail.status}`);

      if (detail.status === 'RAT') {
        console.log(`   ✅ Quote rated successfully!`);
        return detail;
      }

      if (detail.status === 'ERR') {
        console.log(`   ❌ Quote error: ${detail.errorMessage}`);
        throw new Error(detail.errorMessage || 'Quote error');
      }

      console.log(`   ⏳ Quote not ready, waiting ${this.pollDelay}ms...`);
      await new Promise(resolve => setTimeout(resolve, this.pollDelay));
    }

    return null;
  }

  mapToNormalized(detail, requestData) {
    console.log('\n📊 MAPPING TO NORMALIZED FORMAT');
    
    const round2 = (n) => {
      const v = Math.round((Number(n) || 0) * 100) / 100;
      return Math.abs(v) < 0.005 ? 0 : v;
    };

    const total = round2(parseFloat(detail.rateQuote));
    console.log('  Total from rateQuote:', total);

    // Parse charge lines
    const charges = (detail.details || []).map(d => ({
      code: (d.typeCharge || '').trim(),
      description: (d.description || '').trim(),
      amount: round2(parseFloat(d.charges))
    }));

    // Extract specific charges
    const baseCharge = charges.find(c => c.code === 'MFC');
    const fuelCharge = charges.find(c => c.code === 'FS');

    const baseAmount = round2(baseCharge?.amount);
    const fuelAmount = round2(fuelCharge?.amount);
    let accessorialAmount = round2(total - baseAmount - fuelAmount);

    if (Math.abs(accessorialAmount) < 0.01) {
      accessorialAmount = 0;
    }

    console.log('  Base Freight:', baseAmount);
    console.log('  Fuel Surcharge:', fuelAmount);
    console.log('  Accessorials:', accessorialAmount);
    console.log('  Transit Days:', detail.transitTime);

    // QUOTE NUMBER COMES FROM THE CARRIER!
    const quoteId = detail.quoteNumber || `SEFL-${Date.now()}`;
    console.log('  Quote ID from SEFL:', detail.quoteNumber || 'Not provided, using fallback');

    // Extract service level if available
    const serviceName = detail.serviceType || detail.serviceName || detail.serviceLevel || 'Standard LTL';
    const isGuaranteed = detail.guaranteed === true || detail.guaranteed === 'Y' || detail.isGuaranteed === true;

    return this.formatStandardResponse({
      service: serviceName,
      baseFreight: baseAmount,
      fuelSurcharge: fuelAmount,
      accessorialCharges: accessorialAmount,
      totalCost: total,
      transitDays: parseInt(detail.transitTime, 10) || 3,
      guaranteed: isGuaranteed,
      quoteId: quoteId,
      validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      deliveryDate: detail.estimatedDelivery || detail.deliveryDate || null,
      
      // Store raw response for debugging
      rawResponse: detail,
      
      priceBreakdown: {
        baseFreight: baseAmount,
        discount: 0,
        fuelSurcharge: fuelAmount,
        accessorials: accessorialAmount,
        total: total
      }
    });
  }

  getAuthHeader() {
    const credentials = Buffer.from(`${this.username}:${this.password}`).toString('base64');
    return `Basic ${credentials}`;
  }
}

module.exports = SEFLProvider;
