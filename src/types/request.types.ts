import { Request } from 'express';
// Assuming 'FileWithS3' is defined in './file.types' as you have it.
import { FileWithS3 } from './file.types';

// Base S3 upload request that extends Express Request
export interface S3UploadRequest extends Request {
  file?: FileWithS3;
  /**
   * This is the key change to fix the type error.
   * The 'files' property can be an array of files (from a single field)
   * OR an object where each key is a fieldname and the value is an array of files.
   * This makes your custom type compatible with Express/Multer's behavior.
   */
  files?: FileWithS3[] | { [fieldname: string]: FileWithS3[] };
  user?: {
    id: string;
    [key: string]: any; // Allow for additional user properties
  };
}

// For controllers where you know auth middleware has been applied
export interface AuthenticatedRequest extends S3UploadRequest {
  user?: {
    id: string;
    [key: string]: any;
  };
}
