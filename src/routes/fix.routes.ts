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
    const { originalImageUrl, maskUrl, fixesToApply, dimensions } = req.body;

    if (!originalImageUrl || !maskUrl || !fixesToApply || !dimensions) {
      return res.status(400).json({ error: 'originalImageUrl, maskUrl, fixesToApply, and dimensions are required' });
    }

    const originalResponse = await fetch(originalImageUrl);
    const originalBuffer = Buffer.from(await originalResponse.arrayBuffer());

    const maskResponse = await fetch(maskUrl);
    const productMaskBuffer = Buffer.from(await maskResponse.arrayBuffer());

    // --- 3. APPLY FIXES (RELIABLE "COMPOSITE ONTO WHITE" METHOD) ---
    
    let imageProcessor;
    const { width, height } = dimensions; 

    if (fixesToApply.includes('background')) {
      console.log('Applying white background using "composite onto white" method...');
      
      // 3a. Create the pure white canvas
      console.log(`[FIXER] Creating white background [${width}x${height}]...`);
      const whiteBackground = sharp({
        create: { width, height, channels: 3, background: { r: 255, g: 255, b: 255 } }
      });

      // 3b. Process the product mask
      console.log(`[FIXER] Processing mask [${width}x${height}]...`);
      // BiRefNet mask is (product=black, background=white).
      // We need (product=white, background=black) for the alpha channel.
      const alphaMask = await sharp(productMaskBuffer)
        .resize(width, height)
        .toColourspace('b-w') // Ensure it's grayscale
        .raw() // ⭐ CRITICAL: Extract as raw pixel data, not PNG
        .toBuffer();
      console.log('[FIXER] Mask processed and INVERTED.');

      // 3c. Create the product "sticker"
      console.log(`[FIXER] Creating product sticker [${width}x${height}]...`);
      // First, get the resized original as RGB (no alpha)
      const resizedProductRgb = await sharp(originalBuffer)
        .resize(width, height)
        .removeAlpha()
        .toColourspace('srgb')
        .raw() // Get raw RGB data
        .toBuffer();

      // Now create RGBA by combining RGB + Alpha mask
      const productCutout = await sharp(resizedProductRgb, {
        raw: {
          width: width,
          height: height,
          channels: 3 // RGB input
        }
      })
      .joinChannel(alphaMask, { 
        raw: { 
          width: width, 
          height: height, 
          channels: 1 // Single channel mask
        } 
      })
      .png()
      .toBuffer();
      console.log('[FIXER] Product sticker created.');

      // 3d. Composite the product "sticker" ONTO the white background
      console.log('[FIXER] Compositing sticker...');
      imageProcessor = whiteBackground.composite([
        {
          input: productCutout, 
          blend: 'over',
        },
      ]);
      console.log('[FIXER] Composite operation set up.');
    } else {
      imageProcessor = sharp(originalBuffer);
    }

    // 4. APPLY RESIZE (if needed)
    if (fixesToApply.includes('resize') && dimensions.longestSide < 1600) {
      console.log(`[FIXER] Resizing image...`);
      imageProcessor = imageProcessor.resize({
        width: 1600,
        height: 1600,
        fit: 'inside',
        withoutEnlargement: true,
      });
      console.log(`[FIXER] Resize operation set up.`);
    }

    // 5. GET FINAL IMAGE
    console.log('[FIXER] Generating final JPEG buffer...');
    const finalImageBuffer = await imageProcessor.jpeg().toBuffer();
    console.log('[FIXER] Final buffer created.');
    
    // ... (Steps 6, 7, and 8 are correct)
    
    // 6. S3 UPLOAD
    const filename = `fixed-images/${Date.now()}-fully-fixed.jpg`;
    const putFixedImageCommand = new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: filename,
        Body: finalImageBuffer,
        ContentType: 'image/jpeg',
        ACL: 'public-read',
    });
    await s3.send(putFixedImageCommand);
    const region = process.env.AWS_REGION || 'us-east-1';
    const fixedUrl = `https://s3.${region}.amazonaws.com/${BUCKET_NAME}/${filename}`;
    
    // 7. BOOKKEEPER
    await deductCredit(userId, 'fix');
    
    // 8. SEND RESPONSE
    return res.status(200).json({ fixedUrl });

  } catch (error) {
    console.error('Error in Express /fix-image route:', error);
    return res.status(500).json({ error: 'Failed to fix image.' });
  }
});

export default router;