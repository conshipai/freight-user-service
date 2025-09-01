// src/services/providers/ground/STGProvider.js
const BaseGroundProvider = require('./BaseGroundProvider');
const axios = require('axios');

class STGProvider extends BaseGroundProvider {
  constructor() {
    super('STG Logistics', 'STG');

    // Support both naming styles (you've used both across the project/messages)
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

    // Single axios instance so we can set headers cleanly
    this.http = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
    });
  }

  // --- Utilities -------------------------------------------------------------

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

  // --- Auth -----------------------------------------------------------------

  async authenticate() {
    // Avoid log noise if creds are missing (provider can be optional)
    if (!this.username || !this.password) {
      throw new Error('Missing FREIGHT FORCE credentials');
    }

    try {
      console.log('🔐 STG/FreightForce: Authenticating…');

      const { data } = await this.http.post('/api/Auth/token', {
        username: this.username,
        password: this.password,
        contactEmail: this.email,
      });

      // Try a bunch of common token keys
      const token = STGProvider.pickFirst(
        data,
        ['token', 'access_token', 'jwt', 'accessToken', 'Token', 'bearer', 'bearerToken']
      );

      if (!token) {
        console.error('⚠️ Token response payload:', data);
        throw new Error('Could not find token in Auth/token response');
      }

      this.token = token;
      this.tokenExpiry = new Date(Date.now() + 55 * 60 * 1000); // ~55 mins safety
      this._setAuthHeader(this.token);

      console.log('✅ STG/FreightForce: Authenticated');
      return this.token;
    } catch (err) {
      const detail = err.response?.data || err.message;
      console.error('❌ STG/FreightForce Auth failed:', detail);
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

  // --- Public API ------------------------------------------------------------

  async getRates(requestData) {
    try {
      // Skip if no creds configured
      if (!this.username || !this.password) {
        console.warn('⚠️ STG/FreightForce: Missing credentials, skipping');
        return null;
      }

      // Ensure we’re authenticated
      await this.ensureAuth();

      const payload = this.buildRequest(requestData);
      console.log('📤 STG/FreightForce request:', JSON.stringify(payload, null, 2));

      const { data } = await this.http.post('/api/Quote', payload, {
        headers: { 'Content-Type': 'application/json' },
      });

      console.log('📥 STG/FreightForce raw response:', JSON.stringify(data, null, 2));

      return this.parseResponse(data);
    } catch (err) {
      console.error('❌ STG/FreightForce error:', err.response?.data || err.message);
      return null;
    }
  }

  // --- Request builder -------------------------------------------------------

  buildRequest(requestData) {
    // Defensive pulls for your internal shape (seen across your UI flows)
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

    // Commodities: expect { quantity, weight, length, width, height, description }
    const commodities = Array.isArray(requestData?.commodities)
      ? requestData.commodities
      : Array.isArray(requestData?.ltlDetails?.commodities)
      ? requestData.ltlDetails.commodities
      : Array.isArray(requestData?.formData?.commodities)
      ? requestData.formData.commodities
      : [];

    // Total weight (rounded up to integer)
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

    // Build dimensions array; skip if fields are missing to avoid 400s
    const dimensions = commodities
      .map((c) => {
        const qty = Number(c.quantity ?? 1);
        const wt = Number(c.weight ?? 0);
        const L = Number(c.length ?? 0);
        const W = Number(c.width ?? 0);
        const H = Number(c.height ?? 0);

        // Include only if we have legit L/W/H/weight
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

    // Accessorials mapping – pass through codes if you already have API codes,
    // otherwise map your booleans to likely codes. Adjust as needed after you
    // hit /api/Accessorials/{zip} to confirm available codes.
    const acc = requestData?.accessorials || requestData?.formData?.accessorials || {};
    const pickupAccessorials = [];
    const deliveryAccessorials = [];

    // If your UI sends known codes already, allow direct pass-through:
    if (Array.isArray(acc.pickupCodes)) {
      acc.pickupCodes.forEach((code) => pickupAccessorials.push({ code: String(code) }));
    }
    if (Array.isArray(acc.deliveryCodes)) {
      acc.deliveryCodes.forEach((code) => deliveryAccessorials.push({ code: String(code) }));
    }

    // Map common flags → example codes (validate with Accessorials endpoint per ZIP)
    if (acc.liftgatePickup) pickupAccessorials.push({ code: 'LFT' });
    if (acc.appointmentPickup) pickupAccessorials.push({ code: 'APT' });
    if (acc.insidePickup) pickupAccessorials.push({ code: 'INS' });

    if (acc.liftgateDelivery) deliveryAccessorials.push({ code: 'LFT' });
    if (acc.residentialDelivery) deliveryAccessorials.push({ code: 'RES' });
    if (acc.appointmentDelivery) deliveryAccessorials.push({ code: 'APT' });
    if (acc.insideDelivery) deliveryAccessorials.push({ code: 'INS' });

    // Only include arrays if they’re non-empty
    const body = {
      rateType: 'N',               // Nationwide LTL
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

  // --- Response parser -------------------------------------------------------

parseResponse(data) {
  // small helpers so this works even if pickFirst isn’t defined elsewhere
  const pickFirst = (obj, keys, fallback = 0) => {
    for (const k of keys) {
      if (obj && Object.prototype.hasOwnProperty.call(obj, k) && obj[k] != null) {
        return obj[k];
      }
    }
    return fallback;
  };
  const num = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };

  // --- Freight components (pickup + linehaul + delivery)
  const pickupFreight   = num(pickFirst(data, ['pickup_FreightCharge', 'pickupFreight', 'pickup_freight', 'pickupFreightCharge'], 0));
  const deliveryFreight = num(pickFirst(data, ['delivery_FreightCharge','deliveryFreight','delivery_freight','deliveryFreightCharge'], 0));
  const lineFreight     = num(pickFirst(data, ['freight_Charge','linehaul','freight','lineFreight'], 0));
  const baseFreight     = pickupFreight + deliveryFreight + lineFreight;

  // --- Fuel components
  const pickupFuel      = num(pickFirst(data, ['pickup_FSC','pickupFuel','pickup_fuel','pickupFuelSurcharge'], 0));
  const deliveryFuel    = num(pickFirst(data, ['delivery_FSC','deliveryFuel','delivery_fuel','deliveryFuelSurcharge'], 0));
  const lineFuel        = num(pickFirst(data, ['freight_FSC','fuelSurcharge','fuel','fsc','lineFuel'], 0));
  const fuelSurcharge   = pickupFuel + deliveryFuel + lineFuel;

  // --- Accessorials
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

  // --- Total (prefer API’s grand total)
  let total = num(pickFirst(data, ['quoteRateTotal', 'total', 'grandTotal', 'totalRate', 'amount'], 0));
  if (!total) {
    total = baseFreight + fuelSurcharge + accessorials;
  }

  // --- Transit / Quote Id
  const transitDays = parseInt(pickFirst(data, ['transitTime', 'transitDays', 'etaDays'], 3), 10) || 3;
  const quoteId = pickFirst(data, ['quoteId', 'quoteNumber', 'reference', 'id'], undefined)
               || pickFirst(data?.quote || {}, ['number', 'id'], undefined);

  // Debug breakdown
  console.log('🔍 STG Price Breakdown:');
  console.log('   Pickup:       $' + (pickupFreight + pickupFuel).toFixed(2));
  console.log('   Linehaul:     $' + (lineFreight   + lineFuel).toFixed(2));
  console.log('   Delivery:     $' + (deliveryFreight + deliveryFuel).toFixed(2));
  console.log('   Accessorials: $' + accessorials.toFixed(2));
  console.log('   Total:        $' + total.toFixed(2));

  // Return normalized result
  return this.formatStandardResponse({
    service: 'Standard LTL',
    baseFreight,                    // pickup + line + delivery (freight only)
    fuelSurcharge,                  // pickup + line + delivery (fuel only)
    accessorialCharges: accessorials,
    total,                          // keep both keys for downstream compatibility
    totalCost: total,
    transitDays,
    guaranteed: false,
    quoteId,
    validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    raw: data,
  });
}
}
module.exports = STGProvider;
