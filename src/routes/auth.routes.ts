// src/routes/auth.routes.ts
import express, { Router } from 'express';
import { body } from 'express-validator';
import * as authController from '../controllers/auth.controller';
import authMiddleware from '../middlewares/auth.middleware';

const router: Router = express.Router();

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
 * @route   GET api/auth/me
 * @desc    Get current user
 * @access  Private
 */
router.get('/me', authMiddleware, authController.getMe);

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
 * @route   POST api/auth/oauth/google
 * @desc    Authenticate with Google
 * @access  Public
 */
router.post('/oauth/google', authController.googleAuth);

/**
 * @route   POST api/auth/oauth/facebook
 * @desc    Authenticate with Facebook
 * @access  Public
 */
router.post('/oauth/facebook', authController.facebookAuth);

/**
 * @route   POST api/auth/logout
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