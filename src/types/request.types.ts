import { Request } from 'express';
import { FileWithS3 } from './file.types';

// If you have access to the IUser type, import it
// import { IUser } from './path/to/user/types';

/**
 * Extend Express's Request interface to include your file types
 * This uses module augmentation to properly extend Express types
 */
declare global {
  namespace Express {
    interface Request {
      file?: FileWithS3;
      /**
       * The 'files' property can be:
       * - An array of files (from a single field, e.g., upload.array('photos'))
       * - An object where each key is a fieldname and the value is an array of files
       *   (e.g., upload.fields([{ name: 'avatar' }, { name: 'gallery' }]))
       */
      files?: FileWithS3[] | { [fieldname: string]: FileWithS3[] };
    }
  }
}

/**
 * Base S3 upload request - now just uses the extended Express Request
 */
export interface S3UploadRequest extends Request {
  // No need to redeclare file, files, or user - they're already in Request
}

/**
 * For controllers where you know auth middleware has been applied
 * and user is guaranteed to exist
 */
export interface AuthenticatedS3Request extends Request {
  user: NonNullable<Request['user']>; // Makes user required and properly typed
}

/**
 * Alternative approach if you can't modify global Express types
 * Use Omit to remove the conflicting user property and add your own
 */
export interface CustomS3UploadRequest extends Omit<Request, 'user' | 'file' | 'files'> {
  file?: FileWithS3;
  files?: FileWithS3[] | { [fieldname: string]: FileWithS3[] };
  user?: {
    id: string;
    [key: string]: any;
  };
}

export interface CustomAuthenticatedS3Request extends Omit<Request, 'user' | 'file' | 'files'> {
  file?: FileWithS3;
  files?: FileWithS3[] | { [fieldname: string]: FileWithS3[] };
  user: {
    id: string;
    [key: string]: any;
  };
}

/**
 * Type guard to check if request has authenticated user
 */
export function isAuthenticatedRequest(req: S3UploadRequest): req is AuthenticatedS3Request {
  return req.user !== undefined;
}

/**
 * Type guard to check if files is an array vs object
 */
export function isFileArray(files: FileWithS3[] | { [fieldname: string]: FileWithS3[] }): files is FileWithS3[] {
  return Array.isArray(files);
}

/**
 * Helper type for when you know you're dealing with a specific file field structure
 */
export interface MultiFieldS3Request extends AuthenticatedS3Request {
  files: { [fieldname: string]: FileWithS3[] };
}

/**
 * Helper type for when you know you're dealing with an array of files
 */
export interface SingleFieldS3Request extends AuthenticatedS3Request {
  files: FileWithS3[];
}