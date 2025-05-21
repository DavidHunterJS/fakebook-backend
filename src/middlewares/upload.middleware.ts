// src/middlewares/upload.middleware.ts
import { Request, Response, NextFunction } from 'express';
import multer, { FileFilterCallback } from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

// Define file upload limits
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_PROFILE_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_COVER_SIZE = 8 * 1024 * 1024; // 8MB

// Define allowed file types
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'];
const ALLOWED_DOCUMENT_TYPES = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];

// Ensure upload directories exist
const createDirectories = (): void => {
  const directories = [
    path.join(__dirname, '../../uploads'),
    path.join(__dirname, '../../uploads/profile'),
    path.join(__dirname, '../../uploads/covers'),
    path.join(__dirname, '../../uploads/posts'),
    path.join(__dirname, '../../uploads/documents')
  ];

  directories.forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
};

createDirectories();

// Custom filename generation to avoid collisions
const generateFilename = (originalname: string): string => {
  const timestamp = Date.now();
  const randomString = crypto.randomBytes(8).toString('hex');
  const extension = path.extname(originalname);
  return `${timestamp}-${randomString}${extension}`;
};

// Generic file filter for multiple types
const fileFilter = (
  allowedTypes: string[]
) => (
  req: Request,
  file: Express.Multer.File,
  callback: FileFilterCallback
): void => {
  if (allowedTypes.includes(file.mimetype)) {
    callback(null, true);
  } else {
    callback(new Error(`Only ${allowedTypes.join(', ')} files are allowed`));
  }
};

// Profile picture storage
const profileStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../../uploads/profile'));
  },
  filename: (req, file, cb) => {
    cb(null, generateFilename(file.originalname));
  }
});

// Cover photo storage
const coverStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../../uploads/covers'));
  },
  filename: (req, file, cb) => {
    cb(null, generateFilename(file.originalname));
  }
});

// Post media storage
const postStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../../uploads/posts'));
  },
  filename: (req, file, cb) => {
    cb(null, generateFilename(file.originalname));
  }
});

// Document storage
const documentStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../../uploads/documents'));
  },
  filename: (req, file, cb) => {
    cb(null, generateFilename(file.originalname));
  }
});

// Create multer instances for different upload types
const profileUpload = multer({
  storage: profileStorage,
  limits: { fileSize: MAX_PROFILE_SIZE },
  fileFilter: fileFilter(ALLOWED_IMAGE_TYPES)
});

const coverUpload = multer({
  storage: coverStorage,
  limits: { fileSize: MAX_COVER_SIZE },
  fileFilter: fileFilter(ALLOWED_IMAGE_TYPES)
});

const postImageUpload = multer({
  storage: postStorage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: fileFilter(ALLOWED_IMAGE_TYPES)
});

const postVideoUpload = multer({
  storage: postStorage,
  limits: { fileSize: MAX_FILE_SIZE * 3 }, // Videos can be larger
  fileFilter: fileFilter(ALLOWED_VIDEO_TYPES)
});

const documentUpload = multer({
  storage: documentStorage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: fileFilter(ALLOWED_DOCUMENT_TYPES)
});

// Post upload middleware that supports multiple file types
const postMediaUpload = (req: Request, res: Response, next: NextFunction): void => {
  const contentType = req.headers['content-type'] || '';
  
  if (contentType.includes('image')) {
    postImageUpload.array('media', 10)(req, res, (err: Error) => {
      if (err) {
        return res.status(400).json({ message: err.message });
      }
      next();
    });
  } else if (contentType.includes('video')) {
    postVideoUpload.array('media', 2)(req, res, (err: Error) => {
      if (err) {
        return res.status(400).json({ message: err.message });
      }
      next();
    });
  } else {
    next();
  }
};

// Error handler for multer
const errorHandler = (err: any, req: Request, res: Response, next: NextFunction): void => {
  if (err instanceof multer.MulterError) {
    // A Multer error occurred when uploading
    if (err.code === 'LIMIT_FILE_SIZE') {
      res.status(400).json({ message: 'File too large' });
    } else {
      res.status(400).json({ message: err.message });
    }
  } else if (err) {
    // An unknown error occurred
    res.status(500).json({ message: err.message });
  } else {
    next();
  }
};

// Validation middleware for image dimensions
const validateImageDimensions = (
  minWidth: number,
  minHeight: number,
  maxWidth: number,
  maxHeight: number
) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.file) {
      return next();
    }

    // Implement image dimension validation here if needed
    // This would require an image processing library like sharp
    
    next();
  };
};

// Delete unused files if validation fails
const cleanupOnError = (req: Request, res: Response, next: NextFunction): void => {
  const originalSend = res.send;
  
  // Override res.send to check for errors before sending response
  res.send = function (body: any): Response {
    const responseBody = typeof body === 'string' ? JSON.parse(body) : body;
    
    // If there's an error and files were uploaded, delete them
    if (responseBody.errors && req.file) {
      fs.unlinkSync(req.file.path);
    } else if (responseBody.errors && req.files && Array.isArray(req.files)) {
      (req.files as Express.Multer.File[]).forEach(file => {
        fs.unlinkSync(file.path);
      });
    }
    
    return originalSend.call(this, body);
  };
  
  next();
};

// Helper to generate full URL for uploaded files
const getFileUrl = (filename: string, type: 'profile' | 'cover' | 'post' | 'document'): string => {
  const baseUrl = process.env.BASE_URL || 'http://localhost:5000';
  
  // For cover photos, use "covers" (plural)
  const folder = type === 'cover' ? 'covers' : type;
  
  return `${baseUrl}/uploads/${folder}/${filename}`;
};

// Combine middlewares for profile picture upload
const profilePictureMiddleware = [
  cleanupOnError,
  profileUpload.single('profilePicture'),
  validateImageDimensions(200, 200, 2000, 2000),
  errorHandler
];

// Combine middlewares for cover photo upload
const coverPhotoMiddleware = [
  cleanupOnError,
  coverUpload.single('coverPhoto'),
  validateImageDimensions(800, 200, 3000, 1000),
  errorHandler
];

// Export a single multer instance with the combined configuration
const uploadMiddleware = {
  // Single file uploads
  single: profileUpload.single.bind(profileUpload),
  
  // Specific upload types
  profilePicture: profileUpload.single('profilePicture'),
  coverPhoto: coverUpload.single('coverPhoto'),
  
  // Multiple file uploads
  array: postImageUpload.array.bind(postImageUpload),
  fields: postImageUpload.fields.bind(postImageUpload),
  
  // Combined middlewares
  profilePictureWithValidation: profilePictureMiddleware,
  coverPhotoWithValidation: coverPhotoMiddleware,
  
  // Post media handling
  postMedia: postMediaUpload,
  
  // Document upload
  document: documentUpload.single('document'),
  
  // Helpers
  getFileUrl,
  errorHandler
};

export default uploadMiddleware;