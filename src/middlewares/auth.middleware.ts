// src/middlewares/auth.middleware.ts
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import User from '../models/User';
import { IAuthPayload } from '../types/user.types';
import dotenv from 'dotenv';
dotenv.config();

export default async (req: Request, res: Response, next: NextFunction): Promise<void | Response> => {
  // Add debugging
  console.log("Auth middleware called");
  console.log("Headers:", req.headers);
  
  // Get token from header - support multiple header formats
  const authHeader = req.header('authorization');
  let token = req.header('x-auth-token');
  
  // Check Authorization header if x-auth-token is not present
  if (!token && authHeader) {
    // Handle 'Bearer TOKEN' format
    if (authHeader.startsWith('Bearer ')) {
      token = authHeader.slice(7).trim();
    } else {
      // Handle plain token format
      token = authHeader.trim();
    }
  }

  // Check if no token
  if (!token) {
    console.log("No token provided in request");
    return res.status(401).json({ message: 'No token, authorization denied' });
  }

  try {
    const jwtSecret = process.env.JWT_SECRET;
    console.log("JWT_SECRET exists:", !!jwtSecret);
    
    if (!jwtSecret) {
      console.error("JWT_SECRET is not defined in environment variables");
      throw new Error('JWT_SECRET is not defined');
    }

    // Verify token
    console.log("Attempting to verify token:", token.substring(0, 15) + "...");
    const decoded = jwt.verify(token, jwtSecret) as IAuthPayload;
    console.log("Token verified successfully. User ID:", decoded.user?.id);
    
    // Make sure decoded has the expected structure
    if (!decoded.user || !decoded.user.id) {
      console.error("Token doesn't contain expected user data");
      return res.status(401).json({ message: 'Invalid token format' });
    }
    
    // Get user from database to ensure it's current
    console.log("Looking up user ID in database:", decoded.user.id);
    const user = await User.findById(decoded.user.id).select('-password');
    
    if (!user) {
      console.log("User not found in database");
      return res.status(404).json({ message: 'User not found' });
    }
    
    if (!user.isActive) {
      console.log("User account is deactivated");
      return res.status(403).json({ message: 'Account is deactivated' });
    }
    
    // Update last active timestamp
    user.lastActive = new Date();
    await user.save();
    
    req.user = user;
    console.log("Auth successful for user:", user.username);
    next();
  } catch (err) {
    console.error("Token verification error:", err);
    // Provide more specific error messages
    if (err instanceof jwt.JsonWebTokenError) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ message: 'Token has expired' });
      } else {
        return res.status(401).json({ 
          message: 'Token is not valid', 
          error: err.message 
        });
      }
    }
    return res.status(401).json({ message: 'Token is not valid' });
  }
};
