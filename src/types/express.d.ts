import { Express, Request, Response, NextFunction } from 'express-serve-static-core';
import { IUser } from '../models/User';

// Define S3-specific file properties
interface FileWithS3 extends Express.Multer.File {
  location?: string;  // S3 URL
  key?: string;       // S3 object key
  bucket?: string;    // S3 bucket name
  etag?: string;      // S3 ETag
  acl?: string;       // S3 ACL
}

declare global {
  namespace Express {
    // Extend Request with your user property and file properties
    interface Request {
      user?: IUser;
      file?: FileWithS3;
      files?: FileWithS3[];
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
