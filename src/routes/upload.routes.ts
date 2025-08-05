import express from 'express';
import multer from 'multer';
import s3UploadMiddleware from '../middlewares/s3-upload.middleware'; // Adjust path if needed
import authMiddleware from '../middlewares/auth.middleware'; // Protect the route

const router = express.Router();

// Use multer for memory storage to handle the file temporarily
const memoryUpload = multer({ storage: multer.memoryStorage() });

/**
 * @route   POST /api/upload/image
 * @desc    Upload a single image for features like inpainting
 * @access  Private
 */
router.post(
  '/image',
  authMiddleware,
  memoryUpload.single('file'), // Expect a single file in a field named 'file'
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded.' });
    }

    try {
      // Use a custom upload function based on your existing S3 logic
      // This assumes your s3-upload.middleware has an uploadToS3 function or similar
      // For this example, we'll adapt its logic directly.
      const { buffer, mimetype } = req.file;
      const key = await s3UploadMiddleware.uploadToS3(
        { buffer, mimetype, originalname: req.file.originalname }, 
        'inpainting' // Upload to a specific 'inpainting' folder
      );

      const url = s3UploadMiddleware.getFileUrl(key);

      res.status(200).json({ success: true, url, key });
    } catch (error) {
      console.error('S3 upload failed:', error);
      res.status(500).json({ error: 'Failed to upload image.' });
    }
  }
);

export default router;