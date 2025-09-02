import { Request } from 'express';

// Define your complete S3 file interface
export interface S3UploadedFile {
  // Standard Multer properties
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  destination?: string;
  filename?: string;
  path?: string;
  buffer?: Buffer;
  
  // S3-specific properties
  s3Key: string;
  s3Bucket: string;
  s3Location: string;
  s3ETag?: string;
  // Add any other S3-specific properties here
}

/**
 * Request interfaces using completely separate types
 */
export interface S3UploadRequest extends Omit<Request, 'file' | 'files'> {
  // Keep original Multer properties for compatibility
  file?: Express.Multer.File;
  files?: Express.Multer.File[] | { [fieldname: string]: Express.Multer.File[] };
  
  // Add S3-specific properties
  s3File?: S3UploadedFile;
  s3Files?: S3UploadedFile[] | { [fieldname: string]: S3UploadedFile[] };
}

/**
 * For controllers where you know auth middleware has been applied
 */
export interface AuthenticatedS3Request extends S3UploadRequest {
  user: NonNullable<Request['user']>;
}

/**
 * Type guard to check if request has authenticated user
 */
export function isAuthenticatedRequest(req: S3UploadRequest): req is AuthenticatedS3Request {
  return req.user !== undefined;
}

/**
 * Type guard to check if s3Files is an array vs object
 */
export function isS3FileArray(
  files: S3UploadedFile[] | { [fieldname: string]: S3UploadedFile[] } | undefined
): files is S3UploadedFile[] {
  return Array.isArray(files);
}

/**
 * Helper to convert Multer.File to S3UploadedFile
 */
export function multerFileToS3File(
  multerFile: Express.Multer.File,
  s3Data: {
    s3Key: string;
    s3Bucket: string;
    s3Location: string;
    s3ETag?: string;
  }
): S3UploadedFile {
  return {
    fieldname: multerFile.fieldname,
    originalname: multerFile.originalname,
    encoding: multerFile.encoding,
    mimetype: multerFile.mimetype,
    size: multerFile.size,
    destination: multerFile.destination,
    filename: multerFile.filename,
    path: multerFile.path,
    buffer: multerFile.buffer,
    ...s3Data,
  };
}

/**
 * Helper to get S3 file from request
 */
export function getS3File(req: S3UploadRequest): S3UploadedFile | undefined {
  return req.s3File;
}

/**
 * Helper to get S3 files from request
 */
export function getS3Files(req: S3UploadRequest): S3UploadedFile[] | { [fieldname: string]: S3UploadedFile[] } | undefined {
  return req.s3Files;
}

/**
 * Helper types for specific file field structures
 */
export interface MultiFieldS3Request extends AuthenticatedS3Request {
  s3Files: { [fieldname: string]: S3UploadedFile[] };
}

export interface SingleFieldS3Request extends AuthenticatedS3Request {
  s3Files: S3UploadedFile[];
}