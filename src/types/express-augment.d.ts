import * as express from 'express';

declare global {
  namespace Express {
    interface Request {}
    interface Response {}
  }
}

declare module 'express-serve-static-core' {
  interface RequestHandler {
    (req: any, res: any, next: any): any;
  }

  interface ErrorRequestHandler {
    (err: any, req: any, res: any, next: any): any;
  }
}
