// services/providers/ground/SEFLProvider.js
const BaseGroundProvider = require('./BaseGroundProvider');
const FormData = require('form-data');

class SEFLProvider extends BaseGroundProvider {
  constructor() {
    super('Southeastern Freight Lines', 'SEFL');
    this.apiUrl = 'https://www.sefl.com/webconnect/ratequotes/rest';
    this.username = process.env.SEFL_USERNAME || 'CONSHIP';
    this.password = process.env.SEFL_PASSWORD || 'CON712';
    this.accountNumber = process.env.SEFL_ACCOUNT || '999851099';
    this.maxPollAttempts = 10;
    this.pollDelay = 2000; // 2 seconds between polls
  }

  async getRates(requestData) {
    try {
      console.log('📤 SEFL: Submitting quote request');
      
      // Step 1: Submit the quote
      const quoteNumber = await this.submitQuote(requestData);
      if (!quoteNumber) {
        return null;
      }
      
      console.log(`📋 SEFL: Quote number ${quoteNumber} received, polling for rate...`);
      
      // Step 2: Poll for the rated quote
      const ratedQuote = await this.pollForRate(quoteNumber);
      if (!ratedQuote) {
        return null;
      }
      
      console.log('✅ SEFL: Rate received');
      
      // Step 3: Parse and return in standard format
      return this.parseRatedQuote(ratedQuote, quoteNumber);
      
    } catch (error) {
      return this.logError(error, 'getRates');
    }
  }

  async submitQuote(requestData) {
    try {
      // Build form data
      const formData = this.buildFormData(requestData);
      
      // Create URL encoded string
      const params = new URLSearchParams(formData).toString();
      
      const response = await fetch(`${this.apiUrl}/submitQuote`, {
        method: 'POST',
        headers: {
          'Authorization': this.getAuthHeader(),
          'Accept': 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: params
      });

      if (!response.ok) {
        throw new Error(`Submit failed with status ${response.status}`);
      }

      const data = await response.json();
      
      if (data.errorOccured === 'true' || !data.quoteNumber) {
        throw new Error(data.errorMessage || 'No quote number returned');
      }

      return data.quoteNumber;
      
    } catch (error) {
      this.logError(error, 'submitQuote');
      return null;
    }
  }

  buildFormData(requestData) {
    const pickupDate = new Date(requestData.pickupDate);
    
    const formData = {
      // Account info
      CustomerAccount: this.accountNumber,
      CustomerName: 'Conship',
      CustomerCity: requestData.origin.city,
      CustomerState: requestData.origin.state,
      CustomerZip: requestData.origin.zipCode,
      
      // Shipment options
      Option: 'S', // Standard
      Terms: 'P', // Prepaid
      
      // Pickup date
      PickupDateMM: String(pickupDate.getMonth() + 1).padStart(2, '0'),
      PickupDateDD: String(pickupDate.getDate()).padStart(2, '0'),
      PickupDateYYYY: String(pickupDate.getFullYear()),
      
      // Origin
      OriginCity: requestData.origin.city,
      OriginState: requestData.origin.state,
      OriginZip: requestData.origin.zipCode,
      
      // Destination
      DestinationCity: requestData.destination.city,
      DestinationState: requestData.destination.state,
      DestinationZip: requestData.destination.zipCode,
      
      // Dimensions flag
      DimsOption: 'I' // Individual piece dimensions
    };

    // Add commodities
    requestData.commodities.forEach((item, index) => {
      const suffix = index + 1;
      formData[`NumberOfUnits${suffix}`] = item.quantity;
      formData[`PieceLength${suffix}`] = Math.round(item.length);
      formData[`PieceWidth${suffix}`] = Math.round(item.width);
      formData[`PieceHeight${suffix}`] = Math.round(item.height);
      formData[`UnitOfMeasure${suffix}`] = 'I'; // Inches
      formData[`Weight${suffix}`] = Math.round(item.weight);
      formData[`WeightUnitOfMeasure${suffix}`] = 'LBS';
      formData[`Description${suffix}`] = item.description || 'General Merchandise';
    });

    // Add accessorials
    if (requestData.accessorials) {
      if (requestData.accessorials.residentialPickup) {
        formData.ResidentialPickup = 'Y';
      }
      if (requestData.accessorials.residentialDelivery) {
        formData.ResidentialDelivery = 'Y';
      }
      if (requestData.accessorials.liftgatePickup) {
        formData.LiftgatePickup = 'Y';
      }
      if (requestData.accessorials.liftgateDelivery) {
        formData.LiftgateDelivery = 'Y';
      }
      if (requestData.accessorials.insidePickup) {
        formData.InsidePickup = 'Y';
      }
      if (requestData.accessorials.insideDelivery) {
        formData.InsideDelivery = 'Y';
      }
      if (requestData.accessorials.limitedAccessPickup) {
        formData.LimitedAccessPickup = 'Y';
      }
      if (requestData.accessorials.limitedAccessDelivery) {
        formData.LimitedAccessDelivery = 'Y';
      }
      if (requestData.accessorials.appointmentRequired) {
        formData.AppointmentDelivery = 'Y';
      }
    }

    return formData;
  }

  async pollForRate(quoteNumber) {
    for (let attempt = 1; attempt <= this.maxPollAttempts; attempt++) {
      try {
        const response = await fetch(
          `${this.apiUrl}/${quoteNumber}?ReturnDetail=Y`,
          {
            headers: {
              'Authorization': this.getAuthHeader(),
              'Accept': 'application/json'
            }
          }
        );

        if (!response.ok) {
          throw new Error(`Poll failed with status ${response.status}`);
        }

        const data = await response.json();
        
        if (data.status === 'RAT') {
          return data; // Quote is rated!
        }
        
        if (data.status === 'ERR') {
          throw new Error(data.errorMessage || 'Quote error');
        }
        
        // Still processing, wait and try again
        console.log(`⏳ SEFL: Attempt ${attempt}/${this.maxPollAttempts} - Status: ${data.status}`);
        await new Promise(resolve => setTimeout(resolve, this.pollDelay));
        
      } catch (error) {
        this.logError(error, `pollForRate attempt ${attempt}`);
        if (attempt === this.maxPollAttempts) {
          return null;
        }
      }
    }
    
    console.log('⏰ SEFL: Max polling attempts reached');
    return null;
  }

  parseRatedQuote(data, quoteNumber) {
    try {
      // Parse charges from details array
      let baseFreight = 0;
      let fuelSurcharge = 0;
      let accessorialCharges = 0;
      
      if (data.details && Array.isArray(data.details)) {
        data.details.forEach(charge => {
          const amount = parseFloat(charge.charges) || 0;
          
          if (charge.typeCharge === 'MFC' || charge.typeCharge === 'FRT') {
            // Minimum freight charge or regular freight
            baseFreight += amount;
          } else if (charge.typeCharge === 'FS') {
            // Fuel surcharge
            fuelSurcharge = amount;
          } else if (charge.typeCharge !== 'TTL') {
            // Other charges (not total)
            accessorialCharges += amount;
          }
        });
      }

      // If we couldn't break down charges, use total as base
      if (baseFreight === 0 && data.rateQuote) {
        baseFreight = parseFloat(data.rateQuote) - fuelSurcharge - accessorialCharges;
      }

      return this.formatStandardResponse({
        service: 'Standard LTL',
        baseFreight: baseFreight,
        fuelSurcharge: fuelSurcharge,
        accessorialCharges: accessorialCharges,
        transitDays: parseInt(data.transitTime) || 3,
        guaranteed: false,
        quoteId: quoteNumber,
        validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
      });
      
    } catch (error) {
      return this.logError(error, 'parseRatedQuote');
    }
  }

  getAuthHeader() {
    const credentials = Buffer.from(`${this.username}:${this.password}`).toString('base64');
    return `Basic ${credentials}`;
  }
}

module.exports = SEFLProvider;
