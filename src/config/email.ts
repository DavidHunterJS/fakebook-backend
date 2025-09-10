import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

// Create reusable transporter using your env variable names
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: parseInt(process.env.EMAIL_PORT || '587', 10),
  secure: process.env.EMAIL_SECURE === 'true', // Convert string to boolean
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD,
  },
});

// ✅ FIX: Only verify the connection if not in a test environment.
// This prevents the server from crashing during automated tests in your CI/CD pipeline.
if (process.env.NODE_ENV !== 'test') {
  transporter.verify(function (error, success) {
    if (error) {
      console.error('Email transporter configuration error:', error);
    } else {
      console.log('✅ Email server is ready to take our messages');
    }
  });
}

/**
 * Sends a magic link email to the specified user.
 * @param email The recipient's email address.
 * @param token The magic link token.
 * @returns {Promise<boolean>} A promise that resolves to true if the email is sent successfully.
 */
export const sendMagicLinkEmail = async (email: string, token: string): Promise<boolean> => {
  const backendUrl = process.env.BACKEND_URL || 'http://localhost:5000';
  const magicLink = `${backendUrl}/api/auth/verify?token=${token}`;
  
  const mailOptions = {
    from: `"${process.env.EMAIL_FROM_NAME || 'Your App'}" <${process.env.EMAIL_FROM_ADDRESS || process.env.EMAIL_USER}>`,
    to: email,
    subject: 'Sign in to ComplianceKit.app',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; padding: 20px; border-radius: 8px;">
        <h2 style="color: #1976d2; text-align: center;">Sign in to ComplianceKit.app</h2>
        <p>Hello,</p>
        <p>Click the button below to sign in to your account. This link is valid for 15 minutes.</p>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${magicLink}" 
             style="background-color: #1976d2; color: white; padding: 12px 24px; 
                    text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">
            Sign In Securely
          </a>
        </div>
        
        <p>If the button doesn't work, you can copy and paste this link into your browser:</p>
        <p style="word-break: break-all; color: #666; background-color: #f5f5f5; padding: 10px; border-radius: 4px;">${magicLink}</p>
        
        <hr style="border: 0; border-top: 1px solid #e0e0e0; margin: 20px 0;">
        
        <p style="color: #999; font-size: 12px; text-align: center;">
          If you did not request this email, you can safely ignore it.
        </p>
      </div>
    `
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('Magic link email sent successfully:', info.messageId);
    return true;
  } catch (error) {
    console.error('Failed to send magic link email:', error);
    // In a real application, you might want to throw a more specific error
    throw new Error('Failed to send email');
  }
};

