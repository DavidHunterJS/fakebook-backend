import { Express, Request, Response, NextFunction } from 'express-serve-static-core';
import { IUser } from '../models/User';

declare global {
  namespace Express {
    // Extend Request with your user property
    interface Request {
      user?: IUser;
    }
  }
}

// More permissive RequestHandler definition
declare module 'express-serve-static-core' {
  interface RequestHandler {
    (req: any, res: any, next?: any): any;
  }
  
  interface ErrorRequestHandler {
    (err: any, req: any, res: any, next: any): any;
  }
}