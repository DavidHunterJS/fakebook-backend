// src/routes/fix.routes.ts
import express from 'express';
import sharp from 'sharp';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

import { canUserPerformAction, deductCredit } from '../services/creditService';
import authenticateUser from '../middlewares/auth.middleware';

const router = express.Router();

const s3 = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});
const BUCKET_NAME = process.env.S3_BUCKET_NAME || 'trippy.wtf';

router.post('/fix-image', authenticateUser, async (req, res) => {
  try {
    // 1. GATEKEEPER
    const userId = req.user.id;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated.' });
    }

    const canPerformFix = await canUserPerformAction(userId, 'fix');
    if (!canPerformFix) {
      return res.status(402).json({ error: 'Insufficient fix credits. Please upgrade your plan.' });
    }

    // 2. CORE LOGIC
    const { cutoutImageUrl, fixesToApply, dimensions } = req.body;

    if (!cutoutImageUrl || !fixesToApply || !dimensions) {
      return res.status(400).json({ error: 'cutoutImageUrl, fixesToApply, and dimensions are required' });
    }

    const cutoutResponse = await fetch(cutoutImageUrl);
    const cutoutBuffer = Buffer.from(await cutoutResponse.arrayBuffer());

    let imageProcessor = sharp(cutoutBuffer);

    if (fixesToApply.includes('resize') && dimensions.longestSide < 1600) {
      console.log(`Resizing image from ${dimensions.longestSide}px to 1600px...`);
      imageProcessor = imageProcessor.resize({
        width: 1600,
        height: 1600,
        fit: 'inside',
        withoutEnlargement: true,
      });
    }

    if (fixesToApply.includes('background')) {
      console.log('Applying white background...');
      imageProcessor = imageProcessor.flatten({ background: { r: 255, g: 255, b: 255 } });
    }

    const finalImageBuffer = await imageProcessor.jpeg().toBuffer();
    
    // --- 4. S3 UPLOAD ---
    const filename = `fixed-images/${Date.now()}-fully-fixed.jpg`;
    
    const putFixedImageCommand = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: filename,
      Body: finalImageBuffer,
      ContentType: 'image/jpeg',
      ACL: 'public-read',
    });

    await s3.send(putFixedImageCommand);

    // 👇 --- THIS IS THE FIX ---
    // Use path-style URL format because our bucket name has dots.
    const region = process.env.AWS_REGION || 'us-east-1';
    const fixedUrl = `https://s3.${region}.amazonaws.com/${BUCKET_NAME}/${filename}`;
    
    // 5. BOOKKEEPER
    await deductCredit(userId, 'fix');
    console.log(`Successfully deducted 1 'fix' credit from user ${userId}`);

    // 6. SEND RESPONSE
    return res.status(200).json({ fixedUrl });

  } catch (error) {
    console.error('Error in Express /fix-image route:', error);
    return res.status(500).json({ error: 'Failed to fix image.' });
  }
});

export default router;