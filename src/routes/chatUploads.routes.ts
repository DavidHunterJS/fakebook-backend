// src/routes/chatUpload.routes.ts

import express from 'express';
import multer from 'multer';
import s3UploadMiddleware from '../middlewares/s3-upload.middleware';
import authMiddleware from '../middlewares/auth.middleware';

const router = express.Router();

// Use multer for memory storage, just like your other S3 route
const memoryUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 } // Set a limit, e.g., 15MB
});

/**
 * @route   POST /api/chat/upload
 * @desc    Upload a single file or image for the chat
 * @access  Private
 */
router.post(
  '/upload',
  authMiddleware,
  memoryUpload.single('file'), // Expect a single file in a field named 'file'
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded.' });
    }

    try {
      const { buffer, mimetype, originalname, size } = req.file;
      
      // Upload to a dedicated 'chat-media' folder in your S3 bucket
      const key = await s3UploadMiddleware.uploadToS3(
        { buffer, mimetype, originalname }, 
        'chat-media'
      );

      const url = s3UploadMiddleware.getFileUrl(key);

      // Return all the necessary info to the frontend
      res.status(200).json({ 
        success: true, 
        url,
        metadata: {
          fileName: originalname,
          fileSize: size,
          mimeType: mimetype
        }
      });
    } catch (error) {
      console.error('Chat S3 upload failed:', error);
      res.status(500).json({ success: false, message: 'Failed to upload file.' });
    }
  }
);

export default router;