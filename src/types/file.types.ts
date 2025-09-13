import { Request } from 'express';

// Your S3-enhanced file interface
export interface FileWithS3 extends Express.Multer.File {
  location?: string; // S3 URL
  key?: string; // S3 object key
  bucket?: string; // S3 bucket name
  etag?: string; // S3 ETag
  acl?: string; // S3 ACL
}

// Use Omit to remove the conflicting 'file' and 'files' properties from Request
// This avoids the type conflict with existing File types
export interface S3UploadRequest extends Omit<Request, 'file' | 'files'> {
  file?: FileWithS3;
  files?: FileWithS3[] | { [fieldname: string]: FileWithS3[] };
}

// For authenticated requests
export interface AuthenticatedS3Request extends Omit<Request, 'file' | 'files'> {
  file?: FileWithS3;
  files?: FileWithS3[] | { [fieldname: string]: FileWithS3[] };
  user: NonNullable<Request['user']>; // Keep the original user type but make it required
}

export interface MediaItem {
  url: string;
  key: string;
  type: 'image' | 'video' | 'audio' | 'document';
  originalFilename?: string;
}

// Type guards and helpers
export function isAuthenticatedRequest(req: S3UploadRequest): req is AuthenticatedS3Request {
  return req.user !== undefined;
}

export function isFileArray(files: FileWithS3[] | { [fieldname: string]: FileWithS3[] }): files is FileWithS3[] {
  return Array.isArray(files);
}

export function hasMultipleFields(
  files: FileWithS3[] | { [fieldname: string]: FileWithS3[] }
): files is { [fieldname: string]: FileWithS3[] } {
  return !Array.isArray(files) && typeof files === 'object';
}

// Helper to get all files regardless of structure
export function getAllFiles(files?: FileWithS3[] | { [fieldname: string]: FileWithS3[] }): FileWithS3[] {
  if (!files) return [];
  
  if (Array.isArray(files)) {
    return files;
  }
  
  return Object.values(files).flat();
}

// Helper to get files by field name
export function getFilesByField(
  files: FileWithS3[] | { [fieldname: string]: FileWithS3[] } | undefined,
  fieldName: string
): FileWithS3[] {
  if (!files || Array.isArray(files)) {
    return [];
  }
  
  return files[fieldName] || [];
}