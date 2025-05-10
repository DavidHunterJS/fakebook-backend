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


// This allows route handlers to return Response objects
declare module 'express-serve-static-core' {
  interface RequestHandler {
    (req: Request, res: Response, next: NextFunction): void | Response | Promise<void> | Promise<Response>;
  }
}