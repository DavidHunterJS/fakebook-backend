// src/routes/analysis.ts
import express from 'express';
import Replicate from 'replicate';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import sharp from 'sharp';
import { deductCredit } from '../services/creditService';
import authenticateUser from '../middlewares/auth.middleware';
import {canUserPerformAction} from '../services/creditService'
// import { checkCredits } from '../middlewares/checkCredits';

const router = express.Router();

// --- CONFIGURATION ---
const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN! });

const s3 = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});
const BUCKET_NAME = process.env.S3_BUCKET_NAME || 'trippy.wtf';

// --- TYPE DEFINITIONS ---
// ... (Your interfaces are unchanged)
interface ComplianceResult {
  complianceScore: number;
  backgroundPixels: number;
  nonWhitePixels: number;
  productCoverage: number;
  edgeCompliance: number;
  isCompliant: boolean;
  segmentationUrl?: string;
  cutoutUrl?: string;
  issues: string[];
}
interface EnhancedComplianceResult extends ComplianceResult {
  dimensions: any;
  quality: any;
  productFill: any;
}

// --- ALL HELPER FUNCTIONS ---
// ... (All your helper functions are unchanged)
async function calculateSharpness(imageBuffer: Buffer): Promise<number> {
  try {
    const { data } = await sharp(imageBuffer).grayscale().convolve({ width: 3, height: 3, kernel: [0, 1, 0, 1, -4, 1, 0, 1, 0] }).raw().toBuffer({ resolveWithObject: true });
    let sumSquares = 0;
    for (let i = 0; i < data.length; i++) { sumSquares += data[i] * data[i]; }
    const variance = (sumSquares / data.length) - ( (Array.from(data).reduce((a, b) => a + b, 0) / data.length) ** 2 );
    return Math.min(100, Math.max(0, (variance / 5) + 20));
  } catch (error) { console.error('Error calculating sharpness:', error); return 70; }
}

function analyzeExposure(stats: sharp.Stats): number {
  let score = 100;
  for (const channel of stats.channels) {
    if (channel.max === 255 && channel.mean > 240) score -= 20;
    if (channel.min === 0 && channel.mean < 15) score -= 20;
    if (Math.abs(channel.stdev - 50) > 30) score -= 10;
  }
  return Math.max(0, score);
}

function estimateJPEGQuality(metadata: sharp.Metadata, fileSize: number, pixels: number): number {
  if (metadata.format !== 'jpeg') return 100;
  const bitsPerPixel = (fileSize * 8) / pixels;
  if (bitsPerPixel > 2.0) return 95; if (bitsPerPixel > 1.5) return 85; if (bitsPerPixel > 1.0) return 75; if (bitsPerPixel > 0.5) return 65;
  return 50;
}

function calculateOverallQuality(metrics: { sharpness: number; exposure: number; compression: number; resolution: number; dpi: number; }): number {
  const weights = { sharpness: 0.3, exposure: 0.2, compression: 0.2, resolution: 0.2, dpi: 0.1 };
  const resolutionScore = Math.min(100, metrics.resolution * 50);
  return Math.round(metrics.sharpness * weights.sharpness + metrics.exposure * weights.exposure + metrics.compression * weights.compression + resolutionScore * weights.resolution + metrics.dpi * weights.dpi);
}

async function analyzeImageQuality(imageBuffer: Buffer): Promise<any> {
  const metadata = await sharp(imageBuffer).metadata();
  const stats = await sharp(imageBuffer).stats();
  const width = metadata.width || 0, height = metadata.height || 0;
  const longestSide = Math.max(width, height);
  const sharpnessScore = await calculateSharpness(imageBuffer);
  const exposureScore = analyzeExposure(stats);
  return {
    dimensions: { width, height, longestSide, isCompliant: longestSide >= 500 && longestSide <= 10000, zoomEnabled: longestSide >= 1000, isOptimal: longestSide >= 1600 },
    quality: { dpi: metadata.density || 72, sharpnessScore, fileSize: imageBuffer.length, fileSizeMB: imageBuffer.length / (1024 * 1024), format: metadata.format || 'unknown', colorSpace: metadata.space || 'unknown', compressionQuality: estimateJPEGQuality(metadata, imageBuffer.length, width * height), exposureScore, overallScore: calculateOverallQuality({ sharpness: sharpnessScore, exposure: exposureScore, compression: estimateJPEGQuality(metadata, imageBuffer.length, width * height), resolution: (width * height) / 1000000, dpi: (metadata.density || 72) >= 72 ? 100 : ((metadata.density || 72) / 72) * 100 }) }
  };
}

async function analyzeBackgroundComplianceWithURL(originalImageUrl: string, maskUrl: string): Promise<any> {
  try {
    const [originalResponse, maskResponse] = await Promise.all([fetch(originalImageUrl), fetch(maskUrl)]);
    const [originalBuffer, maskBuffer] = await Promise.all([Buffer.from(await originalResponse.arrayBuffer()), Buffer.from(await maskResponse.arrayBuffer())]);
    const originalMetadata = await sharp(originalBuffer).metadata();
    const [originalPixels, maskPixels] = await Promise.all([sharp(originalBuffer).ensureAlpha().raw().toBuffer(), sharp(maskBuffer).resize(originalMetadata.width, originalMetadata.height).ensureAlpha().raw().toBuffer()]);
    const totalPixels = originalMetadata.width! * originalMetadata.height!; let backgroundPixels = 0, nonWhiteBackgroundPixels = 0;
    for (let i = 0; i < originalPixels.length; i += 4) {
      if (((maskPixels[i] + maskPixels[i + 1] + maskPixels[i + 2]) / 3) < 127) {
        backgroundPixels++;
        if (originalPixels[i] !== 255 || originalPixels[i + 1] !== 255 || originalPixels[i + 2] !== 255) nonWhiteBackgroundPixels++;
      }
    }
    return { backgroundPixels, nonWhitePixels: nonWhiteBackgroundPixels, compliancePercentage: backgroundPixels > 0 ? ((backgroundPixels - nonWhiteBackgroundPixels) / backgroundPixels) * 100 : 100, totalPixels };
  } catch (error) { console.error('Error in analyzeBackgroundComplianceWithURL:', error); return { backgroundPixels: 0, nonWhitePixels: 0, compliancePercentage: 100, totalPixels: 0 }; }
}

async function calculateProductFillRateWithURL(maskUrl: string, originalWidth: number, originalHeight: number): Promise<any> {
  try {
    const maskResponse = await fetch(maskUrl);
    const processedMask = await sharp(Buffer.from(await maskResponse.arrayBuffer())).resize(originalWidth, originalHeight).ensureAlpha().raw().toBuffer();
    let productPixels = 0;
    for (let i = 0; i < processedMask.length; i += 4) { if (((processedMask[i] + processedMask[i + 1] + processedMask[i + 2]) / 3) > 127) productPixels++; }
    const percentage = (productPixels / (originalWidth * originalHeight)) * 100;
    return { percentage: Math.round(percentage * 10) / 10, productPixels, totalPixels: originalWidth * originalHeight, passes85Rule: percentage >= 85 && percentage <= 100 };
  } catch (error) { console.error('Error calculating product fill rate with URL:', error); return { percentage: 0, productPixels: 0, totalPixels: 0, passes85Rule: false }; }
}

async function analyzeMaskShape(maskUrl: string): Promise<any> {
  try {
    const maskResponse = await fetch(maskUrl);
    const { data, info } = await sharp(Buffer.from(await maskResponse.arrayBuffer())).grayscale().raw().toBuffer({ resolveWithObject: true });
    let productPixels = 0, minX = info.width, maxX = 0, minY = info.height, maxY = 0;
    for (let y = 0; y < info.height; y++) { for (let x = 0; x < info.width; x++) { if (data[y * info.width + x] < 128) { productPixels++; minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); } } }
    const boundingBoxArea = (maxX - minX + 1) * (maxY - minY + 1);
    const extent = boundingBoxArea > 0 ? productPixels / boundingBoxArea : 0;
    const solidity = extent; // Simple approximation
    return { isGeometric: extent > 0.65, solidity, extent, confidence: (extent + solidity) / 2 };
  } catch (error) { console.error('Error analyzing mask shape:', error); return { isGeometric: true, solidity: 1, extent: 1, confidence: 0 }; }
}


// --- THE MAIN EXPRESS ROUTE HANDLER ---
router.post('/analyze-image', authenticateUser, async (req, res) => {
  console.log('✅ [LOG 1] Entered /analyze-image route handler.');
  try {
    const userId = req.user.id;
    
    // NEW: Check if this is an internal re-check (skip credit deduction)
    const { imageUrl, skipCreditDeduction } = req.body;
    
    if (!imageUrl) {
      console.error('❌ [ERROR] No image URL provided.');
      return res.status(400).json({ error: 'No image URL provided' });
    }
    
    // NEW: Only check credits if NOT skipping
    if (!skipCreditDeduction) {
      console.log(`✅ [LOG 2] Checking credits for user ${userId}...`);
      const canCheck = await canUserPerformAction(userId, 'check');
      if (!canCheck) {
        return res.status(403).json({
          error: 'Insufficient credits',
          code: 'CREDITS_EXHAUSTED',
          actionType: 'check',
          message: "You've run out of check credits. Please upgrade your plan.",
        });
      }
    } else {
      console.log(`✅ [LOG 2] Skipping credit check (internal re-analysis).`);
    }

    // const { imageUrl } = req.body;
    if (!imageUrl) {
      console.error('❌ [ERROR] No image URL provided.');
      return res.status(400).json({ error: 'No image URL provided' });
    }

    console.log('✅ [LOG 3] Image URL received. Fetching image...');
    const imageResponse = await fetch(imageUrl);
    const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
    
    console.log('✅ [LOG 4] Image fetched. Analyzing quality...');
    const qualityAnalysis = await analyzeImageQuality(imageBuffer);

    console.log('✅ [LOG 5] Quality analyzed. Running Replicate...');
    const output = await replicate.run(
      "men1scus/birefnet:f74986db0355b58403ed20963af156525e2891ea3c2d499bfbfb2a28cd87c5d7",
      { input: { image: imageUrl, resolution: "" } }
    ) as any;

    console.log('✅ [LOG 6] Replicate run finished.');
    console.log('🔍 [DEBUG] Replicate output type:', typeof output);

    let maskUrl: string | undefined;
    let cutoutUrl: string | undefined;
    let allMaskUrls: string[] = [];
    const timestamp = Date.now();

    let birefnetBuffer: Buffer | undefined;

    // Handle both string URL and ReadableStream responses
    if (typeof output === 'string') {
      console.log('✅ [LOG 6.5] Got string URL, fetching...');
      const birefnetResponse = await fetch(output);
      birefnetBuffer = Buffer.from(await birefnetResponse.arrayBuffer());
    } else if (output && typeof output[Symbol.asyncIterator] === 'function') {
      // It's an async iterable (stream) - returns raw bytes
      console.log('🔍 [DEBUG] Output is a stream, reading chunks...');
      const chunks: Buffer[] = [];
      for await (const chunk of output) {
        chunks.push(Buffer.from(chunk));
      }
      birefnetBuffer = Buffer.concat(chunks);
      console.log('✅ [LOG 6.5] Got Buffer from stream, size:', birefnetBuffer.length, 'bytes');
    } else if (output && typeof output === 'object' && 'url' in output) {
      // Some models return { url: "..." }
      console.log('✅ [LOG 6.5] Got URL from object.url, fetching...');
      const birefnetResponse = await fetch(output.url);
      birefnetBuffer = Buffer.from(await birefnetResponse.arrayBuffer());
    } else {
      console.error('❌ [ERROR] Unexpected Replicate output format:', output);
    }

    console.log('🔍 [DEBUG] Final birefnetBuffer size:', birefnetBuffer?.length || 0, 'bytes');

    let rgbAnalysis = { 
      backgroundPixels: 0, 
      nonWhitePixels: 0, 
      compliancePercentage: 100, 
      totalPixels: qualityAnalysis.dimensions.width * qualityAnalysis.dimensions.height 
    };
    let productFillAnalysis = { 
      percentage: 0, 
      productPixels: 0, 
      totalPixels: 0, 
      passes85Rule: false 
    };

    if (birefnetBuffer) {
      console.log('✅ [LOG 7] Processing Replicate output...');
      
      // Upload cutout to S3
      const cutoutKey = `cutouts/birefnet-${timestamp}-cutout.png`;
      
      const putCutoutCommand = new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: cutoutKey,
        Body: birefnetBuffer,
        ContentType: 'image/png',
        ACL: 'public-read',
      });
      await s3.send(putCutoutCommand);
      cutoutUrl = `https://s3.amazonaws.com/${BUCKET_NAME}/${cutoutKey}`;
      
      console.log('✅ Cutout uploaded to S3:', cutoutUrl);

      // Continue with your existing mask processing code...
      const { data: rawPixels, info } = await sharp(birefnetBuffer)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
    
      // ... rest of your mask processing code (lines with maskPixels, convertedMaskBuffer, etc.)
      const maskPixels = Buffer.alloc(info.width * info.height * 3);
      for (let i = 0; i < rawPixels.length; i += 4) {
        const maskIndex = (i / 4) * 3;
        // This is the fix:
        // If the alpha channel (rawPixels[i + 3]) is high (opaque product), set the color to black (0).
        // Otherwise (transparent background), set the color to white (255).
        const finalColor = rawPixels[i + 3] < 128 ? 0 : 255;
        maskPixels[maskIndex] = maskPixels[maskIndex + 1] = maskPixels[maskIndex + 2] = finalColor;
      }
      const convertedMaskBuffer = await sharp(maskPixels, { raw: { width: info.width, height: info.height, channels: 3 } }).png().toBuffer();
      const convertedMaskKey = `converted-masks/birefnet-${timestamp}-mask.png`;

      // 👇 4. This is the second v3 upload command
      const putMaskCommand = new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: convertedMaskKey,
        Body: convertedMaskBuffer,
        ContentType: 'image/png',
        ACL: 'public-read',
      });
      await s3.send(putMaskCommand);
      maskUrl = `https://s3.amazonaws.com/${BUCKET_NAME}/${convertedMaskKey}`;
      allMaskUrls = [maskUrl];

      if (maskUrl) {
        console.log('✅ [LOG 8] Mask created. Analyzing shape and compliance...');
        const shapeAnalysis = await analyzeMaskShape(maskUrl);
        // ... (The full logic for shape analysis and reprocessing if needed)
      }
      
      rgbAnalysis = await analyzeBackgroundComplianceWithURL(imageUrl, maskUrl!);
      productFillAnalysis = await calculateProductFillRateWithURL(maskUrl!, qualityAnalysis.dimensions.width, qualityAnalysis.dimensions.height);
    }
    
    console.log('✅ [LOG 9] All analysis complete. Building result object...');
    
    const issues: string[] = [];
    if (rgbAnalysis.nonWhitePixels > 0) {
      issues.push(`Background contains ${rgbAnalysis.nonWhitePixels.toLocaleString()} non-white pixels`);
    }
    
    // ... (your result object creation logic)
    const complianceScore = Math.round(Math.min(rgbAnalysis.compliancePercentage, 100) * 10) / 10;
    const backgroundPixels = rgbAnalysis.backgroundPixels;
    let nonWhitePixels = rgbAnalysis.nonWhitePixels;
    const productCoverage = productFillAnalysis.percentage;
    const edgeCompliance = qualityAnalysis.quality.sharpnessScore;
    const isCompliant = rgbAnalysis.nonWhitePixels === 0 && qualityAnalysis.dimensions.isCompliant && productFillAnalysis.passes85Rule;
    
    const result: EnhancedComplianceResult & { allMaskUrls?: string[] } = {
      complianceScore,
      backgroundPixels,
      nonWhitePixels,
      productCoverage,
      edgeCompliance,
      isCompliant,
      segmentationUrl: maskUrl,
      cutoutUrl: cutoutUrl,
      issues,
      allMaskUrls,
      dimensions: qualityAnalysis.dimensions,
      quality: qualityAnalysis.quality,
      productFill: productFillAnalysis,
    };

    // 👇 5. ADDED DEBUG LOG
    console.log('✅ [LOG 10] Result object built. Calling deductCredit...');

    // 3. BOOKKEEPER - Only deduct if NOT skipping
    if (!skipCreditDeduction) {
      console.log('✅ [LOG 10.5] Deducting check credit...');
      await deductCredit(userId, 'check');
    } else {
      console.log('✅ [LOG 10.5] Skipping credit deduction (internal re-analysis).');
    }
    
    // 👇 6. ADDED DEBUG LOG
    console.log('✅ [LOG 11] deductCredit finished. Sending 200 response.');

    return res.status(200).json(result);

  } catch (error) {
    console.error('❌ [CATCH BLOCK] An error occurred in /analyze-image route:', error);
    
    if (error instanceof Error && error.message === 'Insufficient credits') {
      return res.status(403).json({
        error: 'Insufficient credits',
        code: 'CREDITS_EXHAUSTED',
        actionType: 'check',
        message: "You've run out of check credits. Please upgrade your plan.",
      });
    }
    
    return res.status(500).json({ error: 'Failed to analyze image.' });
  }
});

export default router;