// src/services/providers/ground/AAACooperProvider.js
const BaseGroundProvider = require('./ground/BaseGroundProvider');
const soap = require('soap');

class AAACooperProvider extends BaseGroundProvider {
  constructor() {
    super('AAA Cooper Transportation', 'AAA_COOPER');
    
    // SOAP Configuration
    this.wsdlUrl = process.env.AAACT_WSDL_URL || 'https://www.aaacooper.com/docs/web-services/rate-estimate-web-service.wsdl';
    this.endpointUrl = process.env.AAACT_ENDPOINT_URL || 'https://api2.aaacooper.com:8200/sapi30/wsGenEst';
    this.testEndpointUrl = process.env.AAACT_TEST_ENDPOINT_URL || 'https://testapi2.aaacooper.com:8200/sapi30/wsGenEst';
    this.apiToken = process.env.AAACT_API_TOKEN;
    this.customerNumber = process.env.AAACT_CUSTOMER_NUMBER || '';
    this.useTestEnvironment = process.env.AAACT_USE_TEST === 'true';
    
    this.soapClient = null;
    
    // Accessorial code mappings
    this.accessorialMappings = {
      liftgatePickup: 'LGP',
      liftgateDelivery: 'LGD',
      residentialPickup: 'RSP',
      residentialDelivery: 'RSD',
      insidePickup: 'ISP',
      insideDelivery: 'ISD',
      limitedAccessPickup: 'RAP',  // Restricted Access Pickup
      limitedAccessDelivery: 'RAD', // Restricted Access Delivery
      appointmentPickup: 'NCM',     // Notify Charge (appointments)
      appointmentDelivery: 'NCM',
      constructionPickup: 'CSP',
      constructionDelivery: 'CSD',
      protectFromFreeze: 'PFF',
      airportPickup: 'APP',
      airportDelivery: 'APD'
    };
  }

  async initializeSoapClient() {
    if (this.soapClient) {
      return this.soapClient;
    }

    try {
      console.log('🔌 Initializing AAA Cooper SOAP client...');
      console.log(`   WSDL: ${this.wsdlUrl}`);
      console.log(`   Endpoint: ${this.useTestEnvironment ? this.testEndpointUrl : this.endpointUrl}`);
      
      // Create SOAP client options
      const options = {
        endpoint: this.useTestEnvironment ? this.testEndpointUrl : this.endpointUrl,
        forceSoap12Headers: false, // Use SOAP 1.1
        disableCache: true,
        wsdl_options: {
          timeout: 30000
        }
      };

      // Create SOAP client from WSDL
      this.soapClient = await soap.createClientAsync(this.wsdlUrl, options);
      
      console.log('✅ AAA Cooper SOAP client initialized');
      
      // Log available methods for debugging
      const services = this.soapClient.describe();
      const serviceNames = Object.keys(services);
      console.log('📋 Available services:', serviceNames);
      
      // Usually there's one service with one port
      if (serviceNames.length > 0) {
        const serviceName = serviceNames[0];
        const ports = Object.keys(services[serviceName]);
        console.log(`   Service: ${serviceName}, Ports:`, ports);
        
        if (ports.length > 0) {
          const portName = ports[0];
          const methods = Object.keys(services[serviceName][portName]);
          console.log(`   Available methods:`, methods);
        }
      }
      
      return this.soapClient;
      
    } catch (error) {
      console.error('❌ Failed to initialize SOAP client:', error.message);
      throw error;
    }
  }

  async getRates(requestData) {
    try {
      // Skip if no token configured
      if (!this.apiToken) {
        console.warn('⚠️ AAA Cooper: Missing API token, skipping');
        return null;
      }

      console.log('🚚 AAA Cooper: Fetching rates via SOAP...');

      // Initialize SOAP client
      await this.initializeSoapClient();

      // Build SOAP request
      const soapRequest = this.buildSoapRequest(requestData);
      console.log('📤 AAA Cooper SOAP request:', JSON.stringify(soapRequest, null, 2));

      // Call the SOAP method
      // The method name might be 'wsGenRateEstimate' based on the namespace
      const [result, rawResponse, soapHeader, rawRequest] = await this.soapClient.wsGenRateEstimateAsync(soapRequest);
      
      console.log('📥 AAA Cooper SOAP response:', JSON.stringify(result, null, 2));

      // Parse the response
      return this.parseSoapResponse(result);
      
    } catch (error) {
      if (error.response) {
        console.error('❌ AAA Cooper SOAP error:', error.response.statusCode, error.body);
      } else if (error.root && error.root.Envelope) {
        // SOAP Fault
        const fault = error.root.Envelope.Body.Fault;
        console.error('❌ AAA Cooper SOAP Fault:', fault);
      } else {
        console.error('❌ AAA Cooper error:', error.message);
      }
      
      return this.logError(error, 'getRates');
    }
  }

  buildSoapRequest(requestData) {
    // Extract origin and destination
    const origin = requestData.origin || {};
    const destination = requestData.destination || {};
    
    // Format pickup date as MMDDYYYY
    const pickupDate = requestData.pickupDate 
      ? new Date(requestData.pickupDate)
      : new Date();
    
    const month = String(pickupDate.getMonth() + 1).padStart(2, '0');
    const day = String(pickupDate.getDate()).padStart(2, '0');
    const year = pickupDate.getFullYear();
    const billDate = `${month}${day}${year}`;
    
    // Build commodity lines
    const commodityLines = this.buildCommodityLines(requestData.commodities || []);
    
    // Build accessorial codes
    const accessorialCodes = this.buildAccessorialCodes(requestData.accessorials || {});
    
    // Build the SOAP request object according to AAA Cooper's schema
    const request = {
      Token: this.apiToken,
      CustomerNumber: this.customerNumber,
      OriginCity: origin.city || '',
      OriginState: origin.state || '',
      OriginZip: String(origin.zipCode || ''),
      OriginCountryCode: 'USA',
      DestinationCity: destination.city || '',
      DestinationState: destination.state || '',
      DestinationZip: String(destination.zipCode || ''),
      DestinCountryCode: 'USA',
      WhoAmI: 'S', // S=Shipper, C=Consignee, 3=Third Party
      BillDate: billDate,
      PrePaidCollect: 'P', // P=Prepaid, C=Collect
      TotalPalletCount: this.calculateTotalPallets(requestData.commodities),
      AccLine: accessorialCodes,
      RateEstimateRequestLine: commodityLines
    };

    // Add Full Coverage if insurance is requested
    if (requestData.insurance) {
      request.FullCoverage = 'Y';
      request.FullCoverageAmount = String(Math.round(requestData.insurance.value || 0));
    }

    return request;
  }

  buildCommodityLines(commodities) {
    return commodities.map((item, index) => {
      // Calculate freight class if not provided
      let freightClass = item.class;
      if (!freightClass) {
        const density = this.calculateDensity(
          item.weight,
          item.length || 48,
          item.width || 40,
          item.height || 40
        );
        freightClass = this.getFreightClass(density);
      }

      const line = {
        Weight: String(Math.ceil(item.weight * (item.quantity || 1))),
        Class: String(freightClass),
        HandlingUnits: String(item.quantity || 1),
        HandlingUnitType: this.getHandlingUnitType(item),
        HazMat: item.hazmat ? 'X' : ''
      };

      // Add NMFC if provided
      if (item.nmfc) {
        line.NMFC = String(item.nmfc);
        if (item.nmfcSub) {
          line.NMFCSub = String(item.nmfcSub);
        }
      }

      // Add dimensions if provided and over 96 inches
      if (item.length || item.height || item.width) {
        line.CubeU = 'IN';
        if (item.length) line.Length = String(Math.ceil(item.length));
        if (item.height) line.Height = String(Math.ceil(item.height));
        if (item.width) line.Width = String(Math.ceil(item.width));
      }

      return line;
    });
  }

  buildAccessorialCodes(accessorials) {
    const codes = [];
    
    // Check for pallet pricing if all commodities are pallets
    // This would need business logic to determine when to use PALET
    
    // Map standard accessorials
    Object.keys(accessorials).forEach(key => {
      if (accessorials[key] && this.accessorialMappings[key]) {
        codes.push({ AccCode: this.accessorialMappings[key] });
      }
    });

    // Add excess length if any commodity is >= 96 inches (8 feet)
    if (accessorials.commodities?.some(c => c.length >= 96)) {
      codes.push({ AccCode: 'EXL' });
    }

    return codes;
  }

  getHandlingUnitType(item) {
    const unitType = (item.unitType || '').toLowerCase();
    
    const unitMappings = {
      'pallet': 'Pallets',
      'pallets': 'Pallets',
      'carton': 'Cartons',
      'cartons': 'Cartons',
      'drum': 'Drums',
      'drums': 'Drums',
      'roll': 'Rolls',
      'rolls': 'Rolls',
      'bundle': 'Bundles',
      'bundles': 'Bundles',
      'box': 'Cartons',
      'boxes': 'Cartons',
      'crate': 'Other',
      'crates': 'Other'
    };

    return unitMappings[unitType] || 'Other';
  }

  calculateTotalPallets(commodities) {
    const palletCount = commodities
      .filter(c => this.getHandlingUnitType(c) === 'Pallets')
      .reduce((sum, c) => sum + (c.quantity || 1), 0);
    
    return palletCount > 0 ? String(palletCount) : '';
  }

  parseSoapResponse(response) {
    // The response is wrapped in RateEstimateResponseVO
    const data = response.RateEstimateResponseVO || response;
    
    // Check for errors
    if (data.ErrorMessage) {
      throw new Error(`AAA Cooper error: ${data.ErrorMessage}`);
    }

    // Check if the response was rated successfully
    if (data.InformationCode !== 'RATED') {
      console.warn('⚠️ AAA Cooper quote not rated:', data.InformationMessage);
      if (!data.TotalCharges) {
        return null;
      }
    }

    // Parse the response lines to get charge breakdown
    const responseLines = data.RateEstimateResponseLine || [];
    let baseFreight = 0;
    let fuelSurcharge = 0;
    let accessorialTotal = 0;

    responseLines.forEach(line => {
      const charges = parseFloat(line.Charges || 0);
      const accessorialCode = line.Accessorial || '';
      
      if (accessorialCode === 'M') {
        // Minimum charge (base freight)
        baseFreight = charges;
      } else if (accessorialCode === 'FSC') {
        // Fuel surcharge
        fuelSurcharge = charges;
      } else if (accessorialCode && accessorialCode !== 'M' && accessorialCode !== 'FSC') {
        // Other accessorials
        accessorialTotal += charges;
      }
    });

    // If no breakdown, use total charges as base freight
    if (baseFreight === 0 && fuelSurcharge === 0) {
      baseFreight = parseFloat(data.TotalCharges || 0);
    }

    const totalCost = parseFloat(data.TotalCharges || 0);
    const transitDays = parseInt(data.TotalTransit) || 3;
    
    console.log('💰 AAA Cooper Pricing:');
    console.log(`   Estimate #: ${data.EstimateNumber}`);
    console.log(`   Base Freight: $${baseFreight.toFixed(2)}`);
    console.log(`   Fuel Surcharge: $${fuelSurcharge.toFixed(2)} (${data.FuelSurchargePercent}%)`);
    console.log(`   Accessorials: $${accessorialTotal.toFixed(2)}`);
    console.log(`   Total: $${totalCost.toFixed(2)}`);
    console.log(`   Transit: ${transitDays} days`);
    console.log(`   Origin Terminal: ${data.OriginTerminal} (${data.OriginTerminalPhone})`);
    console.log(`   Dest Terminal: ${data.DestinTerminal} (${data.DestinTerminalPhone})`);

    // Return in standardized format
    return this.formatStandardResponse({
      service: 'LTL Standard',
      baseFreight: baseFreight,
      fuelSurcharge: fuelSurcharge,
      accessorialCharges: accessorialTotal,
      totalCost: totalCost,
      transitDays: transitDays,
      guaranteed: false,
      quoteId: data.EstimateNumber || `AAACT-${Date.now()}`,
      validUntil: new Date(Date.now() + 24 * 60 * 60 * 1000),
      
      // Additional AAA Cooper specific data
      estimateNumber: data.EstimateNumber,
      originTerminal: data.OriginTerminal,
      originTerminalPhone: data.OriginTerminalPhone,
      destinationTerminal: data.DestinTerminal,
      destinationTerminalPhone: data.DestinTerminalPhone,
      fuelSurchargePercent: data.FuelSurchargePercent,
      density: data.Density,
      discount: data.Discount,
      minimumCharge: data.MinimumCharge,
      tariff: data.Tariff
    });
  }

  // Test method to validate the connection
  async testConnection() {
    try {
      console.log('🧪 Testing AAA Cooper SOAP connection...');
      
      await this.initializeSoapClient();
      
      // Create a simple test request
      const testRequest = {
        Token: this.apiToken,
        CustomerNumber: this.customerNumber,
        OriginCity: 'Dothan',
        OriginState: 'AL',
        OriginZip: '36303',
        OriginCountryCode: 'USA',
        DestinationCity: 'Atlanta',
        DestinationState: 'GA',
        DestinationZip: '30303',
        DestinCountryCode: 'USA',
        WhoAmI: 'S',
        BillDate: '01152025',
        PrePaidCollect: 'P',
        AccLine: [],
        RateEstimateRequestLine: [{
          Weight: '100',
          Class: '50',
          HandlingUnits: '1',
          HandlingUnitType: 'Pallets',
          HazMat: ''
        }]
      };

      const [result] = await this.soapClient.wsGenRateEstimateAsync(testRequest);
      
      if (result.RateEstimateResponseVO) {
        console.log('✅ AAA Cooper SOAP connection successful');
        console.log(`   Estimate Number: ${result.RateEstimateResponseVO.EstimateNumber}`);
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('❌ AAA Cooper connection test failed:', error.message);
      return false;
    }
  }
}

module.exports = AAACooperProvider;
