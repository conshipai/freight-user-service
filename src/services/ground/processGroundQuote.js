/**
 * services/ground/processGroundQuote.js
 *
 * Parallel ground rating via GroundProviderFactory with customer/company accounts.
 * - Uses GroundProviderFactory.getRatesWithCustomerAccounts(...)
 * - Handles accessorials as a NUMBER (matching updated GroundCost model)
 * - 💸 Markup logic:
 *     • system_admin / conship_employee  -> NO MARKUP (raw costs only)
 *     • everyone else (business partners, foreign partners) -> company rules (carrier-specific or ALL) or default 18% + $50 ground fee
 */

const GroundRequest = require('../../models/GroundRequest');
const GroundCost    = require('../../models/GroundCost');
const GroundQuote   = require('../../models/GroundQuote');
const User          = require('../../models/User');
const Company       = require('../../models/Company');

// Kept for future account-context features
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
    return Object.values(accessorialCharges).reduce((sum, v) => {
      if (typeof v === 'number') return sum + v;
      if (v && typeof v === 'object') return sum + Number(v.amount ?? 0);
      return sum;
    }, 0);
  }
  return 0;
}

/**
 * Kick off rating for a ground (LTL) request and persist results (with role-aware markup).
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

    // Preload user + company (for markup rules)
    let user = null;
    let company = null;

    if (request.userId && request.userId.toString() !== '000000000000000000000000') {
      try {
        user = await User.findById(request.userId);
        if (user?.companyId) {
          company = await Company.findById(user.companyId);
        }
      } catch (e) {
        console.warn('⚠️ Could not resolve user/company for markup rules:', e?.message || e);
      }
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

        // Save RAW cost (always)
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
            totalAccessorials: accTotal,
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

        // === Role-aware markup/admin fee ===
        // Default to NO markup; only add when appropriate
        let markupPercentage = 0;
        let adminFee = 0;

        const role = user?.role;

        const isAdminOrConship =
          role === 'system_admin' || role === 'conship_employee';

        if (!isAdminOrConship) {
          // Business partners and foreign partners get markup
          if (user?.companyId) {
            if (company?.markupRules?.length) {
              // Find specific carrier markup or use ALL
              const carrierRule = company.markupRules.find(
                (r) => r.provider === rate.provider && r.active
              );
              const defaultRule = company.markupRules.find(
                (r) => r.provider === 'ALL' && r.active
              );

              if (carrierRule) {
                markupPercentage = Number(carrierRule.percentage ?? 18);
                adminFee = Number(carrierRule.flatFee ?? 0);
              } else if (defaultRule) {
                markupPercentage = Number(defaultRule.percentage ?? 18);
                adminFee = Number(defaultRule.flatFee ?? 0);
              } else {
                // No active rules -> fallback defaults
                markupPercentage = 18;
                adminFee = 0;
              }

              // Add $50 admin fee for ground shipments
              adminFee += 50;
            } else {
              // Default markup if no rules defined
              markupPercentage = 18;
              adminFee = 50; // includes the ground fee
            }
          } else {
            // No company -> treat as general partner
            markupPercentage = 18;
            adminFee = 50;
          }
        }

        const markupAmount  = totalCost * (markupPercentage / 100);
        const customerTotal = totalCost + markupAmount + adminFee;

        // Store quote with role-aware markup applied
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
            accountName: rate.accountName  // e.g. 'Your FedEx Account'
          },
          rawCost: {
            baseFreight,
            fuelSurcharge,
            accessorials: accTotal,
            total: totalCost
          },
          markup: {
            type: 'percentage',
            percentage: markupPercentage,
            totalMarkup: markupAmount
          },
          customerPrice: {
            subtotal: totalCost + markupAmount,
            fees: adminFee,
            total: customerTotal
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

        console.log(
          `💰 Saved quote from ${quote.carrier.name}: raw $${quote.rawCost.total.toFixed(
            2
          )} → customer $${quote.customerPrice.total.toFixed(2)} (${tag}) [role=${role || 'unknown'}]`
        );
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
