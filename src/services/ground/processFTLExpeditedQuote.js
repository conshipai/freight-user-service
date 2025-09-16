// src/services/ground/processFTLExpeditedQuote.js
const GroundRequest = require('../../models/GroundRequest');
const Carrier = require('../../models/Carrier');
const crypto = require('crypto');
const emailService = require('../emailService');
const { ShipmentLifecycle } = require('../../constants/shipmentLifecycle');
/**
 * Process FTL/Expedited quote requests by notifying carriers
 * and waiting for manual responses
 */
async function processFTLExpeditedQuote(requestId) {
  console.log('🚚 Starting FTL/Expedited quote process for:', requestId);
  
  try {
    const request = await GroundRequest.findById(requestId);
    if (!request) {
      throw new Error('Request not found');
    }

    const serviceType = request.serviceType; // 'ftl' or 'expedited'
    console.log(`📋 Processing ${serviceType.toUpperCase()} request:`, request.requestNumber);

    // Get eligible carriers for this service type
    const carriers = await getEligibleCarriers(serviceType, request.formData);
    console.log(`📧 Found ${carriers.length} eligible carriers`);

    if (carriers.length === 0) {
      await GroundRequest.findByIdAndUpdate(requestId, {
        status: ShipmentLifecycle.QUOTE_EXPIRED,
        error: 'No carriers available for this service type'
      });
      return;
    }

    // Generate magic links for each carrier
    const carrierTokens = [];
    for (const carrier of carriers) {
      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes
      
      carrierTokens.push({
        carrierId: carrier._id,
        carrierName: carrier.name,
        token,
        expiresAt,
        submitted: false
      });
    }

    // Update request with carrier tokens
    await GroundRequest.findByIdAndUpdate(requestId, {
      status: ShipmentLifecycle.QUOTE_PROCESSING,
      carrierTokens,
      carrierNotificationSentAt: new Date()
    });

    // Send emails to carriers
    const emailPromises = carriers.map((carrier, index) => {
      const token = carrierTokens[index].token;
      return sendCarrierNotification(carrier, request, token, serviceType);
    });

    await Promise.all(emailPromises);
    console.log('✅ All carrier notifications sent');

    // Schedule a job to check for responses after 30 minutes
    scheduleResponseCheck(requestId, 30 * 60 * 1000);

    return {
      success: true,
      carriersNotified: carriers.length,
      responseDeadline: new Date(Date.now() + 30 * 60 * 1000)
    };

  } catch (error) {
    console.error('❌ Error in processFTLExpeditedQuote:', error);
    await GroundRequest.findByIdAndUpdate(requestId, {
      status: ShipmentLifecycle.QUOTE_EXPIRED,
      error: error.message
    });
    throw error;
  }
}

/**
 * Get carriers eligible for FTL or Expedited service
 */
async function getEligibleCarriers(serviceType, formData) {
  const query = {
    active: true,
    [`services.${serviceType}`]: true
  };

  // For expedited, filter by truck type if specified
  if (serviceType === 'expedited' && formData.truckType) {
    query['equipment'] = formData.truckType;
  }

  // For FTL, filter by equipment type if specified
  if (serviceType === 'ftl' && formData.equipmentType) {
    query['equipment'] = formData.equipmentType;
  }

  // Get carriers that service the origin and destination areas
  if (formData.originState && formData.destState) {
    query['serviceAreas'] = {
      $all: [formData.originState, formData.destState]
    };
  }

  const carriers = await Carrier.find(query).limit(10); // Limit to 10 carriers
  
  // If no carriers found with strict criteria, relax the search
  if (carriers.length === 0) {
    delete query.equipment;
    delete query.serviceAreas;
    return await Carrier.find(query).limit(5);
  }

  return carriers;
}

/**
 * Send email notification to carrier with magic link
 */
async function sendCarrierNotification(carrier, request, token, serviceType) {
  const formData = request.formData;
  const magicLink = `${process.env.APP_URL}/carrier/quote/${token}`;
  
  // Calculate total weight and pieces
  const totalWeight = formData.loadType === 'legal' 
    ? formData.legalLoadWeight 
    : formData.commodities.reduce((sum, c) => sum + Number(c.weight || 0), 0);
    
  const totalPieces = formData.loadType === 'legal'
    ? formData.legalLoadPallets || '26'
    : formData.commodities.reduce((sum, c) => sum + Number(c.quantity || 0), 0);

  const emailData = {
    to: carrier.contactEmail,
    subject: `🚨 ${serviceType.toUpperCase()} Quote Request - ${request.requestNumber}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: ${serviceType === 'expedited' ? '#dc2626' : '#2563eb'}; color: white; padding: 20px; text-align: center;">
          <h1>${serviceType === 'expedited' ? 'EXPEDITED' : 'FTL'} Quote Request</h1>
          <p style="margin: 0;">Response Required Within 30 Minutes</p>
        </div>
        
        <div style="padding: 20px; background: #f9fafb;">
          <h2>Shipment Details</h2>
          
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Request #:</strong></td>
              <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${request.requestNumber}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Service:</strong></td>
              <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${serviceType.toUpperCase()}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Origin:</strong></td>
              <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">
                ${formData.originCity}, ${formData.originState} ${formData.originZip}
              </td>
            </tr>
            <tr>
              <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Destination:</strong></td>
              <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">
                ${formData.destCity}, ${formData.destState} ${formData.destZip}
              </td>
            </tr>
            <tr>
              <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Pickup Date:</strong></td>
              <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">
                ${new Date(formData.pickupDate).toLocaleDateString()}
              </td>
            </tr>
            <tr>
              <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Weight:</strong></td>
              <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${totalWeight} lbs</td>
            </tr>
            <tr>
              <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Pieces:</strong></td>
              <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${totalPieces}</td>
            </tr>
            ${serviceType === 'ftl' && formData.equipmentType ? `
            <tr>
              <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Equipment:</strong></td>
              <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${formData.equipmentType}</td>
            </tr>
            ` : ''}
            ${serviceType === 'expedited' && formData.truckType ? `
            <tr>
              <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Truck Type:</strong></td>
              <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${formData.truckType}</td>
            </tr>
            ` : ''}
            ${serviceType === 'expedited' && formData.serviceMode ? `
            <tr>
              <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Service Mode:</strong></td>
              <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">
                ${formData.serviceMode === 'team' ? 'Team Drivers' : 'Dedicated Driver'}
              </td>
            </tr>
            ` : ''}
            ${serviceType === 'expedited' && formData.asap ? `
            <tr>
              <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Timing:</strong></td>
              <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; color: #dc2626; font-weight: bold;">
                ASAP - URGENT
              </td>
            </tr>
            ` : ''}
          </table>

          ${formData.specialInstructions ? `
          <div style="margin-top: 20px; padding: 15px; background: #fef3c7; border-left: 4px solid #f59e0b;">
            <strong>Special Instructions:</strong><br>
            ${formData.specialInstructions}
          </div>
          ` : ''}

          <div style="margin-top: 30px; text-align: center;">
            <a href="${magicLink}" 
               style="display: inline-block; padding: 15px 30px; background: ${serviceType === 'expedited' ? '#dc2626' : '#2563eb'}; 
                      color: white; text-decoration: none; border-radius: 5px; font-weight: bold;">
              SUBMIT YOUR QUOTE →
            </a>
            <p style="color: #6b7280; margin-top: 10px;">
              This link expires in 30 minutes
            </p>
          </div>
        </div>
        
        <div style="padding: 15px; background: #1f2937; color: #9ca3af; text-align: center; font-size: 12px;">
          <p>This is an automated quote request from Conship AI</p>
          <p>Do not reply to this email</p>
        </div>
      </div>
    `
  };

  return emailService.sendEmail(emailData);
}

/**
 * Schedule a check for carrier responses after deadline
 */
function scheduleResponseCheck(requestId, delayMs) {
  setTimeout(async () => {
    try {
      const request = await GroundRequest.findById(requestId);
      if (!request) return;

      // Count how many carriers responded
      const responses = request.carrierTokens.filter(t => t.submitted).length;
      
      if (request.status === ShipmentLifecycle.QUOTE_PROCESSING) {
        if (responses > 0) {
          // Update status to quoted if we have responses
          await GroundRequest.findByIdAndUpdate(requestId, {
            status: ShipmentLifecycle.QUOTE_READY
          });
          console.log(`✅ Request ${request.requestNumber}: ${responses} quotes received`);
        } else {
          // No responses received
          await GroundRequest.findByIdAndUpdate(requestId, {
            status: ShipmentLifecycle.QUOTE_EXPIRED,
            error: 'No carriers responded within the deadline'
          });
          console.log(`⚠️ Request ${request.requestNumber}: No carrier responses`);
        }
      }
    } catch (error) {
      console.error('Error in scheduleResponseCheck:', error);
    }
  }, delayMs);
}

module.exports = { 
  processFTLExpeditedQuote,
  getEligibleCarriers,
  sendCarrierNotification
};
