// src/types/express.d.ts
import { Express } from 'express-serve-static-core';
import { IUser } from '../models/User';

declare global {
  namespace Express {
    interface Request {
      user?: IUser;
    }
  }
}