// src/services/providers/TForceProvider.js
const axios = require('axios');

class TForceProvider {
  constructor() {
    this.name = 'TForce Freight';
    this.code = 'TFORCE';

    // OAuth Configuration
    this.clientId = process.env.TFORCE_CLIENT_ID;
    this.clientSecret = process.env.TFORCE_CLIENT_SECRET;
    this.tokenUrl = 'https://login.microsoftonline.com/ca4f5969-c10f-40d4-8127-e74b691f95de/oauth2/v2.0/token';
    this.scope = 'https://tffproduction.onmicrosoft.com/04cc9749-dbe5-4914-b262-d866b907756b/.default';
    this.apiUrl = 'https://api.tforcefreight.com/rating';

    // Token cache
    this.accessToken = null;
    this.tokenExpiry = null;

    // Customer account support
    this.isCustomerAccount = false;
    this.accountNumber = null;
    this.credentials = null;

    this._debug = null; // optional debug snapshot
  }

  // ==== OAuth ====
  async getAccessToken() {
    try {
      const clientId = this.credentials?.apiKey || this.clientId;
      const clientSecret = this.credentials?.apiSecret || this.clientSecret;

      if (!clientId || !clientSecret) {
        console.warn('TForce credentials not configured');
        return null;
      }

      if (this.accessToken && this.tokenExpiry && new Date() < this.tokenExpiry) {
        return this.accessToken;
      }

      const response = await axios.post(
        this.tokenUrl,
        new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: clientId,
          client_secret: clientSecret,
          scope: this.scope
        }),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
      );

      this.accessToken = response.data.access_token;
      this.tokenExpiry = new Date(Date.now() + (response.data.expires_in - 300) * 1000);
      return this.accessToken;
    } catch (error) {
      console.error('TForce OAuth failed:', error.response?.data || error.message);
      return null;
    }
  }

  // ==== Public API ====
  async getRates(requestData) {
    try {
      console.log(`📦 ${this.code}: Getting rates...`);

      const token = await this.getAccessToken();
      if (!token) {
        console.log(`❌ ${this.code}: No OAuth token available`);
        return null;
      }

      const tforceRequest = this.buildRequest(requestData);
      const response = await this.callAPI(tforceRequest, token);

      if (!response) return null;
      return this.formatResponse(response);
    } catch (error) {
      console.error(`❌ ${this.code} error:`, error.message);
      return null;
    }
  }

  // ==== Builders ====
  buildRequest(requestData) {
    const pickupDate = requestData?.pickupDate
      ? new Date(requestData.pickupDate)
      : new Date(Date.now() + 86400000); // +1 day default

    const weightMode = String(
      requestData?.weightMode || process.env.TFORCE_WEIGHT_MODE || 'auto'
    ).toLowerCase(); // 'auto' | 'total' | 'each'

    const commodities = this.buildCommodities(requestData?.commodities || [], weightMode);

    const request = {
      requestOptions: {
        serviceCode: '308', // TForce LTL
        pickupDate: pickupDate.toISOString().split('T')[0],
        type: 'L',
        densityEligible: false,
        timeInTransit: true,
        quoteNumber: true,
        customerContext: 'QUOTE'
      },
      shipFrom: {
        address: {
          city: requestData?.origin?.city || requestData?.originCity || '',
          stateProvinceCode: requestData?.origin?.state || requestData?.originState || '',
          postalCode: requestData?.origin?.zipCode || requestData?.originZip || '',
          country: 'US'
        }
      },
      shipTo: {
        address: {
          city: requestData?.destination?.city || requestData?.destCity || '',
          stateProvinceCode: requestData?.destination?.state || requestData?.destState || '',
          postalCode: requestData?.destination?.zipCode || requestData?.destZip || '',
          country: 'US'
        }
      },
      payment: {
        payer: {
          address: {
            city: requestData?.origin?.city || requestData?.originCity || '',
            stateProvinceCode: requestData?.origin?.state || requestData?.originState || '',
            postalCode: requestData?.origin?.zipCode || requestData?.originZip || '',
            country: 'US'
          }
        },
        billingCode: this.isCustomerAccount ? '10' : '30' // 10=Prepaid, 30=Third Party
      },
      commodities
    };

    // Accessorials
    const acc = requestData?.accessorials || requestData || {};
    const serviceOptions = this.buildServiceOptions(acc);
    if (serviceOptions) request.serviceOptions = serviceOptions;

    // Small debug preview
    this._debug = {
      requestPreview: {
        pickupDate: request.requestOptions.pickupDate,
        from: request.shipFrom.address.postalCode,
        to: request.shipTo.address.postalCode,
        commoditiesPreview: commodities.map(c => ({
          pieces: c.pieces,
          eachWeight: c.weight?.weight,
          class: c.class,
          dims: `${c.dimensions.length}x${c.dimensions.width}x${c.dimensions.height} ${c.dimensions.unit}`
        })),
        accessorials: serviceOptions
      }
    };

    return request;
  }

  buildCommodities(commodities, weightMode = 'auto') {
    if (!commodities || commodities.length === 0) {
      return [{
        pieces: 1,
        weight: { weight: 100, weightUnit: 'LBS' },
        packagingType: 'PLT',
        class: '100',
        dimensions: { length: 48, width: 40, height: 40, unit: 'IN' }
      }];
    }

    return commodities.map(item => {
      const pieces = parseInt(item.quantity ?? item.pieces, 10) || 1;

      // Prefer explicit per-piece fields if provided; fall back to weight/totalWeight
      const raw =
        parseFloat(item.weightEach ?? item.eachWeight ?? item.weight ?? item.totalWeight) || 0;

      // Decide how to interpret weight:
      //  - 'each': raw is per-piece
      //  - 'total': raw is total for the line
      //  - 'auto': if pieces>1 and no explicit 'each' field, treat raw as total
      const explicitEach = item.weightEach != null || item.eachWeight != null;
      const mode = weightMode === 'auto'
        ? (explicitEach ? 'each' : (pieces > 1 ? 'total' : 'each'))
        : weightMode;

      const perPiece = mode === 'total' ? (raw / (pieces || 1)) : raw;

      // LTL typically expects whole pounds per handling unit
      const eachLbs = Math.max(1, Math.round(perPiece));

      return {
        pieces,
        weight: { weight: eachLbs, weightUnit: 'LBS' },
        packagingType: this.mapPackagingType(item.unitType),
        class: String(item.freightClass ?? item.class ?? '100'),
        dimensions: {
          length: parseFloat(item.length) || 48,
          width: parseFloat(item.width) || 40,
          height: parseFloat(item.height) || 40,
          unit: 'IN'
        }
      };
    });
  }

  mapPackagingType(unitType) {
    const mapping = {
      Pallets: 'PLT',
      Boxes: 'BOX',
      Crates: 'CRT',
      Bundles: 'BDL',
      Rolls: 'ROL',
      Bags: 'BAG',
      Drums: 'DRM',
      Totes: 'TNK'
    };
    return mapping[unitType] || 'PLT';
  }

  buildServiceOptions(accessorials) {
    const options = { pickup: [], delivery: [] };

    if (accessorials.liftgatePickup) options.pickup.push('LIFO');
    if (accessorials.liftgateDelivery) options.delivery.push('LIFD');
    if (accessorials.residentialPickup) options.pickup.push('RESP');
    if (accessorials.residentialDelivery) options.delivery.push('RESD');
    if (accessorials.insidePickup) options.pickup.push('INPU');
    if (accessorials.insideDelivery) options.delivery.push('INDE');
    if (accessorials.limitedAccessPickup) options.pickup.push('LAPU');
    if (accessorials.limitedAccessDelivery) options.delivery.push('LADL');

    if (options.pickup.length || options.delivery.length) return options;
    return undefined;
  }

  // ==== HTTP ====
  async callAPI(requestBody, token) {
    try {
      const subscriptionKey = this.credentials?.apiKey || this.clientId; // TForce uses APIM key here

      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'Ocp-Apim-Subscription-Key': subscriptionKey
      };

      // capture debug (redacted)
      this._debug = this._debug || {};
      this._debug.http = {
        url: `${this.apiUrl}/getRate?api-version=v1`,
        headers: {
          ...headers,
          Authorization: '***',
          'Ocp-Apim-Subscription-Key': '***'
        },
        bodyPreview: requestBody
      };

      const response = await axios.post(
        `${this.apiUrl}/getRate?api-version=v1`,
        requestBody,
        { headers, timeout: 30000 }
      );

      // response preview
      this._debug.http.responseStatus = response.status;
      this._debug.http.responseSummary = {
        hasDetail: !!response.data?.detail?.length,
        quoteNumber: response.data?.summary?.quoteNumber
      };

      return response.data;
    } catch (error) {
      if (error.response?.status === 401) {
        // clear token cache on auth failures
        this.accessToken = null;
        this.tokenExpiry = null;
      }
      console.error(`${this.code} API error:`, error.response?.data || error.message);
      return null;
    }
  }

  // ==== Formatter ====
  formatResponse(tforceResponse) {
    try {
      if (!tforceResponse?.detail?.[0]) {
        console.log(`${this.code}: No rates in response`);
        return null;
      }

      const detail = tforceResponse.detail[0];
      const rates = Array.isArray(detail.rate) ? detail.rate : [];

      const val = code => parseFloat(rates.find(r => r.code === code)?.value || 0);

      const grossCharge = val('LND_GROSS');
      const afterDiscount = val('AFTR_DSCNT') || grossCharge;
      const fuelSurcharge = val('FUEL_SUR');

      // Accessorials known codes (adjust as needed)
      const accessorialCodes = ['INDE_INPU', 'LIFD', 'LIFO', 'RESP', 'RESD', 'LAPU_LADL'];
      const accessorialTotal = rates.reduce((sum, r) =>
        sum + (accessorialCodes.includes(r.code) ? parseFloat(r.value || 0) : 0), 0);

      const totalCost = afterDiscount;
      const baseFreight = totalCost - fuelSurcharge - accessorialTotal;

      let transitDays = 5;
      if (detail.timeInTransit?.value) {
        const n = parseInt(detail.timeInTransit.value, 10);
        if (!Number.isNaN(n)) transitDays = n;
      }

      return {
        provider: this.code,
        carrier: this.code,
        carrierName: this.name,
        service: detail.service?.description || 'LTL Standard',

        // Common names (to match various pipeline expectations)
        baseFreight,
        fuelSurcharge,
        accessorialCharges: accessorialTotal,
        totalCost,

        // Aliases for downstream code that expects these keys
        base: baseFreight,
        fuel: fuelSurcharge,
        accessorialsTotal: accessorialTotal,
        total: totalCost,

        transitDays,
        guaranteed: false,
        quoteNumber: tforceResponse.summary?.quoteNumber,

        accountType: this.isCustomerAccount ? 'customer' : 'company',
        requiresMarkup: !this.isCustomerAccount
      };
    } catch (error) {
      console.error(`${this.code}: Error formatting response:`, error);
      return null;
    }
  }

  // For universal/factory logger
  getDebug() {
    return this._debug;
  }
}

module.exports = TForceProvider;
