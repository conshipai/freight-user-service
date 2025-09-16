// src/services/ground/carrierSubmissionHandler.js
const GroundRequest = require('../../models/GroundRequest');
const GroundCost = require('../../models/GroundCost');
const GroundQuote = require('../../models/GroundQuote');
const User = require('../../models/User');
const Company = require('../../models/Company');
const { ShipmentLifecycle } = require('../../constants/shipmentLifecycle');
/**
 * Validate carrier token and get request details
 */
async function validateCarrierToken(token) {
  const request = await GroundRequest.findOne({
    'carrierTokens.token': token,
    status: { $in: [ShipmentLifecycle.QUOTE_PROCESSING, ShipmentLifecycle.QUOTE_READY] }
  });

  if (!request) {
    return { valid: false, error: 'Invalid or expired token' };
  }

  const carrierToken = request.carrierTokens.find(t => t.token === token);
  
  if (!carrierToken) {
    return { valid: false, error: 'Token not found' };
  }

  if (new Date() > carrierToken.expiresAt) {
    return { valid: false, error: 'Token has expired' };
  }

  if (carrierToken.submitted) {
    return { valid: false, error: 'Quote already submitted' };
  }

  return {
    valid: true,
    request,
    carrierToken,
    carrierId: carrierToken.carrierId,
    carrierName: carrierToken.carrierName
  };
}

/**
 * Submit carrier quote for FTL/Expedited
 */
async function submitCarrierQuote(token, quoteData) {
  console.log('📝 Processing carrier quote submission');

  try {
    // Validate token
    const validation = await validateCarrierToken(token);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    const { request, carrierToken, carrierId, carrierName } = validation;
    console.log(`✅ Valid token for ${carrierName}, Request: ${request.requestNumber}`);

    // Parse the quote data
    const {
      baseRate,
      fuelSurcharge,
      additionalFees = [],
      transitDays,
      notes,
      validUntil,
      guaranteed = false,
      driverInfo = {}
    } = quoteData;

    // Calculate totals
    const baseFreight = Number(baseRate || 0);
    const fuel = Number(fuelSurcharge || 0);
    const feesTotal = additionalFees.reduce((sum, fee) => sum + Number(fee.amount || 0), 0);
    const totalCost = baseFreight + fuel + feesTotal;

    console.log(`💰 Quote: Base $${baseFreight}, Fuel $${fuel}, Fees $${feesTotal}, Total $${totalCost}`);

    // Save carrier cost
    const cost = new GroundCost({
      requestId: request._id,
      requestNumber: request.requestNumber,
      provider: 'carrier_direct',
      carrierName: carrierName,
      carrierId: carrierId,
      service: request.serviceType === 'ftl' ? 'Full Truckload' : 'Expedited',
      serviceType: request.serviceType,
      costs: {
        baseFreight,
        fuelSurcharge: fuel,
        accessorials: feesTotal,
        totalAccessorials: feesTotal,
        totalCost,
        currency: 'USD'
      },
      transit: {
        days: Number(transitDays || 1),
        businessDays: Number(transitDays || 1),
        guaranteed
      },
      additionalFees,
      carrierNotes: notes,
      driverInfo,
      status: ShipmentLifecycle.QUOTE_READY,
      submittedAt: new Date()
    });

    await cost.save();
    console.log(`✅ Cost saved: ${cost._id}`);

    // Get user and company for markup
    const user = await User.findById(request.userId);
    const company = user?.companyId ? await Company.findById(user.companyId) : null;

    // Calculate markup
    let markupPercentage = 15; // Default for FTL/Expedited (lower than LTL)
    
    if (user?.role === 'system_admin' || user?.role === 'conship_employee') {
      markupPercentage = 0;
    } else if (company?.markupRules?.length > 0) {
      const rule = company.markupRules.find(r => 
        r.active && 
        (r.serviceType === 'all' || r.serviceType === request.serviceType)
      );
      if (rule) {
        markupPercentage = rule.percentage || 15;
      }
    }

    const markupAmount = totalCost * (markupPercentage / 100);
    const customerTotal = totalCost + markupAmount;

    console.log(`💵 Markup ${markupPercentage}% = $${markupAmount}, Customer: $${customerTotal}`);

    // Create customer quote
    const quote = new GroundQuote({
      requestId: request._id,
      costId: cost._id,
      userId: request.userId,
      requestNumber: request.requestNumber,
      companyId: company?._id,
      
      carrier: {
        name: carrierName,
        id: carrierId,
        service: request.serviceType === 'ftl' ? 'Full Truckload' : 'Expedited Service'
      },
      
      rawCost: {
        baseFreight,
        fuelSurcharge: fuel,
        accessorials: feesTotal,
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
        total: customerTotal,
        currency: 'USD'
      },
      
      transit: {
        days: Number(transitDays || 1),
        businessDays: Number(transitDays || 1),
        guaranteed
      },
      
      additionalInfo: {
        notes,
        driverInfo,
        validUntil: validUntil || new Date(Date.now() + 48 * 60 * 60 * 1000) // 48 hours default
      },
      
      status: ShipmentLifecycle.QUOTE_READY,
      validUntil: validUntil || new Date(Date.now() + 48 * 60 * 60 * 1000),
      
      ranking: {
        recommended: false // Will be updated based on comparison with other quotes
      }
    });

    await quote.save();
    console.log(`✅ Quote created: ${quote.quoteNumber}`);

    // Mark token as submitted
    const tokenIndex = request.carrierTokens.findIndex(t => t.token === token);
    request.carrierTokens[tokenIndex].submitted = true;
    request.carrierTokens[tokenIndex].submittedAt = new Date();
    request.carrierTokens[tokenIndex].quoteId = quote._id;

    // Check if this is the first quote
    const submittedCount = request.carrierTokens.filter(t => t.submitted).length;
    if (submittedCount === 1) {
      request.status = ShipmentLifecycle.QUOTE_READY;
      console.log('🎯 First quote received, updating status to quoted');
    }

    await request.save();

    // Update rankings if multiple quotes exist
    await updateQuoteRankings(request._id);

    return {
      success: true,
      quoteNumber: quote.quoteNumber,
      customerPrice: customerTotal,
      transitDays,
      message: 'Quote submitted successfully'
    };

  } catch (error) {
    console.error('❌ Error submitting carrier quote:', error);
    throw error;
  }
}

/**
 * Update quote rankings based on price and transit time
 */
async function updateQuoteRankings(requestId) {
  const quotes = await GroundQuote.find({ requestId, status: ShipmentLifecycle.QUOTE_READY })
    .sort({ 'customerPrice.total': 1 }); // Sort by price ascending

  if (quotes.length === 0) return;

  // Find best price and fastest transit
  const lowestPrice = quotes[0].customerPrice.total;
  const fastestTransit = Math.min(...quotes.map(q => q.transit.days));

  for (const quote of quotes) {
    const ranking = {
      recommended: false,
      cheapest: quote.customerPrice.total === lowestPrice,
      fastest: quote.transit.days === fastestTransit
    };

    // Recommend the quote that balances price and speed
    if (quotes.length === 1) {
      ranking.recommended = true;
    } else if (ranking.cheapest && ranking.fastest) {
      ranking.recommended = true;
    } else if (ranking.cheapest && quote.transit.days <= fastestTransit + 1) {
      ranking.recommended = true;
    }

    await GroundQuote.findByIdAndUpdate(quote._id, { ranking });
  }

  console.log(`📊 Updated rankings for ${quotes.length} quotes`);
}

/**
 * Get request details for carrier view
 */
async function getRequestForCarrier(token) {
  const validation = await validateCarrierToken(token);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const { request, carrierName } = validation;
  const formData = request.formData;

  // Calculate totals
  const totalWeight = formData.loadType === 'legal' 
    ? formData.legalLoadWeight 
    : formData.commodities.reduce((sum, c) => sum + Number(c.weight || 0), 0);
    
  const totalPieces = formData.loadType === 'legal'
    ? formData.legalLoadPallets || '26'
    : formData.commodities.reduce((sum, c) => sum + Number(c.quantity || 0), 0);

  return {
    requestNumber: request.requestNumber,
    serviceType: request.serviceType,
    carrierName,
    origin: {
      city: formData.originCity,
      state: formData.originState,
      zip: formData.originZip,
      company: formData.originCompany,
      address: formData.originAddress,
      is24Hour: formData.pickup24Hour,
      hours: formData.pickupHours
    },
    destination: {
      city: formData.destCity,
      state: formData.destState,
      zip: formData.destZip,
      company: formData.destCompany,
      address: formData.destAddress,
      is24Hour: formData.delivery24Hour,
      hours: formData.deliveryHours
    },
    shipment: {
      pickupDate: formData.pickupDate,
      totalWeight,
      totalPieces,
      loadType: formData.loadType,
      commodities: formData.loadType === 'custom' ? formData.commodities : null,
      equipmentType: formData.equipmentType,
      truckType: formData.truckType,
      serviceMode: formData.serviceMode,
      asap: formData.asap,
      teamService: formData.teamService,
      dropTrailer: formData.dropTrailer
    },
    specialInstructions: formData.specialInstructions,
    accessorials: {
      liftgatePickup: formData.liftgatePickup,
      liftgateDelivery: formData.liftgateDelivery,
      residentialDelivery: formData.residentialDelivery,
      insideDelivery: formData.insideDelivery,
      limitedAccessPickup: formData.limitedAccessPickup,
      limitedAccessDelivery: formData.limitedAccessDelivery
    },
    deadline: validation.carrierToken.expiresAt
  };
}

module.exports = {
  validateCarrierToken,
  submitCarrierQuote,
  getRequestForCarrier,
  updateQuoteRankings
};
