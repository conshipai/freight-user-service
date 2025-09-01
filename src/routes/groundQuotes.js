// At the top, add:
const GroundProviderFactory = require('../services/providers/GroundProviderFactory');

// Replace the processGroundQuote function:
async function processGroundQuote(requestId) {
  try {
    console.log('🔄 Processing ground quote:', requestId);
    
    // Get the request details
    const request = await GroundRequest.findById(requestId)
      .select('+ltlDetails +accessorials');
      
    if (!request) {
      throw new Error('Request not found');
    }

    // Prepare data for carriers
    const carrierRequestData = {
      origin: request.origin,
      destination: request.destination,
      pickupDate: request.pickupDate,
      commodities: request.ltlDetails?.commodities || [],
      accessorials: request.accessorials,
      serviceType: request.serviceType
    };

    // Get rates from all active carriers in parallel
    const carrierRates = await GroundProviderFactory.getRatesFromAll(carrierRequestData);
    
    if (carrierRates.length === 0) {
      throw new Error('No carriers returned rates');
    }

    // Save each carrier's rate
    for (const rate of carrierRates) {
      // Create cost record
      const cost = new GroundCost({
        requestId: requestId,
        provider: rate.provider,
        carrierName: rate.carrierName,
        service: rate.service,
        serviceType: request.serviceType,
        costs: {
          baseFreight: rate.baseFreight,
          fuelSurcharge: rate.fuelSurcharge,
          accessorials: rate.accessorialCharges,
          totalCost: rate.totalCost
        },
        transit: {
          businessDays: rate.transitDays,
          guaranteed: rate.guaranteed
        },
        externalQuoteId: rate.quoteId,
        validUntil: rate.validUntil,
        status: 'completed'
      });
      await cost.save();
      
      // Create quote with markup
      const markupPercentage = 18; // TODO: Get from MarkupService based on user
      const markupAmount = rate.totalCost * (markupPercentage / 100);
      
      const quote = new GroundQuote({
        requestId: requestId,
        costId: cost._id,
        userId: request.userId,
        carrier: {
          name: rate.carrierName,
          code: rate.provider,
          service: rate.service
        },
        rawCost: {
          baseFreight: rate.baseFreight,
          fuelSurcharge: rate.fuelSurcharge,
          accessorials: rate.accessorialCharges,
          total: rate.totalCost
        },
        markup: {
          type: 'percentage',
          percentage: markupPercentage,
          totalMarkup: markupAmount
        },
        customerPrice: {
          subtotal: rate.totalCost + markupAmount,
          fees: 0,
          total: rate.totalCost + markupAmount
        },
        transit: {
          businessDays: rate.transitDays,
          guaranteed: rate.guaranteed
        },
        status: 'active',
        validUntil: rate.validUntil
      });
      await quote.save();
      
      console.log(`💰 Saved quote from ${rate.carrierName}: $${quote.customerPrice.total.toFixed(2)}`);
    }
    
    // Update request status to quoted
    await GroundRequest.findByIdAndUpdate(requestId, {
      status: 'quoted',
      quotedAt: new Date(),
      quoteCount: carrierRates.length
    });
    
    console.log(`✅ Ground quote complete with ${carrierRates.length} rates`);
    
  } catch (error) {
    console.error('❌ Error processing ground quote:', error);
    await GroundRequest.findByIdAndUpdate(requestId, {
      status: 'failed',
      error: error.message,
      failedAt: new Date()
    });
  }
}
