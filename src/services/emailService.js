// src/services/emailService.js - UPDATED
const { Resend } = require('resend');

// IMPORTANT: Put your API key in .env file, never in code!
const resend = new Resend(process.env.RESEND_API_KEY);

// ============ EXISTING FUNCTIONS (KEEP THESE) ============

// Send welcome email with login credentials
const sendPartnerWelcomeEmail = async (email, data) => {
  const { companyName, contactName, tempPassword, magicLink } = data;
  
  try {
    await resend.emails.send({
      from: 'Freight Command Center <onboarding@resend.dev>',
      to: email,
      subject: `Welcome to Freight Command Center - ${companyName}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #333;">Welcome to Freight Command Center!</h2>
          
          <p>Hello ${contactName},</p>
          
          <p>Your partner account for <strong>${companyName}</strong> has been created successfully.</p>
          
          <div style="background-color: #f5f5f5; padding: 20px; border-radius: 5px; margin: 20px 0;">
            <h3 style="margin-top: 0;">Your Login Credentials:</h3>
            <p><strong>Email:</strong> ${email}</p>
            <p><strong>Temporary Password:</strong> ${tempPassword}</p>
          </div>
          
          <p>Click the button below to set up your account and change your password:</p>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${magicLink}" 
               style="display: inline-block; 
                      padding: 14px 30px; 
                      background-color: #5B21B6; 
                      color: white; 
                      text-decoration: none; 
                      border-radius: 5px;
                      font-weight: bold;">
              Set Up Your Account
            </a>
          </div>
          
          <p><strong>What you can do:</strong></p>
          <ul>
            <li>Access the Pricing Portal</li>
            <li>Manage your rates and markups</li>
            <li>View and create quotes</li>
            <li>Manage your team's access</li>
          </ul>
          
          <p style="color: #666; font-size: 14px; margin-top: 30px;">
            This link expires in 7 days. Please save your credentials in a secure location.
          </p>
          
          <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
          
          <p style="color: #999; font-size: 12px;">
            If you have any questions, please contact our support team.<br>
            This is an automated message, please do not reply to this email.
          </p>
        </div>
      `
    });
    
    console.log('Welcome email sent to:', email);
    return true;
  } catch (error) {
    console.error('Email send error:', error);
    throw error;
  }
};

// Keep existing magic link email for partner portal login
const sendMagicLinkEmail = async (email, token, contactName) => {
  const loginUrl = `${process.env.FRONTEND_URL}/partners/auth/verify?token=${token}`;
  
  try {
    await resend.emails.send({
      from: 'Freight Platform <onboarding@resend.dev>',
      to: email,
      subject: 'Your Login Link',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Hello ${contactName}!</h2>
          <p>Click the link below to log into the Partner Portal:</p>
          <a href="${loginUrl}" 
             style="display: inline-block; 
                    padding: 12px 24px; 
                    background-color: #FB923C; 
                    color: white; 
                    text-decoration: none; 
                    border-radius: 5px;">
            Log In to Portal
          </a>
          <p style="margin-top: 20px; font-size: 14px; color: #666;">
            This link will expire in 15 minutes for security reasons.
          </p>
        </div>
      `
    });
    
    console.log('Magic link sent to:', email);
  } catch (error) {
    console.error('Email send error:', error);
    throw error;
  }
};

// ============ NEW FUNCTIONS FOR CARRIER QUOTES ============

// Send carrier quote request email
const sendCarrierQuoteRequest = async (carrier, request, token) => {
  const serviceType = request.serviceType;
  const deadline = serviceType === 'expedited' ? '15 minutes' : '1 hour';
  const formData = request.formData;
  
  // Build milk run stops text if any
  let stopsHtml = '';
  if (request.additionalStops?.length > 0) {
    stopsHtml = `
      <div style="background: #fef3c7; border-left: 3px solid #f59e0b; padding: 10px; margin: 15px 0;">
        <strong>🚚 Milk Run - Multiple Stops:</strong>
        <ol style="margin: 5px 0;">
          ${request.additionalStops
            .sort((a, b) => a.sequence - b.sequence)
            .map(s => `
              <li>${s.type === 'pickup' ? '📦 Pickup' : '📍 Delivery'}: 
                ${s.city}, ${s.state} ${s.zipCode}
              </li>
            `).join('')}
        </ol>
      </div>
    `;
  }

  // Format commodities
  const totalWeight = formData.commodities.reduce((sum, c) => sum + (c.quantity * c.weight), 0);
  const totalPieces = formData.commodities.reduce((sum, c) => sum + parseInt(c.quantity), 0);

  try {
    const { data, error } = await resend.emails.send({
      from: 'Freight Quotes <quotes@resend.dev>', // Update with your domain
      to: carrier.email,
      subject: `${serviceType === 'expedited' ? '⚡ URGENT' : '🚚'} Quote Request #${request.requestNumber} - ${deadline} Response Required`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { 
              background: linear-gradient(135deg, #7c3aed 0%, #a855f7 100%); 
              color: white; 
              padding: 20px; 
              text-align: center; 
              border-radius: 10px 10px 0 0;
            }
            .urgent { 
              background: #ef4444; 
              color: white; 
              padding: 10px; 
              text-align: center; 
              font-weight: bold;
              animation: pulse 2s infinite;
            }
            @keyframes pulse {
              0%, 100% { opacity: 1; }
              50% { opacity: 0.8; }
            }
            .details { 
              background: #f9fafb; 
              padding: 20px; 
              margin: 20px 0; 
              border-radius: 8px;
              border: 1px solid #e5e7eb;
            }
            .commodity { 
              background: white; 
              padding: 15px; 
              margin: 10px 0; 
              border-left: 4px solid #7c3aed; 
              border-radius: 4px;
              box-shadow: 0 1px 3px rgba(0,0,0,0.1);
            }
            .cta-button { 
              display: inline-block; 
              padding: 15px 40px; 
              background: linear-gradient(135deg, #7c3aed 0%, #a855f7 100%); 
              color: white; 
              text-decoration: none; 
              border-radius: 50px; 
              font-weight: bold;
              font-size: 16px;
              box-shadow: 0 4px 6px rgba(124, 58, 237, 0.3);
              transition: all 0.3s ease;
            }
            .cta-button:hover {
              transform: translateY(-2px);
              box-shadow: 0 6px 12px rgba(124, 58, 237, 0.4);
            }
            .deadline { 
              color: #ef4444; 
              font-weight: bold; 
              font-size: 18px;
              text-align: center;
              margin: 20px 0;
            }
            .info-row {
              display: flex;
              justify-content: space-between;
              padding: 8px 0;
              border-bottom: 1px solid #e5e7eb;
            }
            .info-label {
              font-weight: 600;
              color: #6b7280;
            }
            .info-value {
              color: #111827;
            }
            .hazmat-warning {
              background: #fef2f2;
              border: 1px solid #fecaca;
              color: #991b1b;
              padding: 10px;
              border-radius: 4px;
              margin: 10px 0;
              text-align: center;
              font-weight: bold;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1 style="margin: 0;">Quote Request - ${serviceType.toUpperCase()}</h1>
              <p style="margin: 5px 0; opacity: 0.9;">Request #${request.requestNumber}</p>
            </div>
            
            ${serviceType === 'expedited' ? `
              <div class="urgent">
                ⚡ EXPEDITED SERVICE - 15 MINUTE RESPONSE REQUIRED ⚡
              </div>
            ` : ''}
            
            <div class="details">
              <h2 style="color: #1f2937; margin-top: 0;">📋 Shipment Details</h2>
              
              <div class="info-row">
                <span class="info-label">Service Type:</span>
                <span class="info-value" style="font-weight: bold; color: ${serviceType === 'expedited' ? '#ef4444' : '#7c3aed'};">
                  ${serviceType.toUpperCase()}
                </span>
              </div>
              
              <div class="info-row">
                <span class="info-label">Pickup Location:</span>
                <span class="info-value">${formData.originCity}, ${formData.originState} ${formData.originZip}</span>
              </div>
              
              <div class="info-row">
                <span class="info-label">Delivery Location:</span>
                <span class="info-value">${formData.destCity}, ${formData.destState} ${formData.destZip}</span>
              </div>
              
              <div class="info-row">
                <span class="info-label">Pickup Date:</span>
                <span class="info-value">${new Date(formData.pickupDate).toLocaleDateString('en-US', { 
                  weekday: 'long', 
                  year: 'numeric', 
                  month: 'long', 
                  day: 'numeric' 
                })}</span>
              </div>
              
              ${formData.deliveryDate ? `
                <div class="info-row">
                  <span class="info-label">Required Delivery:</span>
                  <span class="info-value" style="color: #ef4444; font-weight: bold;">
                    ${new Date(formData.deliveryDate).toLocaleDateString()} at ${formData.deliveryTime}
                  </span>
                </div>
              ` : ''}
              
              <div class="info-row">
                <span class="info-label">Total Weight:</span>
                <span class="info-value">${totalWeight.toLocaleString()} lbs</span>
              </div>
              
              <div class="info-row">
                <span class="info-label">Total Pieces:</span>
                <span class="info-value">${totalPieces}</span>
              </div>
              
              ${formData.equipmentType ? `
                <div class="info-row">
                  <span class="info-label">Equipment Required:</span>
                  <span class="info-value" style="font-weight: bold;">${formData.equipmentType}</span>
                </div>
              ` : ''}
            </div>
            
            ${stopsHtml}
            
            <h3 style="color: #1f2937;">📦 Commodities</h3>
            ${formData.commodities.map((c, i) => `
              <div class="commodity">
                <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
                  <strong style="color: #7c3aed;">Item ${i + 1}: ${c.description || 'General Freight'}</strong>
                  ${c.hazmat ? '<span style="background: #ef4444; color: white; padding: 2px 8px; border-radius: 4px; font-size: 12px;">HAZMAT</span>' : ''}
                </div>
                <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; font-size: 14px;">
                  <div><strong>Quantity:</strong> ${c.quantity} ${c.unitType || 'units'}</div>
                  <div><strong>Weight:</strong> ${c.weight} lbs each</div>
                  <div><strong>Dimensions:</strong> ${c.length}"L × ${c.width}"W × ${c.height}"H</div>
                  <div><strong>Total:</strong> ${c.quantity * c.weight} lbs</div>
                </div>
                ${c.nmfc ? `<div style="margin-top: 5px; font-size: 14px;"><strong>NMFC:</strong> ${c.nmfc}</div>` : ''}
                ${c.calculatedClass ? `<div style="font-size: 14px;"><strong>Class:</strong> ${c.calculatedClass}</div>` : ''}
              </div>
            `).join('')}
            
            ${formData.commodities.some(c => c.hazmat) ? `
              <div class="hazmat-warning">
                ⚠️ HAZARDOUS MATERIALS - Special handling required
              </div>
            ` : ''}
            
            ${formData.specialInstructions ? `
              <div style="background: #fffbeb; border: 1px solid #fcd34d; padding: 15px; border-radius: 4px; margin: 20px 0;">
                <strong style="color: #92400e;">📝 Special Instructions:</strong>
                <p style="margin: 5px 0; color: #451a03;">${formData.specialInstructions}</p>
              </div>
            ` : ''}
            
            <div class="deadline">
              ⏰ Please respond within ${deadline}
            </div>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/carrier/quote/${token.token}" class="cta-button">
                SUBMIT YOUR QUOTE →
              </a>
            </div>
            
            <div style="background: #f3f4f6; padding: 15px; border-radius: 4px; margin: 20px 0;">
              <p style="margin: 0; font-size: 14px; color: #6b7280;">
                <strong>Note:</strong> This link will expire in 2 hours. If you cannot provide a quote, 
                please click the link and select "Decline" so we can update our records.
              </p>
            </div>
            
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
            
            <p style="color: #9ca3af; font-size: 12px; text-align: center;">
              This is an automated quote request from Conship Freight Command Center.<br>
              If you have questions, please contact our operations team.<br>
              © ${new Date().getFullYear()} Conship - All rights reserved
            </p>
          </div>
        </body>
        </html>
      `
    });

    if (error) {
      console.error('❌ Resend error:', error);
      throw error;
    }

    console.log(`📧 Quote request sent to ${carrier.name} at ${carrier.email}`);
    return { success: true, messageId: data?.id };
    
  } catch (error) {
    console.error('Email send error:', error);
    throw error;
  }
};

// Send quote submission confirmation to carrier
const sendCarrierQuoteConfirmation = async (carrierEmail, carrierName, requestNumber, quoteAmount) => {
  try {
    await resend.emails.send({
      from: 'Freight Quotes <quotes@resend.dev>',
      to: carrierEmail,
      subject: `Quote Received - Request #${requestNumber}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: #10b981; color: white; padding: 20px; text-align: center; border-radius: 10px;">
            <h2 style="margin: 0;">✅ Quote Successfully Received</h2>
          </div>
          
          <div style="padding: 20px;">
            <p>Dear ${carrierName},</p>
            
            <p>Thank you for submitting your quote for Request #${requestNumber}.</p>
            
            <div style="background: #f3f4f6; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <p style="margin: 0;"><strong>Your Quote:</strong> $${quoteAmount.toLocaleString()}</p>
              <p style="margin: 10px 0 0 0;"><strong>Status:</strong> Under Review</p>
            </div>
            
            <p>We will review all submissions and contact you if your quote is selected.</p>
            
            <p>Best regards,<br>
            Conship Operations Team</p>
          </div>
        </div>
      `
    });
    
    console.log(`📧 Confirmation sent to ${carrierName}`);
  } catch (error) {
    console.error('Confirmation email error:', error);
    // Don't throw - this is not critical
  }
};

module.exports = {
  sendPartnerWelcomeEmail,       // Existing
  sendMagicLinkEmail,            // Existing  
  sendCarrierQuoteRequest,       // NEW
  sendCarrierQuoteConfirmation   // NEW
};
