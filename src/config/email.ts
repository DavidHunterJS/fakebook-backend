// src/config/email.ts
import nodemailer from 'nodemailer';

// Create reusable transporter using your env variable names
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: parseInt(process.env.EMAIL_PORT || '587'),
  secure: process.env.EMAIL_SECURE === 'true', // Convert string to boolean
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD,
  },
});

// Verify connection configuration
transporter.verify(function (error, success) {
  if (error) {
    console.error('Email configuration error:', error);
  } else {
    console.log('Email server is ready to take our messages');
  }
});

export const sendMagicLinkEmail = async (email: string, token: string) => {
  const backendUrl = process.env.BACKEND_URL || 'http://localhost:5000';
  const magicLink = `${backendUrl}/api/auth/verify?token=${token}`;
  
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: 'Sign in to ComplianceKit.app',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #1976d2;">Sign in to ComplianceKit.app</h2>
        <p>Hello!</p>
        <p>Click the button below to sign in to your account. This link will expire in 15 minutes.</p>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${magicLink}" 
             style="background-color: #1976d2; color: white; padding: 12px 24px; 
                    text-decoration: none; border-radius: 5px; display: inline-block;">
            Sign In to ComplianceKit.app
          </a>
        </div>
        
        <p>If the button doesn't work, copy and paste this link into your browser:</p>
        <p style="word-break: break-all; color: #666;">${magicLink}</p>
        
        <p style="color: #999; font-size: 14px; margin-top: 30px;">
          If you didn't request this email, you can safely ignore it.
        </p>
      </div>
    `
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('Magic link email sent:', info.messageId);
    return true;
  } catch (error) {
    console.error('Failed to send magic link email:', error);
    throw new Error('Failed to send email');
  }
};