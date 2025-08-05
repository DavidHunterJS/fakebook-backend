// src/middleware/validation.middleware.ts
import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { body, validationResult } from 'express-validator';

/**
 * Validate MongoDB ObjectId in route parameters
 */
export const validateObjectId = (paramName: string) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const id = req.params[paramName];
    
    if (!id) {
      return res.status(400).json({
        success: false,
        message: `${paramName} is required`
      });
    }
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: `Invalid ${paramName} format`
      });
    }
    
    next();
  };
};

/**
 * Validate multiple ObjectIds in route parameters
 */
export const validateMultipleObjectIds = (...paramNames: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    for (const paramName of paramNames) {
      const id = req.params[paramName];
      
      if (!id) {
        return res.status(400).json({
          success: false,
          message: `${paramName} is required`
        });
      }
      
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          message: `Invalid ${paramName} format`
        });
      }
    }
    
    next();
  };
};

/**
 * Handle validation errors from express-validator
 */
export const handleValidationErrors = (req: Request, res: Response, next: NextFunction) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array().map(error => ({
        field: error.type === 'field' ? error.path : error.type,
        message: error.msg
      }))
    });
  }
  
  next();
};

/**
 * Validate pagination parameters
 */
export const validatePagination = (req: Request, res: Response, next: NextFunction) => {
  const page = req.query.page as string;
  const limit = req.query.limit as string;
  
  if (page && (isNaN(Number(page)) || Number(page) < 1)) {
    return res.status(400).json({
      success: false,
      message: 'Page must be a positive number'
    });
  }
  
  if (limit && (isNaN(Number(limit)) || Number(limit) < 1 || Number(limit) > 100)) {
    return res.status(400).json({
      success: false,
      message: 'Limit must be between 1 and 100'
    });
  }
  
  next();
};

/**
 * Common validation rules for user registration
 */
export const validateUserRegistration = [
  body('username')
    .isLength({ min: 3, max: 30 })
    .withMessage('Username must be between 3 and 30 characters')
    .matches(/^[a-zA-Z0-9_]+$/)
    .withMessage('Username can only contain letters, numbers, and underscores'),
    
  body('email')
    .isEmail()
    .withMessage('Please provide a valid email')
    .normalizeEmail(),
    
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must contain at least one lowercase letter, one uppercase letter, and one number'),
    
  body('firstName')
    .isLength({ min: 1, max: 50 })
    .withMessage('First name is required and must be less than 50 characters')
    .trim(),
    
  body('lastName')
    .isLength({ min: 1, max: 50 })
    .withMessage('Last name is required and must be less than 50 characters')
    .trim(),
    
  handleValidationErrors
];

/**
 * Common validation rules for user login
 */
export const validateUserLogin = [
  body('email')
    .isEmail()
    .withMessage('Please provide a valid email')
    .normalizeEmail(),
    
  body('password')
    .notEmpty()
    .withMessage('Password is required'),
    
  handleValidationErrors
];

/**
 * Validation for post creation
 */
export const validatePostCreation = [
  body('content')
    .optional()
    .isLength({ max: 5000 })
    .withMessage('Post content cannot exceed 5000 characters'),
    
  body('privacy')
    .optional()
    .isIn(['public', 'friends', 'private'])
    .withMessage('Privacy must be public, friends, or private'),
    
  handleValidationErrors
];

/**
 * Validation for comment creation
 */
export const validateCommentCreation = [
  body('content')
    .notEmpty()
    .withMessage('Comment content is required')
    .isLength({ max: 1000 })
    .withMessage('Comment cannot exceed 1000 characters'),
    
  handleValidationErrors
];

/**
 * Validate search query parameters
 */
export const validateSearch = (req: Request, res: Response, next: NextFunction) => {
  const { q, type } = req.query;
  
  if (!q || typeof q !== 'string' || q.trim().length === 0) {
    return res.status(400).json({
      success: false,
      message: 'Search query is required'
    });
  }
  
  if (q.length < 2) {
    return res.status(400).json({
      success: false,
      message: 'Search query must be at least 2 characters long'
    });
  }
  
  if (type && !['users', 'posts', 'all'].includes(type as string)) {
    return res.status(400).json({
      success: false,
      message: 'Search type must be users, posts, or all'
    });
  }
  
  next();
};