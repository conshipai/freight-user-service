// src/services/ground/processGroundQuote.js - FIXED VERSION
const GroundRequest = require('../../models/GroundRequest');
const GroundCost = require('../../models/GroundCost');
const GroundQuote = require('../../models/GroundQuote');
const User = require('../../models/User');
const Company = require('../../models/Company');
const CarrierAccount = require('../../models/CarrierAccount');
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

async function processGroundQuote(requestId) {
  try {
    console.log('🔄 Processing ground quote:', requestId);

    const request = await GroundRequest.findById(requestId);
    if (!request) {
      throw new Error('Request not found');
    }

    // FIX: Extract data from formData field instead of non-existent fields
    const formData = request.formData || {};
    
    const carrierRequestData = {
      origin: {
        city: formData.originCity,
        state: formData.originState,
        zipCode: formData.originZip
      },
      destination: {
        city: formData.destCity,
        state: formData.destState,
        zipCode: formData.destZip
      },
      pickupDate: formData.pickupDate,
      commodities: formData.commodities || [],
      accessorials: {
        liftgatePickup: formData.liftgatePickup,
        liftgateDelivery: formData.liftgateDelivery,
        residentialDelivery: formData.residentialDelivery,
        insideDelivery: formData.insideDelivery,
        limitedAccessPickup: formData.limitedAccessPickup,
        limitedAccessDelivery: formData.limitedAccessDelivery
      },
      serviceType: request.serviceType || 'standard'
    };

    console.log('📦 Request data prepared:', JSON.stringify(carrierRequestData, null, 2));

    // Get rates from carriers
    const carrierRates = await GroundProviderFactory.getRatesWithCustomerAccounts(
      carrierRequestData,
      request.userId,
      request.companyId
    );

    console.log(`📊 Got ${carrierRates?.length || 0} total rates`);

    if (!Array.isArray(carrierRates) || carrierRates.length === 0) {
      console.log('⚠️ No carriers returned rates');
      await GroundRequest.findByIdAndUpdate(requestId, {
        status: 'failed',
        error: 'No carriers available or all failed to return rates'
      });
      return;
    }

    // Process each rate
    for (const rate of carrierRates) {
      try {
        const baseFreight = Number(rate.baseFreight || 0);
        const fuelSurcharge = Number(rate.fuelSurcharge || 0);
        const accTotal = toAccessorialsNumber(rate.accessorialCharges);
        const totalCost = Number(rate.totalCost || (baseFreight + fuelSurcharge + accTotal));
        const transitDays = Number(rate.transitDays || 3);

        // Save cost
        const cost = new GroundCost({
          requestId,
          provider: rate.provider || 'unknown',
          carrierName: rate.carrierName || 'Unknown Carrier',
          service: rate.service || 'Standard LTL',
          serviceType: request.serviceType,
          costs: {
            baseFreight,
            fuelSurcharge,
            accessorials: accTotal,
            totalAccessorials: accTotal,
            totalCost,
            currency: 'USD'
          },
          transit: {
            days: transitDays,
            businessDays: transitDays,
            guaranteed: rate.guaranteed || false
          },
          status: 'completed'
        });
        await cost.save();

        // Calculate markup (simplified for now)
        const markupPercentage = 18;
        const markupAmount = totalCost * 0.18;
        const customerTotal = totalCost + markupAmount;

        // Save quote
        const quote = new GroundQuote({
          requestId,
          costId: cost._id,
          requestNumber: request.requestNumber,
          userId: request.userId,
          carrier: {
            name: rate.carrierName,
            code: rate.provider,
            service: rate.service || 'Standard LTL'
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
            subtotal: totalCost,
            fees: 0,
            total: customerTotal
          },
          transit: {
            days: transitDays,
            businessDays: transitDays,
            guaranteed: rate.guaranteed || false
          },
          status: 'active'
        });
        await quote.save();
console.log(`💾 Saved to DB:
  - Cost ID: ${cost._id} (ground_costs)
  - Quote ID: ${quote._id} (ground_quotes)
  - Request: ${requestId}
  - Carrier: ${rate.carrierName}
  - Our Cost: $${cost.costs.totalCost}
  - Customer Price: $${quote.customerPrice.total}`);
        console.log(`✅ Saved quote from ${rate.carrierName}: $${customerTotal.toFixed(2)}`);
      } catch (err) {
        console.error(`❌ Error processing rate:`, err);
      }
    }

    // Update request status
    await GroundRequest.findByIdAndUpdate(requestId, {
      status: 'quoted'
    });

    console.log('✅ Ground quote processing complete');
  } catch (error) {
    console.error('❌ Error in processGroundQuote:', error);
    await GroundRequest.findByIdAndUpdate(requestId, {
      status: 'failed',
      error: error.message
    });
  }
}

module.exports = { processGroundQuote };
