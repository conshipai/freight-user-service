const { Resend } = require('resend');

// Initialize Resend (you'll need to get an API key from resend.com)
const resend = new Resend(process.env.RESEND_API_KEY);

const sendInviteEmail = async (email, companyName, token) => {
  const inviteUrl = `${process.env.FRONTEND_URL}/partners/register?token=${token}`;
  
  try {
    await resend.emails.send({
      from: 'Freight Platform <noreply@yourcompany.com>',
      to: email,
      subject: `Invitation to join as a Foreign Partner - ${companyName}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Welcome to Our Freight Partner Network!</h2>
          <p>Your company, <strong>${companyName}</strong>, has been invited to join our platform as a foreign partner.</p>
          <p>Please click the link below to complete your registration:</p>
          <a href="${inviteUrl}" style="display: inline-block; padding: 12px 24px; background-color: #5B21B6; color: white; text-decoration: none; border-radius: 5px;">
            Complete Registration
          </a>
          <p style="margin-top: 20px; font-size: 14px; color: #666;">
            This link will expire in 7 days. If you have any questions, please contact our support team.
          </p>
        </div>
      `
    });
    
    console.log('Invite email sent to:', email);
  } catch (error) {
    console.error('Email send error:', error);
    throw error;
  }
};

const sendMagicLinkEmail = async (email, token, contactName) => {
  const loginUrl = `${process.env.FRONTEND_URL}/partners/auth/verify?token=${token}`;
  
  try {
    await resend.emails.send({
      from: 'Freight Platform <noreply@yourcompany.com>',
      to: email,
      subject: 'Your Login Link',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Hello ${contactName}!</h2>
          <p>Click the link below to log into the Partner Portal:</p>
          <a href="${loginUrl}" style="display: inline-block; padding: 12px 24px; background-color: #FB923C; color: white; text-decoration: none; border-radius: 5px;">
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
  sendInviteEmail,
  sendMagicLinkEmail
};
