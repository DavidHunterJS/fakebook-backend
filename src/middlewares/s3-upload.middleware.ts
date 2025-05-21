// src/middlewares/s3-upload.middleware.ts
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';
import multer from 'multer';
import AWS from 'aws-sdk';
import { v4 as uuidv4 } from 'uuid';
import multerS3 from 'multer-s3';
import path from 'path';
import crypto from 'crypto';
import fs from 'fs';
import { Request } from 'express';

// Create S3 client with v3 SDK
const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || ''
  }
});

// Create AWS SDK v2 S3 client for signed URLs and other operations
const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION
});

const bucketName = process.env.S3_BUCKET_NAME || '';

// Determine the folder based on file field name
const getUploadFolder = (fieldname: string): string => {
  switch (fieldname) {
    case 'profilePicture':
      return 'profile';
    case 'coverPhoto':
      return 'covers';
    case 'media':
      return 'posts';
    case 'messageAttachment':
      return 'messages';
    default:
      return 'misc';
  }
};

// Function to generate signed URLs for S3 objects
const getSignedUrl = (key: string, expires = 3600): string => {
  if (!bucketName || !key) {
    return `http://localhost:5000/uploads/${key || ''}`;
  }
  
  try {
    const signedUrl = s3.getSignedUrl('getObject', {
      Bucket: bucketName,
      Key: key,
      Expires: expires // URL expires in 1 hour by default
    });
    return signedUrl;
  } catch (error) {
    console.error('Error generating signed URL:', error);
    return `https://${bucketName}.s3.amazonaws.com/${key}`; // Fallback to direct URL
  }
};

// Generate a unique filename
const generateFilename = (originalname: string): string => {
  const timestamp = Date.now();
  const randomString = crypto.randomBytes(8).toString('hex');
  const extension = path.extname(originalname);
  return `${timestamp}-${randomString}${extension}`;
};

// Determine MIME type based on file extension
const getMimeType = (filename: string): string => {
  const extension = path.extname(filename).toLowerCase();
  switch (extension) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.png':
      return 'image/png';
    case '.gif':
      return 'image/gif';
    case '.webp':
      return 'image/webp';
    case '.mp4':
      return 'video/mp4';
    case '.mov':
      return 'video/quicktime';
    case '.webm':
      return 'video/webm';
    case '.mp3':
      return 'audio/mpeg';
    case '.wav':
      return 'audio/wav';
    case '.pdf':
      return 'application/pdf';
    case '.doc':
      return 'application/msword';
    case '.docx':
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    case '.xls':
      return 'application/vnd.ms-excel';
    case '.xlsx':
      return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    default:
      return 'application/octet-stream';
  }
};

// Create S3 upload middleware function
const createS3Upload = (folderPath: string) => {
  // Use S3 storage if bucket name is provided, otherwise use local storage
  const storage = process.env.S3_BUCKET_NAME
    ? multerS3({
        s3: s3Client,
        bucket: process.env.S3_BUCKET_NAME,
        acl: 'public-read', // Make files private - enforce access through signed URLs
        contentType: (req: Request, file: Express.Multer.File, cb: (error: Error | null, contentType: string) => void) => {
          cb(null, getMimeType(file.originalname));
        },
        key: (req: Request, file: Express.Multer.File, cb: (error: Error | null, key: string) => void) => {
          const filename = generateFilename(file.originalname);
          const key = `${folderPath}/${filename}`;
          console.log(`Uploading to S3: ${file.originalname} → ${key}`);
          cb(null, key);
        },
        metadata: (req, file, cb) => {
          cb(null, { 
            fieldName: file.fieldname,
            originalName: file.originalname 
          });
        }
      })
    : multer.diskStorage({
        destination: (req: Request, file: Express.Multer.File, cb) => {
          const uploadPath = path.join(__dirname, `../../uploads/${folderPath}`);
          
          // Create directory if it doesn't exist
          if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
          }
          
          cb(null, uploadPath);
        },
        filename: (req: Request, file: Express.Multer.File, cb) => {
          const filename = generateFilename(file.originalname);
          console.log(`Saving to disk: ${file.originalname} → ${filename}`);
          cb(null, filename);
        }
      });

  // Create and return the multer middleware
  return multer({
    storage,
    limits: {
      fileSize: 10 * 1024 * 1024 // 10MB limit
    },
    fileFilter: (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
      const allowedMimeTypes = [
        'image/jpeg',
        'image/png',
        'image/gif',
        'image/webp',
        'video/mp4',
        'video/quicktime',
        'video/webm',
        'audio/mpeg',
        'audio/mp3',
        'audio/wav',
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      ];

      if (allowedMimeTypes.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error(`Unsupported file type: ${file.mimetype}`));
      }
    }
  });
};

// Helper functions for S3 operations
const s3Operations = {
  // Delete an object from S3
  deleteFile: async (key: string): Promise<boolean> => {
    if (!key) return false;
    
    console.log(`Attempting to delete file: ${key}`);
    
    if (process.env.S3_BUCKET_NAME) {
      try {
        await s3Client.send(new DeleteObjectCommand({
          Bucket: process.env.S3_BUCKET_NAME,
          Key: key
        }));
        console.log(`Successfully deleted from S3: ${key}`);
        return true;
      } catch (error) {
        console.error(`Failed to delete file from S3: ${key}`, error);
        return false;
      }
    } else {
      // Local file deletion with path safety
      try {
        // Make sure the key doesn't try to traverse directories
        const normalizedKey = key.replace(/\.\.\//g, '').replace(/\.\.\\/g, '');
        
        // Extract folder and filename
        const pathParts = normalizedKey.split('/');
        const folder = pathParts.slice(0, -1).join('/');
        const filename = pathParts[pathParts.length - 1];
        
        const filePath = path.normalize(path.join(__dirname, '../../uploads', folder, filename));
        
        // Verify the file is within our uploads directory
        const uploadsDir = path.normalize(path.join(__dirname, '../../uploads'));
        if (!filePath.startsWith(uploadsDir)) {
          console.error(`Invalid file path outside uploads directory: ${filePath}`);
          return false;
        }
        
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          console.log(`Successfully deleted local file: ${filePath}`);
          return true;
        } else {
          console.warn(`File not found for deletion: ${filePath}`);
          return false;
        }
      } catch (error) {
        console.error(`Failed to delete local file: ${key}`, error);
        return false;
      }
    }
  },
  
  // Get the full S3 URL
  getFileUrl: (key: string | undefined): string | null => {
    if (!key) return null;
    
    if (!process.env.S3_BUCKET_NAME) {
      return `http://localhost:5000/uploads/${key}`;
    }
    
    const bucketName = process.env.S3_BUCKET_NAME;
    const region = process.env.AWS_REGION || 'us-east-1';
    return `https://${bucketName}.s3.${region}.amazonaws.com/${key}`;
  },
  
  // Generate signed URL (public export)
  getSignedUrl
};

// Define upload middleware for different file types
const s3UploadMiddleware = {
  profilePicture: createS3Upload('profile').single('profilePicture'),
  coverPhoto: createS3Upload('covers').single('coverPhoto'),
  postMedia: createS3Upload('posts').array('media', 10),
  document: createS3Upload('documents').single('document'),
  
  // Export helper functions
  getFileUrl: s3Operations.getFileUrl,
  deleteFile: s3Operations.deleteFile,
  getSignedUrl: s3Operations.getSignedUrl
};

export default s3UploadMiddleware;