// src/middlewares/auth.middleware.ts
import { Response, NextFunction, RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import User from '../models/User';
import { IAuthPayload } from '../types/user.types';
import { AuthenticatedRequest } from '../types/request.types';
import dotenv from 'dotenv';

dotenv.config();

const authMiddleware: RequestHandler = async (req, res, next): Promise<void | Response> => {
  console.log("Auth middleware called");
  
  // Method 1: Check for session-based authentication (Passport.js/OAuth)
  if (req.isAuthenticated && req.isAuthenticated() && req.user) {
    console.log("Session auth successful for user:", (req.user as any).username || (req.user as any).email);
    
    // Update last active for session users too
    try {
      const user = await User.findById((req.user as any)._id);
      if (user) {
        user.lastActive = new Date();
        await user.save();
      }
    } catch (error) {
      console.error("Error updating last active for session user:", error);
    }
    
    return next();
  }

  // Method 2: Check for JWT token authentication
  const authHeader = req.header('authorization');
  let token = req.header('x-auth-token');
  
  if (!token && authHeader) {
    if (authHeader.startsWith('Bearer ')) {
      token = authHeader.slice(7).trim();
    } else {
      token = authHeader.trim();
    }
  }

  if (!token) {
    console.log("No token and no session found, authorization denied");
    return res.status(401).json({ message: 'No token, authorization denied' });
  }

  try {
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      console.error('FATAL ERROR: JWT_SECRET is not defined in environment variables.');
      process.exit(1);
    }

    const decoded = jwt.verify(token, jwtSecret) as IAuthPayload;
    if (!decoded.user || !decoded.user.id) {
      return res.status(401).json({ message: 'Invalid token format' });
    }

    const user = await User.findById(decoded.user.id).select('-password');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (!user.isActive) {
      return res.status(403).json({ message: 'Account is deactivated' });
    }

    user.lastActive = new Date();
    await user.save();
    req.user = user;
    console.log("JWT auth successful for user:", user.username);
    next();
  } catch (err) {
    console.error("Token verification error:", err);
    if (err instanceof jwt.JsonWebTokenError) {
      return res.status(401).json({ message: 'Token is not valid', error: err.message });
    }
    return res.status(401).json({ message: 'Token is not valid' });
  }
};

export default authMiddleware;