/**
 * services/ground/processGroundQuote.js
 *
 * Drop-in: parallel ground rating via GroundProviderFactory.
 * - Minimal changes: adds GroundProviderFactory + replaces processGroundQuote.
 * - Keeps your Cost/Quote creation + 18% markup flow intact.
 */

const GroundRequest = require('../models/GroundRequest');
const GroundCost    = require('../models/GroundCost');
const GroundQuote   = require('../models/GroundQuote');

// NEW: provider factory to fan-out to all active ground carriers
const GroundProviderFactory = require('../services/providers/GroundProviderFactory');

/**
 * Kick off rating for a ground (LTL) request and persist results.
 * @param {string} requestId - Mongo _id of the GroundRequest
 */
async function processGroundQuote(requestId) {
  try {
    console.log('🔄 Processing ground quote:', requestId);

    // Ensure we can read LTL-specific fields and accessorials
    const request = await GroundRequest.findById(requestId).select('+ltlDetails +accessorials');
    if (!request) {
      throw new Error('Request not found');
    }

    // Prepare normalized payload for carrier providers
    const carrierRequestData = {
      origin:       request.origin,
      destination:  request.destination,
      pickupDate:   request.pickupDate,
      commodities:  request.ltlDetails?.commodities || [],
      accessorials: request.accessorials || {},
      serviceType:  request.serviceType || 'standard'
    };

    // Ask all active providers for rates in parallel
    const carrierRates = await GroundProviderFactory.getRatesFromAll(carrierRequestData);

    if (!Array.isArray(carrierRates) || carrierRates.length === 0) {
      throw new Error('No carriers returned rates');
    }

    // Persist each carrier result as GroundCost + GroundQuote (with markup)
    for (const rate of carrierRates) {
      // Defensive defaults so a provider with partial data doesn't blow up the run
      const baseFreight        = Number(rate.baseFreight ?? 0);
      const fuelSurcharge      = Number(rate.fuelSurcharge ?? 0);
      const accessorialCharges = Array.isArray(rate.accessorialCharges) ? rate.accessorialCharges : [];
      const computedTotal      = baseFreight + fuelSurcharge + accessorialCharges.reduce((s, a) => s + Number(a.amount || 0), 0);
      const totalCost          = Number(rate.totalCost ?? computedTotal);
      const transitDays        = Number(rate.transitDays ?? 0);
      const guaranteed         = Boolean(rate.guaranteed ?? false);

      const cost = new GroundCost({
        requestId,
        provider: rate.provider || 'unknown',
        carrierName: rate.carrierName || 'Unknown Carrier',
        service: rate.service || request.serviceType || 'standard',
        serviceType: request.serviceType,
        costs: {
          baseFreight,
          fuelSurcharge,
          accessorials: accessorialCharges,
          totalCost
        },
        transit: {
          businessDays: transitDays,
          guaranteed
        },
        externalQuoteId: rate.quoteId || rate.externalQuoteId || null,
        validUntil: rate.validUntil || null,
        status: 'completed'
      });
      await cost.save();

      // Apply markup (TODO: replace with MarkupService/user-specific rules)
      const markupPercentage = 18;
      const markupAmount = totalCost * (markupPercentage / 100);

      const quote = new GroundQuote({
        requestId,
        costId: cost._id,
        userId: request.userId,
        carrier: {
          name: rate.carrierName || 'Unknown Carrier',
          code: rate.provider || 'unknown',
          service: rate.service || request.serviceType || 'standard'
        },
        rawCost: {
          baseFreight,
          fuelSurcharge,
          accessorials: accessorialCharges,
          total: totalCost
        },
        markup: {
          type: 'percentage',
          percentage: markupPercentage,
          totalMarkup: markupAmount
        },
        customerPrice: {
          subtotal: totalCost + markupAmount,
          fees: 0,
          total: totalCost + markupAmount
        },
        transit: {
          businessDays: transitDays,
          guaranteed
        },
        status: 'active',
        validUntil: rate.validUntil || null
      });
      await quote.save();

      console.log(`💰 Saved quote from ${quote.carrier.name}: $${quote.customerPrice.total.toFixed(2)}`);
    }

    // Finalize request status
    await GroundRequest.findByIdAndUpdate(requestId, {
      status: 'quoted',
      quotedAt: new Date(),
      quoteCount: carrierRates.length
    });

    console.log(`✅ Ground quote complete with ${carrierRates.length} rates`);
  } catch (error) {
    console.error('❌ Error processing ground quote:', error?.stack || error?.message || error);
    try {
      await GroundRequest.findByIdAndUpdate(requestId, {
        status: 'failed',
        error: error.message || String(error),
        failedAt: new Date()
      });
    } catch (e) {
      console.error('⚠️ Failed to mark request as failed:', e?.message || e);
    }
  }
}

module.exports = router;
