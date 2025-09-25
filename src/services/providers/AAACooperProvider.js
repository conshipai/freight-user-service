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
  
  // Build accessorial array (AccLine)
  const accLine = [];
  if (requestData.accessorials?.liftgateDelivery) {
    accLine.push({ AccCode: 'LGD' });
  }
  if (requestData.accessorials?.liftgatePickup) {
    accLine.push({ AccCode: 'LGP' });
  }
  if (requestData.accessorials?.residentialDelivery) {
    accLine.push({ AccCode: 'RSD' });
  }
  if (requestData.accessorials?.residentialPickup) {
    accLine.push({ AccCode: 'RSP' });
  }
  if (requestData.accessorials?.insideDelivery) {
    accLine.push({ AccCode: 'ISD' });
  }
  if (requestData.accessorials?.insidePickup) {
    accLine.push({ AccCode: 'ISP' });
  }
  if (requestData.accessorials?.limitedAccessDelivery) {
    accLine.push({ AccCode: 'RAD' });
  }
  if (requestData.accessorials?.limitedAccessPickup) {
    accLine.push({ AccCode: 'RAP' });
  }
  
  // Build commodity lines (RateEstimateRequestLine)
  const rateEstimateRequestLine = (requestData.commodities || []).map(item => {
    // FIXED: Look for class in the right fields
    // The processGroundQuote decorates commodities with 'freightClass' and 'nmfcClass'
    const freightClass = String(
      item.freightClass ||      // Primary field from processGroundQuote
      item.nmfcClass ||          // Alternative field from processGroundQuote
      item.calculatedClass ||    // Original calculated class
      item.overrideClass ||      // Override class if set
      item.class ||              // Legacy field
      '100'                      // Default fallback for no class
    ).trim();
    
    // Calculate total weight for this line item
    const quantity = parseInt(item.quantity) || 1;
    const weightPerUnit = parseFloat(item.weight) || 0;
    const totalWeight = Math.ceil(quantity * weightPerUnit);
    
    const handlingUnitType = this.getHandlingUnitType(item);
    
    const lineItem = {
      Class: freightClass,
      Weight: String(totalWeight),
      HandlingUnitType: handlingUnitType,
      HandlingUnits: String(quantity),
      HazMat: item.hazmat ? 'X' : ''
    };
    
    // Add NMFC if provided
    if (item.nmfc) {
      lineItem.NMFC = String(item.nmfc);
      if (item.nmfcSub) {
        lineItem.NMFCSub = String(item.nmfcSub);
      }
    }
    
    // Add dimensions if over 96 inches
    if (item.length > 96 || item.width > 96 || item.height > 96) {
      lineItem.CubeU = 'IN';
      lineItem.Length = String(Math.ceil(item.length || 48));
      lineItem.Width = String(Math.ceil(item.width || 40));
      lineItem.Height = String(Math.ceil(item.height || 48));
    }
    
    console.log(`🏷️ AAA Cooper commodity: Class ${freightClass}, Weight ${totalWeight} lbs, ${quantity} ${handlingUnitType}`);
    
    return lineItem;
  });

  // Build the main request object matching the example structure
  const request = {
    Token: this.apiToken,
    CustomerNumber: this.customerNumber || '1',
    OriginCity: origin.city || '',
    OriginState: origin.state || '',
    OriginZip: String(origin.zipCode || ''),
    OriginCountryCode: 'USA',
    DestinationCity: destination.city || '',
    DestinationState: destination.state || '',
    DestinationZip: String(destination.zipCode || ''),
    DestinCountryCode: 'USA',
    WhoAmI: 'S',
    BillDate: billDate,
    PrePaidCollect: 'P',
    AccLine: accLine,
    RateEstimateRequestLine: rateEstimateRequestLine
  };

  console.log('📤 SOAP Request Structure:', JSON.stringify(request, null, 2));
  
  return request;
}

// Also update buildCommodityLines method if you still use it elsewhere
buildCommodityLines(commodities) {
  return commodities.map((item, index) => {
    // FIXED: Look for class in multiple possible fields
    let freightClass = 
      item.freightClass ||      // From processGroundQuote
      item.nmfcClass ||          // Alternative from processGroundQuote
      item.calculatedClass ||    // Original calculated
      item.overrideClass ||      // Override if set
      item.class;                // Legacy field
    
    // Only calculate if no class provided at all
    if (!freightClass) {
      const density = this.calculateDensity(
        item.weight,
        item.length || 48,
        item.width || 40,
        item.height || 40
      );
      freightClass = this.getFreightClass(density);
      console.log(`📊 Calculated density: ${density.toFixed(2)} lbs/ft³ → Class ${freightClass}`);
    }

    const quantity = parseInt(item.quantity) || 1;
    const weightPerUnit = parseFloat(item.weight) || 0;
    const totalWeight = Math.ceil(quantity * weightPerUnit);

    const line = {
      Weight: String(totalWeight),
      Class: String(freightClass),
      HandlingUnits: String(quantity),
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
  const data = response.RateEstimateResponseVO || response;
  
  if (data.ErrorMessage) {
    throw new Error(`AAA Cooper error: ${data.ErrorMessage}`);
  }

  if (data.InformationCode !== 'RATED') {
    console.warn('⚠️ AAA Cooper quote not rated:', data.InformationMessage);
    if (!data.TotalCharges) {
      return null;
    }
  }

  // Parse the response lines
  const responseLines = data.RateEstimateResponseLine || [];
  let baseFreight = 0;
  let fuelSurcharge = 0;
  let discountAmount = 0;
  let accessorialTotal = 0;

  responseLines.forEach(line => {
    const charges = parseFloat(line.Charges || 0);
    const accessorialCode = line.Accessorial || '';
    
    if (!accessorialCode || accessorialCode === 'M') {
      // Base freight (either no code or 'M')
      baseFreight = Math.max(baseFreight, Math.abs(charges));
    } else if (accessorialCode === 'FSC') {
      // Fuel surcharge
      fuelSurcharge = charges;
    } else if (accessorialCode === 'DISC') {
      // Discount (negative value)
      discountAmount = charges; // Keep negative
    } else if (accessorialCode) {
      // Other accessorials (not discount)
      accessorialTotal += charges;
    }
  });

  // CRITICAL: Use TotalCharges as authoritative
  const totalCost = parseFloat(data.TotalCharges || 0);
  
  // If we couldn't identify base freight from lines, derive it
  if (baseFreight === 0 && totalCost > 0) {
    // Total = Base + Fuel + Accessorials + Discount
    // Therefore: Base = Total - Fuel - Accessorials - Discount
    baseFreight = totalCost - fuelSurcharge - accessorialTotal - discountAmount;
    baseFreight = Math.max(0, baseFreight); // Ensure non-negative
  }
  
  // Apply discount to base freight for display purposes
  const netBaseFreight = Math.max(0, baseFreight + discountAmount);
  
  const transitDays = parseInt(data.TotalTransit) || 3;
  
  console.log('💰 AAA Cooper Pricing:');
  console.log(`   Estimate #: ${data.EstimateNumber}`);
  console.log(`   Base Freight: $${baseFreight.toFixed(2)}`);
  console.log(`   Discount: $${discountAmount.toFixed(2)}`);
  console.log(`   Net Base: $${netBaseFreight.toFixed(2)}`);
  console.log(`   Fuel Surcharge: $${fuelSurcharge.toFixed(2)} (${data.FuelSurchargePercent}%)`);
  console.log(`   Accessorials: $${accessorialTotal.toFixed(2)}`);
  console.log(`   Total (from API): $${totalCost.toFixed(2)}`);
  console.log(`   Transit: ${transitDays} days`);

  // Return in standardized format - USE TOTALCHARGES!
  return this.formatStandardResponse({
    service: 'LTL Standard',
    baseFreight: netBaseFreight,  // Base after discount
    fuelSurcharge: fuelSurcharge,
    accessorialCharges: accessorialTotal,
    totalCost: totalCost,  // Use API's authoritative total
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
    discount: discountAmount,
    grossFreight: baseFreight,  // Original before discount
    density: data.Density,
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
