const { Resend } = require('resend');

// IMPORTANT: Put your API key in .env file, never in code!
const resend = new Resend(process.env.RESEND_API_KEY);

// NEW: Send welcome email with login credentials
const sendPartnerWelcomeEmail = async (email, data) => {
  const { companyName, contactName, tempPassword, magicLink } = data;
  
  try {
    await resend.emails.send({
      from: 'Freight Command Center <onboarding@resend.dev>', // Change to your domain
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
      from: 'Freight Platform <onboarding@resend.dev>', // Change to your domain
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

module.exports = {
  sendPartnerWelcomeEmail,  // NEW export
  sendMagicLinkEmail         // Keep this for portal login
};
