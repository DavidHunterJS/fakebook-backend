import { Request, Response, NextFunction } from 'express-serve-static-core';
import { IUser } from '../models/User';

// Define S3-specific file properties
export interface FileWithS3 extends Express.Multer.File {
  location?: string; // S3 URL
  key?: string; // S3 object key
  bucket?: string; // S3 bucket name
  etag?: string; // S3 ETag
  acl?: string; // S3 ACL
}

// Augment express-serve-static-core instead of global Express
declare module 'express-serve-static-core' {
  interface Request {
    user?: IUser;
    file?: FileWithS3;
    files?: FileWithS3[] | { [fieldname: string]: FileWithS3[] };
  }
  
  // Your existing RequestHandler overrides
  interface RequestHandler {
    (req: any, res: any, next?: any): any;
  }
  
  interface ErrorRequestHandler {
    (err: any, req: any, res: any, next: any): any;
  }
}

// Alternative: Also augment global Express for compatibility with other packages
declare global {
  namespace Express {
    interface Request {
      user?: IUser;
      file?: FileWithS3;
      files?: FileWithS3[] | { [fieldname: string]: FileWithS3[] };
    }
    
    namespace Multer {
      interface File extends FileWithS3 {}
    }
  }
}

// Now you can create your typed request interfaces
export interface S3UploadRequest extends Request {
  // Properties are already defined in the module augmentation
}

export interface AuthenticatedS3Request extends Request {
  user: IUser; // Make user required
}

// Type guards
export function isAuthenticatedRequest(req: Request): req is AuthenticatedS3Request {
  return req.user !== undefined;
}

export function isFileArray(files: FileWithS3[] | { [fieldname: string]: FileWithS3[] }): files is FileWithS3[] {
  return Array.isArray(files);
}