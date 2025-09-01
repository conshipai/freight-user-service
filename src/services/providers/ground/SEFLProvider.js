// services/providers/ground/SEFLProvider.js
const BaseGroundProvider = require('./BaseGroundProvider');

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

  async getRates(requestData) {
  try {
    // Step 1: Submit quote
    const formData = this.buildFormData(requestData);
    console.log('📤 SEFL: Submitting quote with form data...');
    
    const submitResult = await this.submitQuote(formData);
    console.log('📥 SEFL Submit Response:', JSON.stringify(submitResult, null, 2));
    
    if (!submitResult.quoteNumber) {
      console.log('❌ SEFL: No quote number in response');
      return null;
    }
    
    console.log(`✅ SEFL: Quote ${submitResult.quoteNumber} submitted, starting polling...`);
    
    // Step 2: Poll for rated quote
    const detail = await this.pollForRate(submitResult.quoteNumber);
    console.log('📥 SEFL Rate Response:', JSON.stringify(detail, null, 2));
    
    if (!detail || detail.status !== 'RAT') {
      console.log('⚠️ SEFL: Quote not rated after polling, status:', detail?.status);
      return null;
    }
    
    console.log('✅ SEFL: Got rated quote!');
    
    // Step 3: Map to normalized format
    return this.mapToNormalized(detail, requestData);
    
  } catch (error) {
    console.error('❌ SEFL Error:', error.message);
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
    const response = await fetch(`${this.baseUrl}/submitQuote`, {
      method: 'POST',
      headers: {
        'Authorization': this.getAuthHeader(),
        'Accept': 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: formData.toString()
    });

    if (!response.ok) {
      throw new Error(`SEFL submit failed: ${response.status}`);
    }

    const data = await response.json();
    
    if (data.errorOccured === 'true') {
      throw new Error(data.errorMessage || 'SEFL submit error');
    }
    
    return data;
  }

  async pollForRate(quoteNumber) {
    for (let i = 0; i < this.maxPollAttempts; i++) {
      const response = await fetch(
        `${this.baseUrl}/${quoteNumber}?ReturnDetail=Y`,
        {
          headers: {
            'Authorization': this.getAuthHeader(),
            'Accept': 'application/json'
          }
        }
      );

      if (!response.ok) {
        throw new Error(`SEFL fetch failed: ${response.status}`);
      }

      const detail = await response.json();
      
      if (detail.status === 'RAT') {
        return detail;
      }
      
      if (detail.status === 'ERR') {
        throw new Error(detail.errorMessage || 'Quote error');
      }
      
      // Wait before next attempt
      await new Promise(resolve => setTimeout(resolve, this.pollDelay));
    }
    
    return null;
  }

  mapToNormalized(detail, requestData) {
    const total = parseFloat(detail.rateQuote) || 0;
    
    // Parse charge lines
    const charges = (detail.details || []).map(d => ({
      code: (d.typeCharge || '').trim(),
      description: (d.description || '').trim(),
      amount: parseFloat(d.charges) || 0
    }));

    // Extract specific charges
    const baseCharge = charges.find(c => c.code === 'MFC');
    const fuelCharge = charges.find(c => c.code === 'FS');
    
    const baseAmount = baseCharge?.amount || 0;
    const fuelAmount = fuelCharge?.amount || 0;
    const accessorialAmount = total - baseAmount - fuelAmount;

    // Return in your standard format
    return this.formatStandardResponse({
      service: 'Standard LTL',
      baseFreight: baseAmount,
      fuelSurcharge: fuelAmount,
      accessorialCharges: accessorialAmount > 0 ? accessorialAmount : 0,
      transitDays: parseInt(detail.transitTime) || 3,
      guaranteed: false,
      quoteId: detail.quoteNumber,
      validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    });
  }

  getAuthHeader() {
    const credentials = Buffer.from(`${this.username}:${this.password}`).toString('base64');
    return `Basic ${credentials}`;
  }
}

module.exports = SEFLProvider;
