// src/types/file.types.ts
import { Request } from 'express';

export interface FileWithS3 extends Express.Multer.File {
  location?: string;  // S3 URL
  key?: string;       // S3 object key
  bucket?: string;    // S3 bucket name
  etag?: string;      // S3 ETag
  acl?: string;       // S3 ACL
}

export interface S3UploadRequest extends Request {
  file?: FileWithS3;
  files?: FileWithS3[];
}

export interface MediaItem {
  url: string;
  key: string;
  type: 'image' | 'video' | 'audio' | 'document';
  originalFilename?: string;
}