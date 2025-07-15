import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import multer from 'multer';
import { Request, Response, NextFunction } from 'express';
import path from 'path';
import crypto from 'crypto';

// --- 1. Environment Variable Check ---
if (!process.env.S3_BUCKET_NAME || !process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY || !process.env.AWS_REGION) {
  throw new Error("FATAL ERROR: S3 environment variables are not defined. Please check your .env file.");
}

// --- 2. S3 Client Setup (v3) ---
const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

const bucketName = process.env.S3_BUCKET_NAME;

// --- 3. Helper Functions ---
const generateFilename = (originalname: string): string => {
  const timestamp = Date.now();
  const randomString = crypto.randomBytes(8).toString('hex');
  const extension = path.extname(originalname);
  return `${timestamp}-${randomString}${extension}`;
};

// --- 4. Custom S3 Upload Function ---
const uploadToS3 = async (file: Express.Multer.File, folderPath: string): Promise<string> => {
  const filename = generateFilename(file.originalname);
  const key = `${folderPath}/${filename}`;
  
  console.log(`Uploading to S3: ${file.originalname} → ${key}`);
  console.log('File details:', {
    originalname: file.originalname,
    mimetype: file.mimetype,
    size: file.size,
    bufferExists: !!file.buffer,
    bufferLength: file.buffer?.length
  });
  
  if (!file.buffer) {
    throw new Error('File buffer is missing');
  }
  
  if (!bucketName) {
    throw new Error('Bucket name is missing');
  }
  
  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    Body: file.buffer,
    ContentType: file.mimetype || 'application/octet-stream',
    ACL: 'public-read', // Remove this line if it's causing issues
  });

  try {
    const result = await s3Client.send(command);
    console.log('S3 upload successful:', result);
    return key;
  } catch (error) {
    console.error('S3 upload failed:', error);
    throw error;
  }
};

// --- 5. Multer Setup with Memory Storage ---
const memoryUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB file size limit
});

// --- 6. Middleware Functions ---
const profilePictureUpload = async (req: Request, res: Response, next: NextFunction) => {
  // First run multer to get the file
  memoryUpload.single('profilePicture')(req, res, async (err: Error) => {
    if (err) {
      console.error("Multer error:", err);
      const message = err instanceof multer.MulterError ? err.message : "Internal server error during file upload.";
      const status = err instanceof multer.MulterError ? 400 : 500;
      return res.status(status).json({ message });
    }
    
    // Then upload to S3
    try {
      const file = req.file;
      if (file) {
        const key = await uploadToS3(file, 'profile');
        (req as any).s3Key = key;
        (req as any).s3Url = `https://${bucketName}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
      }
      next();
    } catch (error) {
      console.error("S3 upload error:", error);
      return res.status(500).json({ message: "Failed to upload file to S3" });
    }
  });
};

const coverPhotoUpload = async (req: Request, res: Response, next: NextFunction) => {
  memoryUpload.single('coverPhoto')(req, res, async (err: Error) => {
    if (err) {
      console.error("Multer error:", err);
      const message = err instanceof multer.MulterError ? err.message : "Internal server error during file upload.";
      const status = err instanceof multer.MulterError ? 400 : 500;
      return res.status(status).json({ message });
    }
    
    try {
      const file = req.file;
      if (file) {
        const key = await uploadToS3(file, 'covers');
        (req as any).s3Key = key;
        (req as any).s3Url = `https://${bucketName}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
      }
      next();
    } catch (error) {
      console.error("S3 upload error:", error);
      return res.status(500).json({ message: "Failed to upload file to S3" });
    }
  });
};

const postMediaUpload = async (req: Request, res: Response, next: NextFunction) => {
  memoryUpload.array('files', 10)(req, res, async (err: Error) => {
    if (err) {
      console.error("Multer error:", err);
      const message = err instanceof multer.MulterError ? err.message : "Internal server error during file upload.";
      const status = err instanceof multer.MulterError ? 400 : 500;
      return res.status(status).json({ message });
    }
    
    try {
      const files = req.files as Express.Multer.File[];
      if (files && files.length > 0) {
        const uploadPromises = files.map(file => uploadToS3(file, 'posts'));
        const keys = await Promise.all(uploadPromises);
        (req as any).s3Keys = keys;
        (req as any).s3Urls = keys.map(key => `https://${bucketName}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`);
      }
      next();
    } catch (error) {
      console.error("S3 upload error:", error);
      return res.status(500).json({ message: "Failed to upload files to S3" });
    }
  });
};
export const getFileUrl = (key: string | undefined): string | null => {
  if (!key) {
    return null;
  }
  // This logic handles both S3 and a potential local setup
  if (!bucketName) {
    const localBaseUrl = process.env.API_URL || 'http://localhost:5000';
    return `${localBaseUrl}/uploads/${key}`; // Adjust if your local static path is different
  }

  // For S3, construct the full URL
  return `https://${bucketName}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
};
// --- 7. Delete Function ---
const deleteFile = async (key: string): Promise<boolean> => {
  if (!key) return false;
  try {
    await s3Client.send(new DeleteObjectCommand({ Bucket: bucketName, Key: key }));
    console.log(`Successfully deleted from S3: ${key}`);
    return true;
  } catch (error) {
    console.error(`Failed to delete file from S3: ${key}`, error);
    return false;
  }
};

// --- 8. Exported Middleware ---
const s3UploadMiddleware = {
  profilePicture: profilePictureUpload,
  coverPhoto: coverPhotoUpload,
  postMedia: postMediaUpload,
  deleteFile: deleteFile,
  getFileUrl: getFileUrl,
};

export default s3UploadMiddleware;