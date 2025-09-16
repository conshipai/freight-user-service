// src/services/ground/processGroundQuote.js - FIXED VERSION
const GroundRequest = require('../../models/GroundRequest');
const GroundCost = require('../../models/GroundCost');
const GroundQuote = require('../../models/GroundQuote');
const User = require('../../models/User');
const Company = require('../../models/Company');
const GroundProviderFactory = require('../providers/GroundProviderFactory');
const { ShipmentLifecycle } = require('../../constants/shipmentLifecycle');
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
  console.log('🔄 Starting processGroundQuote for request:', requestId);
  
  try {
    const request = await GroundRequest.findById(requestId);
    if (!request) {
      throw new Error('Request not found');
    }

    console.log('📋 Found request:', request.requestNumber);

    // Extract data from formData
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

    console.log('📦 Getting rates from carriers...');

    // Get rates from carriers
    const carrierRates = await GroundProviderFactory.getRatesWithCustomerAccounts(
      carrierRequestData,
      request.userId,
      request.companyId
    );

    console.log(`📊 Got ${carrierRates?.length || 0} carrier rates`);

    if (!Array.isArray(carrierRates) || carrierRates.length === 0) {
      console.log('⚠️ No carriers returned rates');
      await GroundRequest.findByIdAndUpdate(requestId, {
        status: ShipmentLifecycle.QUOTE_EXPIRED,
        error: 'No carriers available or all failed to return rates'
      });
      return;
    }

    let successfulQuotes = 0;
    let failedQuotes = 0;

    // Process each rate
    for (const rate of carrierRates) {
      try {
        console.log(`\n💰 Processing rate from ${rate.carrierName || rate.provider}`);
        
        // Parse the costs
        const baseFreight = Number(rate.baseFreight || 0);
        const fuelSurcharge = Number(rate.fuelSurcharge || 0);
        const accTotal = toAccessorialsNumber(rate.accessorialCharges);
        const totalCost = Number(rate.totalCost || (baseFreight + fuelSurcharge + accTotal));
        const transitDays = Number(rate.transitDays || 3);

        console.log(`  Base: $${baseFreight}, Fuel: $${fuelSurcharge}, Acc: $${accTotal}, Total: $${totalCost}`);

        // Save cost
        const cost = new GroundCost({
          requestId,
          requestNumber: request.requestNumber,
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
          status: ShipmentLifecycle.QUOTE_READY
        });
        
        await cost.save();
        console.log(`  ✅ Cost saved with ID: ${cost._id}`);

        // Get user for markup calculation
        const user = await User.findById(request.userId);
        const company = user?.companyId ? await Company.findById(user.companyId) : null;

        // Calculate markup
        let markupPercentage = 18; // Default
        
        // System admins and employees see direct costs (0% markup)
        if (user?.role === 'system_admin' || user?.role === 'conship_employee') {
          markupPercentage = 0;
          console.log(`  📊 User role ${user.role} gets 0% markup`);
        } else if (company?.markupRules?.length > 0) {
          // Find applicable markup rule
          const rule = company.markupRules.find(r => 
            r.active && 
            (r.provider === 'ALL' || r.provider === rate.provider) &&
            (r.mode === 'all' || r.mode === 'road')
          );
          if (rule) {
            markupPercentage = rule.percentage || 18;
            console.log(`  📊 Company rule applies ${markupPercentage}% markup`);
          }
        }

        const markupAmount = totalCost * (markupPercentage / 100);
        const customerTotal = totalCost + markupAmount;

        console.log(`  💸 Markup: ${markupPercentage}% = $${markupAmount.toFixed(2)}`);
        console.log(`  💵 Customer price: $${customerTotal.toFixed(2)}`);

        // Create quote - with all required fields
        const quoteData = {
          // Required fields
          requestId: request._id,
          costId: cost._id,
          userId: request.userId,
          
          // Optional but helpful
          requestNumber: request.requestNumber,
          companyId: company?._id,
          
          // Carrier info
          carrier: {
            name: rate.carrierName || rate.provider,
            code: rate.provider,
            service: rate.service || 'Standard LTL'
          },
          
          // Raw cost (with required 'total')
          rawCost: {
            baseFreight,
            fuelSurcharge,
            accessorials: accTotal,
            total: totalCost  // REQUIRED field
          },
          
          // Markup (with required 'totalMarkup')
          markup: {
            type: 'percentage',
            percentage: markupPercentage,
            totalMarkup: markupAmount  // REQUIRED field
          },
          
          // Customer price (with required 'total')
          customerPrice: {
            subtotal: totalCost,
            fees: 0,
            total: customerTotal,  // REQUIRED field
            currency: 'USD'
          },
          
          // Transit info
          transit: {
            days: transitDays,
            businessDays: transitDays,
            guaranteed: rate.guaranteed || false
          },
          
          // Status and validity
          status: ShipmentLifecycle.QUOTE_READY,
          validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          
          // Ranking
          ranking: {
            recommended: successfulQuotes === 0  // First quote is recommended
          }
        };

        console.log(`  📝 Creating quote with required fields...`);
        const quote = new GroundQuote(quoteData);
        
        await quote.save();
        successfulQuotes++;
        
        console.log(`  ✅ Quote saved: ${quote.quoteNumber} (ID: ${quote._id})`);
        console.log(`     Customer sees: ${rate.carrierName} - $${customerTotal.toFixed(2)}`);
        
      } catch (err) {
        failedQuotes++;
        console.error(`  ❌ Error processing rate from ${rate.carrierName}:`, err.message);
        console.error(`     Stack:`, err.stack);
      }
    }

    // Update request status
    const finalStatus = successfulQuotes > 0 ? ShipmentLifecycle.QUOTE_READY : ShipmentLifecycle.QUOTE_EXPIRED;
    await GroundRequest.findByIdAndUpdate(requestId, {
      status: finalStatus,
      error: successfulQuotes === 0 ? 'Failed to create any quotes' : null
    });

    console.log('\n✅ Ground quote processing complete:');
    console.log(`   Successful quotes: ${successfulQuotes}`);
    console.log(`   Failed quotes: ${failedQuotes}`);
    console.log(`   Request status: ${finalStatus}`);
    
  } catch (error) {
    console.error('❌ Fatal error in processGroundQuote:', error);
    console.error('   Stack:', error.stack);
    
    await GroundRequest.findByIdAndUpdate(requestId, {
      status: ShipmentLifecycle.QUOTE_EXPIRED,
      error: error.message
    });
  }
}

module.exports = { processGroundQuote };
