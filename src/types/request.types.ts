// src/types/request.types.ts (create this file if it doesn't exist)
import { Request } from 'express';
import { FileWithS3 } from './file.types';

// Base S3 upload request that extends Express Request
export interface S3UploadRequest extends Request {
  file?: FileWithS3;
  files?: FileWithS3[];
  user?: {
    id: string;
    [key: string]: any; // Allow for additional user properties
  };
}

// For controllers where you know auth middleware has been applied
export interface AuthenticatedRequest extends S3UploadRequest {
  user: {  // Not optional here
    id: string;
    [key: string]: any;
  };
}