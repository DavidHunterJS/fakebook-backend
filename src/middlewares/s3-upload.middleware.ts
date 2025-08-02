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

// --- ✅ 4. DEFINE A REUSABLE TYPE ---
// This interface defines only the properties our upload function needs.
interface UploadableFile {
  buffer?: Buffer;
  mimetype?: string;
  originalname: string;
}

// --- ✅ 5. UPDATE THE FUNCTION SIGNATURE & REMOVE UNUSED CONSOLE LOGS ---
// The function now accepts any object that matches the UploadableFile interface.
const uploadToS3 = async (file: UploadableFile, folderPath: string): Promise<string> => {
  const filename = generateFilename(file.originalname);
  const key = `${folderPath}/${filename}`;
  
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
    ACL: 'public-read',
  });

  try {
    await s3Client.send(command);
    console.log(`S3 upload successful: ${key}`);
    return key;
  } catch (error) {
    console.error('S3 upload failed:', error);
    throw error;
  }
};

// --- 6. Multer Setup with Memory Storage ---
const memoryUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB file size limit
});

// --- 7. Middleware Functions ---
const profilePictureUpload = async (req: Request, res: Response, next: NextFunction) => {
  memoryUpload.single('profilePicture')(req, res, async (err: any) => {
    if (err) {
      const message = err instanceof multer.MulterError ? err.message : "Internal server error during file upload.";
      return res.status(400).json({ message });
    }
    
    try {
      if (req.file) {
        const key = await uploadToS3(req.file, 'profile');
        (req as any).s3Key = key;
      }
      next();
    } catch (error) {
      return res.status(500).json({ message: "Failed to upload file to S3" });
    }
  });
};

const coverPhotoUpload = async (req: Request, res: Response, next: NextFunction) => {
  memoryUpload.single('coverPhoto')(req, res, async (err: any) => {
    if (err) {
      const message = err instanceof multer.MulterError ? err.message : "Internal server error during file upload.";
      return res.status(400).json({ message });
    }
    
    try {
      if (req.file) {
        const key = await uploadToS3(req.file, 'covers');
        (req as any).s3Key = key;
      }
      next();
    } catch (error) {
      return res.status(500).json({ message: "Failed to upload file to S3" });
    }
  });
};

const postMediaUpload = async (req: Request, res: Response, next: NextFunction) => {
  memoryUpload.array('files', 10)(req, res, async (err: any) => {
    if (err) {
      const message = err instanceof multer.MulterError ? err.message : "Internal server error during file upload.";
      return res.status(400).json({ message });
    }
    
    try {
      const files = req.files as Express.Multer.File[];
      if (files && files.length > 0) {
        const uploadPromises = files.map(file => uploadToS3(file, 'posts'));
        const keys = await Promise.all(uploadPromises);
        (req as any).s3Keys = keys;
      }
      next();
    } catch (error) {
      return res.status(500).json({ message: "Failed to upload files to S3" });
    }
  });
};

  export const getFileUrl = (key: string | undefined): string | null => {
    if (!key || !process.env.S3_BUCKET_NAME || !process.env.AWS_REGION) {
      return null;
    }
    // This constructs the correct path-style URL
    return `https://s3.${process.env.AWS_REGION}.amazonaws.com/${process.env.S3_BUCKET_NAME}/${key}`;
  };

// --- 8. Delete Function ---
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

// --- ✅ 9. UPDATED Exported Middleware ---
const s3UploadMiddleware = {
  profilePicture: profilePictureUpload,
  coverPhoto: coverPhotoUpload,
  postMedia: postMediaUpload,
  deleteFile: deleteFile,
  getFileUrl: getFileUrl,
  uploadToS3: uploadToS3, // The function is now correctly exported
};

export default s3UploadMiddleware;