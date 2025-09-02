/**
 * services/ground/processGroundQuote.js
 *
 * Drop-in: parallel ground rating via GroundProviderFactory with customer/company accounts.
 * - Uses GroundProviderFactory.getRatesWithCustomerAccounts(...)
 * - Handles accessorials as a NUMBER (matching updated GroundCost model)
 * - ❗ Stores RAW COSTS ONLY — markup is NOT applied here (calculated at display time)
 */

const GroundRequest = require('../../models/GroundRequest');
const GroundCost    = require('../../models/GroundCost');
const GroundQuote   = require('../../models/GroundQuote');

// NEW: include customer/company carrier account context (kept for future use)
const CarrierAccount = require('../../models/CarrierAccount');

// provider fan-out
const GroundProviderFactory = require('../providers/GroundProviderFactory');

// Helper: robustly coerce accessorials to a single number
function toAccessorialsNumber(accessorialCharges) {
  if (typeof accessorialCharges === 'number') return accessorialCharges;
  if (Array.isArray(accessorialCharges)) {
    return accessorialCharges.reduce((sum, ch) => sum + Number(ch?.amount ?? 0), 0);
  }
  if (accessorialCharges && typeof accessorialCharges === 'object') {
    // handle map/object form { code: { amount }, ... } OR { code: number }
    return Object.values(accessorialCharges).reduce((sum, v) => {
      if (typeof v === 'number') return sum + v;
      if (v && typeof v === 'object') return sum + Number(v.amount ?? 0);
      return sum;
    }, 0);
  }
  return 0;
}

/**
 * Kick off rating for a ground (LTL) request and persist results.
 * Supports both company accounts and customer-linked accounts via ProviderFactory.
 * @param {string} requestId - Mongo _id of the GroundRequest
 */
async function processGroundQuote(requestId) {
  try {
    console.log('🔄 Processing ground quote:', requestId);

    const request = await GroundRequest.findById(requestId);
    if (!request) {
      throw new Error('Request not found');
    }

    const carrierRequestData = {
      origin:       request.origin,
      destination:  request.destination,
      pickupDate:   request.pickupDate,
      commodities:  request.ltlDetails?.commodities || [],
      accessorials: request.accessorials || {},
      serviceType:  request.serviceType || 'standard'
    };

    console.log('📦 Request data prepared, calling carriers...');

    // Include customer/company account resolution inside the factory
    const carrierRates = await GroundProviderFactory.getRatesWithCustomerAccounts(
      carrierRequestData,
      request.userId,
      request.companyId // ensure GroundRequest has companyId or pass null
    );

    console.log(`📊 Got ${carrierRates?.length || 0} total rates`);

    if (!Array.isArray(carrierRates) || carrierRates.length === 0) {
      console.log('⚠️ No carriers returned rates');
      await GroundRequest.findByIdAndUpdate(requestId, {
        status: 'failed',
        error: 'No carriers available or all failed'
      });
      return;
    }

    for (const rate of carrierRates) {
      try {
        // Normalize/defend numbers
        const baseFreight   = Number(rate.baseFreight || 0);
        const fuelSurcharge = Number(rate.fuelSurcharge || 0);
        const accTotal      = toAccessorialsNumber(rate.accessorialCharges);
        const computedTotal = baseFreight + fuelSurcharge + accTotal;
        const totalCost     = Number(rate.totalCost ?? computedTotal);
        const transitDays   = Number(rate.transitDays || 0);
        const guaranteed    = Boolean(rate.guaranteed || false);

        // Save raw cost
        const cost = new GroundCost({
          requestId,
          provider: rate.provider || 'unknown',
          carrierName: rate.carrierName || 'Unknown Carrier',
          service: rate.service || request.serviceType || 'standard',
          serviceType: request.serviceType,
          costs: {
            baseFreight,
            fuelSurcharge,
            accessorials: accTotal,         // numeric field per updated model
            totalAccessorials: accTotal,    // optional: keep this in sync
            totalCost,
            currency: 'USD'
          },
          transit: {
            businessDays: transitDays,
            guaranteed
          },
          apiResponse: {
            quoteId: rate.quoteId,
            accountType: rate.accountType,  // 'company' | 'customer'
            accountName: rate.accountName
          },
          status: 'completed'
        });
        await cost.save();

        // Store raw costs only — markup will be calculated at display time
        const quote = new GroundQuote({
          requestId,
          costId: cost._id,
          userId: request.userId,
          companyId: request.companyId, // Make sure this is set!
          carrier: {
            name: rate.carrierName || 'Unknown Carrier',
            code: rate.provider || 'unknown',
            service: rate.service || request.serviceType || 'standard',
            accountType: rate.accountType, // 'customer' or 'company'
            accountName: rate.accountName  // 'Your FedEx Account' etc
          },
          rawCost: {
            baseFreight,
            fuelSurcharge,
            accessorials: accTotal,
            total: totalCost
          },
          // Remove markup calculation here - just store placeholder
          markup: {
            type: 'percentage',
            percentage: 0,
            totalMarkup: 0
          },
          // Store raw cost as customer price temporarily
          customerPrice: {
            subtotal: totalCost,
            fees: 0,
            total: totalCost
          },
          transit: {
            businessDays: transitDays,
            guaranteed
          },
          status: 'active',
          validUntil: rate.validUntil || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        });
        await quote.save();

        const tag =
          rate.accountType === 'customer'
            ? 'Your Account'
            : 'Company Account';

        console.log(`💰 Saved quote from ${quote.carrier.name}: $${quote.rawCost.total.toFixed(2)} (${tag})`);
      } catch (rateError) {
        console.error(`❌ Error processing rate from ${rate.provider}:`, rateError?.message || rateError);
      }
    }

    await GroundRequest.findByIdAndUpdate(requestId, {
      status: 'quoted',
      quotedAt: new Date()
    });

    console.log(`✅ Ground quote complete with ${carrierRates.length} rates`);
  } catch (error) {
    console.error('❌ Error processing ground quote:', error?.stack || error?.message || error);
    await GroundRequest.findByIdAndUpdate(requestId, {
      status: 'failed',
      error: error.message || String(error)
    });
  }
}

module.exports = { processGroundQuote };
