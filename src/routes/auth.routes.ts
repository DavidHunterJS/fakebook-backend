// src/routes/auth.routes.ts
import express, { Request, Response, Router } from 'express';
import { body } from 'express-validator';
import * as authController from '../controllers/auth.controller';
import authMiddleware from '../middlewares/auth.middleware';
import User from '../models/User';
import crypto from 'crypto';
import MagicToken from '../models/MagicLink';
import { sendMagicLinkEmail } from '../config/email';
import jwt from 'jsonwebtoken';
import { IAuthPayload } from '../types/user.types';



const router: Router = express.Router();

router.post('/magic-link', async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    console.log('Creating magic link for:', email);
    
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    
    console.log('Generated token:', token);
    console.log('Expires at:', expiresAt);
    
    // Delete existing tokens
    const deletedCount = await MagicToken.deleteMany({ email: email.toLowerCase() });
    console.log('Deleted old tokens:', deletedCount.deletedCount);

    // Create new token
    const savedToken = await MagicToken.create({
      email: email.toLowerCase(),
      token,
      expiresAt
    });
    
    console.log('Saved token to database:', {
      id: savedToken._id,
      email: savedToken.email,
      token: savedToken.token.substring(0, 10) + '...',
      expiresAt: savedToken.expiresAt
    });

    await sendMagicLinkEmail(email, token);
    res.json({ success: true });
  } catch (error) {
    console.error('Magic link creation error:', error);
    res.status(500).json({ error: 'Failed to send magic link' });
  }
});

/**
 * @route   GET /api/auth/verify
 * @desc    Verifies a magic link token and logs the user in.
 * @access  Public
 */
router.get('/verify', authController.verifyMagicLink);


/**
 * @route   POST api/auth/register
 * @desc    Register a new user
 * @access  Public
 */
router.post(
  '/register',
  [
    // Username validation
    body('username')
      .trim()
      .isLength({ min: 3, max: 30 })
      .withMessage('Username must be between 3 and 30 characters')
      .matches(/^[a-zA-Z0-9_]+$/)
      .withMessage('Username can only contain letters, numbers and underscores')
      .escape(),
    
    // Email validation
    body('email')
      .isEmail()
      .withMessage('Please include a valid email')
      .normalizeEmail(),
    
    // Password validation
    body('password')
      .isLength({ min: 8 })
      .withMessage('Password must be at least 8 characters long')
      .matches(/^(?=.*\d)(?=.*[a-z])(?=.*[A-Z]).*$/)
      .withMessage('Password must contain at least one uppercase letter, one lowercase letter, and one number'),
    
    // Name validation
    body('firstName')
      .trim()
      .notEmpty()
      .withMessage('First name is required')
      .isLength({ max: 50 })
      .withMessage('First name cannot exceed 50 characters')
      .escape(),
    
    body('lastName')
      .trim()
      .notEmpty()
      .withMessage('Last name is required')
      .isLength({ max: 50 })
      .withMessage('Last name cannot exceed 50 characters')
      .escape()
  ],
  authController.register
);

/**
 * @route   POST api/auth/login
 * @desc    Authenticate user & get token
 * @access  Public
 */
router.post(
  '/login',
  [
    // Email validation
    body('email')
      .isEmail()
      .withMessage('Please include a valid email')
      .normalizeEmail(),
    
    // Password validation
    body('password')
      .notEmpty()
      .withMessage('Password is required')
  ],
  authController.login
);

/**
 * @route GET api/auth/current
 * @desc Get current authenticated user (handles both JWT and Session, returns null if not authenticated)
 * @access Public (but returns user data only if authenticated)
 */
router.get('/current', async (req: Request, res: Response) => {
  try {
    let authenticatedUser = null;

    // Method 1: Check for session-based authentication (OAuth, Magic Link)
    if (req.isAuthenticated && req.isAuthenticated() && req.user) {
      authenticatedUser = await User.findById((req.user as any)._id).select('-password');
    }
    
    // Method 2: Check session userId (for magic links)
    else if ((req.session as any)?.userId) {
      authenticatedUser = await User.findById((req.session as any).userId).select('-password');
    }
    
    // Method 3: Check for JWT token authentication
    else {
      const token = extractTokenFromRequest(req);
      if (token) {
        const user = await authenticateWithJWT(token);
        if (user) {
          authenticatedUser = user;
        }
      }
    }

    // Update last active time for authenticated user
    if (authenticatedUser && authenticatedUser.isActive) {
      authenticatedUser.lastActive = new Date();
      await authenticatedUser.save();
    }

    // Always return consistent format
    res.json({ user: authenticatedUser });

  } catch (error) {
    console.error('Error in /current route:', error);
    res.json({ user: null });
  }
});

// Helper function to extract token from request headers
const extractTokenFromRequest = (req: Request): string | null => {
  const authHeader = req.header('authorization');
  let token = req.header('x-auth-token');

  if (!token && authHeader) {
    if (authHeader.startsWith('Bearer ')) {
      token = authHeader.slice(7).trim();
    } else {
      token = authHeader.trim();
    }
  }

  return token || null;
};

// Helper function to authenticate with JWT
const authenticateWithJWT = async (token: string): Promise<any | null> => {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    console.error('JWT_SECRET not configured');
    return null;
  }

  try {
    const decoded = jwt.verify(token, jwtSecret) as IAuthPayload;
    
    if (decoded.user && decoded.user.id) {
      const user = await User.findById(decoded.user.id).select('-password');
      return user && user.isActive ? user : null;
    }
  } catch (jwtError) {
    console.log('Invalid JWT token in /current request:', jwtError instanceof Error ? jwtError.message : 'Unknown error');
  }

  return null;
};


/**
 * @route   GET api/auth/me
 * @desc    Get current user
 * @access  Private
 */
router.get('/me', authMiddleware, async (req: Request, res: Response) => {
  try {
    if (req.user) {
      res.json({ user: req.user });
    } else {
      res.status(401).json({ message: 'User not found' });
    }
  } catch (error) {
    console.error('Error in /me route:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});
/**
 * @route   PUT api/auth/password
 * @desc    Change password
 * @access  Private
 */
router.put(
  '/password',
  [
    authMiddleware,
    body('currentPassword')
      .notEmpty()
      .withMessage('Current password is required'),
    
    body('newPassword')
      .isLength({ min: 8 })
      .withMessage('New password must be at least 8 characters long')
      .matches(/^(?=.*\d)(?=.*[a-z])(?=.*[A-Z]).*$/)
      .withMessage('New password must contain at least one uppercase letter, one lowercase letter, and one number')
      .custom((value, { req }) => {
        if (value === req.body.currentPassword) {
          throw new Error('New password must be different from current password');
        }
        return true;
      })
  ],
  authController.changePassword
);

/**
 * @route   POST api/auth/forgot-password
 * @desc    Request password reset email
 * @access  Public
 */
router.post(
  '/forgot-password',
  [
    body('email')
      .isEmail()
      .withMessage('Please include a valid email')
      .normalizeEmail()
  ],
  authController.forgotPassword
);

/**
 * @route   POST api/auth/reset-password/:token
 * @desc    Reset password using token
 * @access  Public
 */
router.post(
  '/reset-password/:token',
  [
    body('password')
      .isLength({ min: 8 })
      .withMessage('Password must be at least 8 characters long')
      .matches(/^(?=.*\d)(?=.*[a-z])(?=.*[A-Z]).*$/)
      .withMessage('Password must contain at least one uppercase letter, one lowercase letter, and one number')
  ],
  authController.resetPassword
);

/**
 * @route   GET api/auth/verify/:token
 * @desc    Verify user email
 * @access  Public
 */
router.get('/verify/:token', authController.verifyEmail);

/**
 * @route   POST api/auth/resend-verification
 * @desc    Resend verification email
 * @access  Private
 */
router.post('/resend-verification', authMiddleware, authController.resendVerification);


/**
 * @route   GET api/auth/logout
 * @desc    Logout user (useful for tracking session state on server)
 * @access  Private
 */
router.post('/logout', authMiddleware, authController.logout);

/**
 * @route   DELETE api/auth/delete-account
 * @desc    Delete user account
 * @access  Private
 */
router.delete(
  '/delete-account',
  [
    authMiddleware,
    body('password')
      .notEmpty()
      .withMessage('Password is required for account deletion')
  ],
  authController.deleteAccount
);

export default router;