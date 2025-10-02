// src/services/providers/ground/STGProvider.js
const BaseGroundProvider = require('./BaseGroundProvider');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

class STGProvider extends BaseGroundProvider {
  constructor() {
    super('STG Logistics', 'STG');

    // Support both naming styles
    this.baseUrl =
      process.env.FREIGHT_FORCE_BASE_URL ||
      process.env.FREIGHTFORCE_API_URL ||
      'https://dev-ffapi.freightforce.com';

    this.username =
      process.env.FREIGHT_FORCE_USERNAME || process.env.FREIGHTFORCE_USERNAME;

    this.password =
      process.env.FREIGHT_FORCE_PASSWORD || process.env.FREIGHTFORCE_PASSWORD;

    this.email =
      process.env.FREIGHT_FORCE_EMAIL || process.env.FREIGHTFORCE_EMAIL;

    this.accountId =
      process.env.FREIGHT_FORCE_ACCOUNT_ID || process.env.FREIGHTFORCE_ACCOUNT;

    this.token = null;
    this.tokenExpiry = null;

    this.http = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
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

  static pickFirst(obj, keys, fallback = undefined) {
    for (const k of keys) {
      if (obj && Object.prototype.hasOwnProperty.call(obj, k) && obj[k] != null) {
        return obj[k];
      }
    }
    return fallback;
  }

  _setAuthHeader(token) {
    this.http.defaults.headers.common.Authorization = `Bearer ${token}`;
  }

  _tokenLikelyExpired() {
    return !this.tokenExpiry || new Date() >= this.tokenExpiry;
  }

  async authenticate() {
    if (!this.username || !this.password) {
      throw new Error('Missing FREIGHT FORCE credentials');
    }

    try {
      console.log('\n🔐 STG/FreightForce: Authenticating…');
      console.log('   Username:', this.username);
      console.log('   Email:', this.email);
      console.log('   Base URL:', this.baseUrl);

      const authPayload = {
        username: this.username,
        password: this.password,
        contactEmail: this.email,
      };

      console.log('   Auth Payload (without password):', { 
        username: authPayload.username, 
        contactEmail: authPayload.contactEmail 
      });

      const { data } = await this.http.post('/api/Auth/token', authPayload);

      console.log('\n📥 AUTH RESPONSE:');
      console.log(JSON.stringify(data, null, 2));

      this.saveDebugLog('stg_auth_response', {
        timestamp: new Date().toISOString(),
        request: { username: this.username, email: this.email },
        response: data
      });

      // Try various token field names
      const token = STGProvider.pickFirst(
        data,
        ['token', 'access_token', 'jwt', 'accessToken', 'Token', 'bearer', 'bearerToken']
      );

      if (!token) {
        console.error('⚠️ Could not find token in response. All fields:', Object.keys(data));
        throw new Error('Could not find token in Auth/token response');
      }

      this.token = token;
      this.tokenExpiry = new Date(Date.now() + 55 * 60 * 1000);
      this._setAuthHeader(this.token);

      console.log('✅ STG/FreightForce: Authenticated successfully');
      console.log('   Token (first 20 chars):', token.substring(0, 20) + '...');
      console.log('   Token expires at:', this.tokenExpiry.toISOString());

      return this.token;
    } catch (err) {
      console.error('\n❌ STG/FreightForce Auth Error:');
      console.error('   Error Message:', err.message);
      if (err.response) {
        console.error('   Response Status:', err.response.status);
        console.error('   Response Data:', err.response.data);
      }
      
      this.saveDebugLog('stg_auth_error', {
        timestamp: new Date().toISOString(),
        error: {
          message: err.message,
          status: err.response?.status,
          data: err.response?.data
        }
      });
      
      throw err;
    }
  }

  async ensureAuth() {
    if (!this.token || this._tokenLikelyExpired()) {
      await this.authenticate();
    } else {
      this._setAuthHeader(this.token);
    }
  }

  async getRates(requestData) {
    try {
      console.log('\n' + '='.repeat(80));
      console.log('🚚 STG/FREIGHTFORCE API CALL STARTING');
      console.log('='.repeat(80));
      console.log('📅 Timestamp:', new Date().toISOString());
      console.log('🔗 Base URL:', this.baseUrl);

      if (!this.username || !this.password) {
        console.warn('⚠️ STG/FreightForce: Missing credentials, skipping');
        return null;
      }

      await this.ensureAuth();

      const payload = this.buildRequest(requestData);
      
      console.log('\n📤 STG REQUEST PAYLOAD:');
      console.log(JSON.stringify(payload, null, 2));

      this.saveDebugLog('stg_request', {
        timestamp: new Date().toISOString(),
        request: payload,
        originalRequest: requestData
      });

      const startTime = Date.now();
      console.log(`\n🌐 Calling: POST ${this.baseUrl}/api/Quote`);

      const { data } = await this.http.post('/api/Quote', payload, {
        headers: { 'Content-Type': 'application/json' },
      });

      const responseTime = Date.now() - startTime;
      
      console.log(`\n✅ STG RESPONSE RECEIVED (${responseTime}ms)`);
      console.log('\n📥 FULL RAW RESPONSE:');
      console.log(JSON.stringify(data, null, 2));

      this.saveDebugLog('stg_response', {
        timestamp: new Date().toISOString(),
        responseTime: responseTime,
        data: data
      });

      // Analyze response structure
      console.log('\n🔍 RESPONSE ANALYSIS:');
      console.log('  Response Type:', typeof data);
      console.log('  Is Array:', Array.isArray(data));
      console.log('  Top-level keys:', Object.keys(data));
      
      // Log all fields for discovery
      console.log('\n📌 ALL RESPONSE FIELDS:');
      Object.keys(data).forEach(key => {
        const value = data[key];
        if (typeof value === 'object' && value !== null) {
          console.log(`  ${key}:`, JSON.stringify(value, null, 2));
        } else {
          console.log(`  ${key}:`, value);
        }
      });

      // Look for quote-specific fields
      console.log('\n📋 QUOTE IDENTIFICATION:');
      console.log('  quoteId:', data.quoteId || 'Not provided');
      console.log('  quoteNumber:', data.quoteNumber || 'Not provided');
      console.log('  reference:', data.reference || 'Not provided');
      console.log('  id:', data.id || 'Not provided');
      
      if (data.quote) {
        console.log('  quote.number:', data.quote.number || 'Not provided');
        console.log('  quote.id:', data.quote.id || 'Not provided');
      }

      // Look for service level fields
      console.log('\n🎯 SERVICE LEVEL:');
      console.log('  serviceType:', data.serviceType || 'Not provided');
      console.log('  serviceName:', data.serviceName || 'Not provided');
      console.log('  serviceLevel:', data.serviceLevel || 'Not provided');
      console.log('  guaranteed:', data.guaranteed || 'Not provided');
      console.log('  expedited:', data.expedited || 'Not provided');
      console.log('  priority:', data.priority || 'Not provided');

      // Look for transit time fields
      console.log('\n📅 TRANSIT & DELIVERY:');
      console.log('  transitTime:', data.transitTime || 'Not provided');
      console.log('  transitDays:', data.transitDays || 'Not provided');
      console.log('  etaDays:', data.etaDays || 'Not provided');
      console.log('  estimatedDelivery:', data.estimatedDelivery || 'Not provided');
      console.log('  deliveryDate:', data.deliveryDate || 'Not provided');
      console.log('  committedDelivery:', data.committedDelivery || 'Not provided');

      // Look for pricing fields
      console.log('\n💵 PRICING FIELDS:');
      console.log('  quoteRateTotal:', data.quoteRateTotal || 'Not provided');
      console.log('  total:', data.total || 'Not provided');
      console.log('  grandTotal:', data.grandTotal || 'Not provided');
      console.log('  totalRate:', data.totalRate || 'Not provided');
      console.log('  amount:', data.amount || 'Not provided');

      // Look for freight charge breakdown
      console.log('\n📊 FREIGHT CHARGES:');
      console.log('  pickup_FreightCharge:', data.pickup_FreightCharge || 'Not provided');
      console.log('  pickupFreight:', data.pickupFreight || 'Not provided');
      console.log('  delivery_FreightCharge:', data.delivery_FreightCharge || 'Not provided');
      console.log('  deliveryFreight:', data.deliveryFreight || 'Not provided');
      console.log('  freight_Charge:', data.freight_Charge || 'Not provided');
      console.log('  linehaul:', data.linehaul || 'Not provided');

      // Look for fuel surcharge
      console.log('\n⛽ FUEL SURCHARGES:');
      console.log('  pickup_FSC:', data.pickup_FSC || 'Not provided');
      console.log('  pickupFuel:', data.pickupFuel || 'Not provided');
      console.log('  delivery_FSC:', data.delivery_FSC || 'Not provided');
      console.log('  deliveryFuel:', data.deliveryFuel || 'Not provided');
      console.log('  freight_FSC:', data.freight_FSC || 'Not provided');
      console.log('  fuelSurcharge:', data.fuelSurcharge || 'Not provided');

      // Look for accessorials
      console.log('\n🔧 ACCESSORIALS:');
      console.log('  accessorialTotal:', data.accessorialTotal || 'Not provided');
      console.log('  accessorialsTotal:', data.accessorialsTotal || 'Not provided');
      
      if (data.accessorials) {
        console.log('  accessorials array:');
        if (Array.isArray(data.accessorials)) {
          data.accessorials.forEach((acc, index) => {
            console.log(`    Accessorial #${index + 1}:`, JSON.stringify(acc, null, 2));
          });
        } else {
          console.log('    ', JSON.stringify(data.accessorials, null, 2));
        }
      }

      if (data.deliveryAccessorials) {
        console.log('  deliveryAccessorials:', JSON.stringify(data.deliveryAccessorials, null, 2));
      }
      
      if (data.pickupAccessorials) {
        console.log('  pickupAccessorials:', JSON.stringify(data.pickupAccessorials, null, 2));
      }

      const result = this.parseResponse(data);

      console.log('\n📦 NORMALIZED RESULT:');
      console.log(JSON.stringify(result, null, 2));

      console.log('\n' + '='.repeat(80));
      console.log('✅ STG PROCESSING COMPLETE');
      console.log('='.repeat(80) + '\n');

      return result;

    } catch (err) {
      const errorTime = Date.now();
      console.error('\n💥 STG/FreightForce ERROR:');
      console.error('   Error Message:', err.message);
      
      if (err.response) {
        console.error('   Response Status:', err.response.status);
        console.error('   Response Data:', JSON.stringify(err.response.data, null, 2));
        
        this.saveDebugLog('stg_error', {
          timestamp: new Date().toISOString(),
          error: {
            message: err.message,
            status: err.response.status,
            data: err.response.data
          }
        });
      } else {
        console.error('   Stack:', err.stack);
      }
      
      console.log('='.repeat(80) + '\n');
      return null;
    }
  }

  buildRequest(requestData) {
    console.log('\n🔨 Building STG Request:');
    
    // Extract addresses
    const originZip =
      requestData?.origin?.zipCode ||
      requestData?.originZip ||
      requestData?.formData?.originZip ||
      requestData?.formData?.origin?.zipCode ||
      '';

    const destZip =
      requestData?.destination?.zipCode ||
      requestData?.destZip ||
      requestData?.formData?.destZip ||
      requestData?.formData?.destination?.zipCode ||
      '';

    console.log('   Origin ZIP:', originZip);
    console.log('   Destination ZIP:', destZip);

    // Extract commodities
    const commodities = Array.isArray(requestData?.commodities)
      ? requestData.commodities
      : Array.isArray(requestData?.ltlDetails?.commodities)
      ? requestData.ltlDetails.commodities
      : Array.isArray(requestData?.formData?.commodities)
      ? requestData.formData.commodities
      : [];

    console.log('   Number of commodities:', commodities.length);

    // Calculate total weight
    const totalWeight = Math.max(
      1,
      Math.ceil(
        commodities.reduce((sum, c) => {
          const qty = Number(c.quantity || 1);
          const wt = Number(c.weight || 0);
          return sum + qty * wt;
        }, 0)
      )
    );

    console.log('   Total weight:', totalWeight, 'lbs');

    // Build dimensions array
    const dimensions = commodities
      .map((c, index) => {
        const qty = Number(c.quantity ?? 1);
        const wt = Number(c.weight ?? 0);
        const L = Number(c.length ?? 0);
        const W = Number(c.width ?? 0);
        const H = Number(c.height ?? 0);

        console.log(`   Commodity #${index + 1}: ${qty}x ${L}"L x ${W}"W x ${H}"H @ ${wt}lbs`);

        if (qty > 0 && wt > 0 && L > 0 && W > 0 && H > 0) {
          return {
            qty: qty,
            weight: Math.ceil(wt),
            length: Math.ceil(L),
            width: Math.ceil(W),
            height: Math.ceil(H),
            description: c.description || 'General Freight',
          };
        }
        return null;
      })
      .filter(Boolean);

    // Process accessorials
    const acc = requestData?.accessorials || requestData?.formData?.accessorials || {};
    const pickupAccessorials = [];
    const deliveryAccessorials = [];

    console.log('\n   Accessorials requested:', Object.keys(acc).filter(k => acc[k]));

    if (Array.isArray(acc.pickupCodes)) {
      acc.pickupCodes.forEach((code) => pickupAccessorials.push({ code: String(code) }));
    }
    if (Array.isArray(acc.deliveryCodes)) {
      acc.deliveryCodes.forEach((code) => deliveryAccessorials.push({ code: String(code) }));
    }

    // Map common flags
    if (acc.liftgatePickup) pickupAccessorials.push({ code: 'LFT' });
    if (acc.appointmentPickup) pickupAccessorials.push({ code: 'APT' });
    if (acc.insidePickup) pickupAccessorials.push({ code: 'INS' });

    if (acc.liftgateDelivery) deliveryAccessorials.push({ code: 'LFT' });
    if (acc.residentialDelivery) deliveryAccessorials.push({ code: 'RES' });
    if (acc.appointmentDelivery) deliveryAccessorials.push({ code: 'APT' });
    if (acc.insideDelivery) deliveryAccessorials.push({ code: 'INS' });

    console.log('   Pickup accessorials:', pickupAccessorials);
    console.log('   Delivery accessorials:', deliveryAccessorials);

    const body = {
      rateType: 'N',
      origin: String(originZip),
      originType: 'Z',
      destination: String(destZip),
      destinationType: 'Z',
      weight: totalWeight,
    };

    if (dimensions.length > 0) body.dimensions = dimensions;
    if (pickupAccessorials.length > 0) body.pickupAccessorials = pickupAccessorials;
    if (deliveryAccessorials.length > 0) body.deliveryAccessorials = deliveryAccessorials;

    return body;
  }

  parseResponse(data) {
    console.log('\n📊 PARSING STG RESPONSE');
    
    const pickFirst = (obj, keys, fallback = 0) => {
      for (const k of keys) {
        if (obj && Object.prototype.hasOwnProperty.call(obj, k) && obj[k] != null) {
          console.log(`   Found ${k}:`, obj[k]);
          return obj[k];
        }
      }
      return fallback;
    };
    
    const num = (v) => {
      const n = Number(v);
      return Number.isFinite(n) ? n : 0;
    };

    // Calculate freight components
    const pickupFreight   = num(pickFirst(data, ['pickup_FreightCharge', 'pickupFreight', 'pickup_freight', 'pickupFreightCharge'], 0));
    const deliveryFreight = num(pickFirst(data, ['delivery_FreightCharge','deliveryFreight','delivery_freight','deliveryFreightCharge'], 0));
    const lineFreight     = num(pickFirst(data, ['freight_Charge','linehaul','freight','lineFreight'], 0));
    const baseFreight     = pickupFreight + deliveryFreight + lineFreight;

    // Calculate fuel components
    const pickupFuel      = num(pickFirst(data, ['pickup_FSC','pickupFuel','pickup_fuel','pickupFuelSurcharge'], 0));
    const deliveryFuel    = num(pickFirst(data, ['delivery_FSC','deliveryFuel','delivery_fuel','deliveryFuelSurcharge'], 0));
    const lineFuel        = num(pickFirst(data, ['freight_FSC','fuelSurcharge','fuel','fsc','lineFuel'], 0));
    const fuelSurcharge   = pickupFuel + deliveryFuel + lineFuel;

    // Calculate accessorials
    let accessorials = num(pickFirst(data, ['accessorialTotal','accessorialsTotal','accessorial_amount'], 0));
    if (!accessorials) {
      const accList = pickFirst(data, ['accessorials', 'deliveryAccessorials', 'pickupAccessorials'], []);
      if (Array.isArray(accList)) {
        accessorials = accList.reduce((sum, a) => {
          const amt = num(a?.amount ?? a?.charge ?? a?.total);
          return sum + amt;
        }, 0);
      }
    }

    // Calculate total
    let total = num(pickFirst(data, ['quoteRateTotal', 'total', 'grandTotal', 'totalRate', 'amount'], 0));
    if (!total) {
      total = baseFreight + fuelSurcharge + accessorials;
    }

    // Extract metadata
    const transitDays = parseInt(pickFirst(data, ['transitTime', 'transitDays', 'etaDays'], 3), 10) || 3;
    
    // QUOTE NUMBER - from API or generate fallback
    const quoteId = pickFirst(data, ['quoteId', 'quoteNumber', 'reference', 'id'], undefined)
                 || pickFirst(data?.quote || {}, ['number', 'id'], undefined)
                 || `STG-${Date.now()}`;
    
    console.log('\n💡 Quote ID source:', quoteId.startsWith('STG-') ? 'Generated fallback' : 'From API');

    // Extract service level
    const serviceName = pickFirst(data, ['serviceType', 'serviceName', 'serviceLevel'], 'Standard LTL');
    const isGuaranteed = data.guaranteed === true || data.guaranteed === 'Y';

    // Price breakdown
    console.log('\n🔍 STG Price Breakdown:');
    console.log('   Pickup:       $' + (pickupFreight + pickupFuel).toFixed(2));
    console.log('   Linehaul:     $' + (lineFreight + lineFuel).toFixed(2));
    console.log('   Delivery:     $' + (deliveryFreight + deliveryFuel).toFixed(2));
    console.log('   Accessorials: $' + accessorials.toFixed(2));
    console.log('   Total:        $' + total.toFixed(2));

    return this.formatStandardResponse({
      service: serviceName,
      baseFreight,
      fuelSurcharge,
      accessorialCharges: accessorials,
      total,
      totalCost: total,
      transitDays,
      guaranteed: isGuaranteed,
      quoteId,
      validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      deliveryDate: pickFirst(data, ['estimatedDelivery', 'deliveryDate', 'committedDelivery'], null),
      
      // Store raw response for debugging  
      rawResponse: data,
      
      priceBreakdown: {
        baseFreight,
        discount: 0,
        fuelSurcharge,
        accessorials,
        total
      }
    });
  }
}

module.exports = STGProvider;
