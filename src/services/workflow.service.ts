// src/services/workflow.service.ts
import { Server as SocketIOServer } from 'socket.io';
import WorkflowJob from '../models/WorkflowJob';
import { IWorkflowJobResults } from '../models/WorkflowJob';
import axios from 'axios';
import sharp from 'sharp';
import AWS from 'aws-sdk';
import { v4 as uuidv4 } from 'uuid';

// Configure AWS S3
const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION || 'us-east-1'
});

// Replicate API configuration
const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN;
const REPLICATE_BASE_URL = 'https://api.replicate.com/v1';

// AI Model configurations
const AI_MODELS = {
  background_removal: 'cjwbw/rembg:fb8af171cfa1616ddcf1242c093f9c46bcada5ad4cf6f2fbe8b81b330ec5c003',
  product_detection: 'meta/segment-anything-2:4737ee36e7b1c9c3ecb78d0e33088e1de8f1e5a3f12dc6a37bb1e7bc16fb0ec5',
  image_enhancement: 'tencentarc/gfpgan:9283608cc6b7be6b65a8e44983db012355fde4132009bf99d976b2f0896856a3',
  lifestyle_generation: 'stability-ai/stable-diffusion:27b93a2413e7f36cd83da926f3656280b2931564ff050bf9575f1fdf9bcd7478',
  color_variation: 'stability-ai/stable-diffusion-xl:39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b'
};

// Platform export configurations
const EXPORT_FORMATS = {
  shopify: { size: [2048, 2048], format: 'webp', quality: 90 },
  amazon: { size: [2000, 2000], format: 'jpeg', quality: 95 },
  instagram: { size: [1080, 1080], format: 'jpeg', quality: 85 },
  facebook: { size: [1200, 1200], format: 'jpeg', quality: 85 },
  web_small: { size: [800, 800], format: 'webp', quality: 80 },
  web_large: { size: [1600, 1600], format: 'webp', quality: 85 }
} as const;

/**
 * Main workflow processing function
 * @param jobId - Unique job identifier
 * @param workflowType - Type of workflow to execute
 * @param inputImageUrl - S3 URL of input image
 * @param io - Socket.IO server instance for real-time updates
 */
export async function processWorkflow(
  jobId: string,
  workflowType: 'product_enhancement' | 'lifestyle_scenes' | 'product_variants',
  inputImageUrl: string,
  io: SocketIOServer
): Promise<void> {
  const job = await WorkflowJob.findOne({ jobId });
  if (!job) {
    throw new Error('Job not found');
  }

  try {
    // Emit job started
    io.to(job.userId.toString()).emit('workflow-progress', {
      jobId,
      step: 1,
      progress: 5,
      message: 'Starting workflow processing...'
    });

    let results: IWorkflowJobResults;

    switch (workflowType) {
      case 'product_enhancement':
        results = await processProductEnhancement(job, inputImageUrl, io);
        break;
      case 'lifestyle_scenes':
        results = await processLifestyleScenes(job, inputImageUrl, io);
        break;
      case 'product_variants':
        results = await processProductVariants(job, inputImageUrl, io);
        break;
      default:
        throw new Error(`Unknown workflow type: ${workflowType}`);
    }

    // Complete the job
    await job.completeJob(results);

    // Emit completion
    io.to(job.userId.toString()).emit('workflow-complete', {
      jobId,
      processedImages: results.processedImages,
      platformExports: results.platformExports,
      processingTime: job.processingTimeSeconds
    });

  } catch (error) {
    console.error(`Workflow ${jobId} failed:`, error);
    await job.failJob(error instanceof Error ? error.message : 'Unknown error');
    
    io.to(job.userId.toString()).emit('workflow-error', {
      jobId,
      message: error instanceof Error ? error.message : 'Processing failed'
    });
    
    throw error;
  }
}

/**
 * Process Product Enhancement Workflow (Workflow 1)
 */
async function processProductEnhancement(
  job: any,
  inputImageUrl: string,
  io: SocketIOServer
): Promise<IWorkflowJobResults> {
  const userId = job.userId.toString();
  
  // Step 1: Product Detection (15s target)
  await job.updateProgress('detection', 20);
  io.to(userId).emit('workflow-progress', {
    jobId: job.jobId,
    step: 1,
    progress: 20,
    message: 'Detecting product in image...'
  });

  const detectionResult = await callReplicateAPI(AI_MODELS.product_detection, {
    image: inputImageUrl,
    points_per_side: 32,
    pred_iou_thresh: 0.88,
    stability_score_thresh: 0.95
  });

  if (!detectionResult?.output) {
    throw new Error('Product detection failed');
  }

  // Step 2: Background Removal (30s target)
  await job.updateProgress('background_removal', 40);
  io.to(userId).emit('workflow-progress', {
    jobId: job.jobId,
    step: 2,
    progress: 40,
    message: 'Removing background...'
  });

  const cleanProductResult = await callReplicateAPI(AI_MODELS.background_removal, {
    image: inputImageUrl,
    model: 'u2net',
    alpha_matting: true
  });

  if (!cleanProductResult?.output) {
    throw new Error('Background removal failed');
  }

  const cleanProductUrl = cleanProductResult.output;

  // Step 3: Generate 5 Background Variations (45s target)
  await job.updateProgress('enhancement', 60);
  io.to(userId).emit('workflow-progress', {
    jobId: job.jobId,
    step: 3,
    progress: 60,
    message: 'Generating background variations...'
  });

  const backgroundVariations = await generateBackgroundVariations(cleanProductUrl, job.jobId);

  // Step 4: Create Platform Exports (30s target)
  await job.updateProgress('export_generation', 80);
  io.to(userId).emit('workflow-progress', {
    jobId: job.jobId,
    step: 4,
    progress: 80,
    message: 'Creating platform exports...'
  });

  const platformExports = await createPlatformExports(backgroundVariations, job.jobId);

  // Step 5: Complete
  await job.updateProgress('export_generation', 100, 'completed');
  io.to(userId).emit('workflow-progress', {
    jobId: job.jobId,
    step: 5,
    progress: 100,
    message: 'Processing complete!'
  });

  return {
    processedImages: backgroundVariations,
    platformExports,
    fileKeys: [
      ...Object.values(backgroundVariations),
      ...Object.values(platformExports)
    ].map(url => getS3KeyFromUrl(url)).filter(Boolean) as string[]
  };
}

/**
 * Process Lifestyle Scenes Workflow (Workflow 2)
 */
async function processLifestyleScenes(
  job: any,
  inputImageUrl: string,
  io: SocketIOServer
): Promise<IWorkflowJobResults> {
  const userId = job.userId.toString();
  
  // Step 1: Product Analysis (15s)
  await job.updateProgress('analysis', 20);
  io.to(userId).emit('workflow-progress', {
    jobId: job.jobId,
    step: 1,
    progress: 20,
    message: 'Analyzing product features...'
  });

  const productAnalysis = await analyzeProductForLifestyle(inputImageUrl);

  // Step 2: Scene Generation (60s)
  await job.updateProgress('scene_generation', 50);
  io.to(userId).emit('workflow-progress', {
    jobId: job.jobId,
    step: 2,
    progress: 50,
    message: 'Generating lifestyle scenes...'
  });

  const lifestyleScenes = await generateLifestyleScenes(productAnalysis, job.jobId);

  // Step 3: Product Integration (45s)
  await job.updateProgress('integration', 75);
  io.to(userId).emit('workflow-progress', {
    jobId: job.jobId,
    step: 3,
    progress: 75,
    message: 'Integrating product into scenes...'
  });

  const integratedScenes = await integrateProductIntoScenes(inputImageUrl, lifestyleScenes, job.jobId);

  // Step 4: Optimization (15s)
  await job.updateProgress('optimization', 100, 'completed');
  io.to(userId).emit('workflow-progress', {
    jobId: job.jobId,
    step: 4,
    progress: 100,
    message: 'Optimizing for social media...'
  });

  const optimizedScenes = await optimizeForSocialMedia(integratedScenes, job.jobId);

  return {
    processedImages: {
      home: integratedScenes.home,
      social: integratedScenes.social,
      outdoor: integratedScenes.outdoor,
      professional: integratedScenes.professional,
      seasonal: integratedScenes.seasonal
    },
    platformExports: optimizedScenes,
    fileKeys: [
      ...Object.values(integratedScenes),
      ...Object.values(optimizedScenes)
    ].map(url => getS3KeyFromUrl(url as string)).filter(Boolean) as string[]
  };
}

/**
 * Process Product Variants Workflow (Workflow 3)
 */
async function processProductVariants(
  job: any,
  inputImageUrl: string,
  io: SocketIOServer
): Promise<IWorkflowJobResults> {
  const userId = job.userId.toString();
  
  // Step 1: 3D Reconstruction (30s)
  await job.updateProgress('3d_reconstruction', 25);
  io.to(userId).emit('workflow-progress', {
    jobId: job.jobId,
    step: 1,
    progress: 25,
    message: 'Creating 3D model of product...'
  });

  const product3D = await create3DModel(inputImageUrl);

  // Step 2: Generate Different Angles (45s)
  await job.updateProgress('angle_generation', 50);
  io.to(userId).emit('workflow-progress', {
    jobId: job.jobId,
    step: 2,
    progress: 50,
    message: 'Generating different angles...'
  });

  const angleVariants = await generateProductAngles(product3D, job.jobId);

  // Step 3: Color Variations (30s)
  await job.updateProgress('color_variation', 75);
  io.to(userId).emit('workflow-progress', {
    jobId: job.jobId,
    step: 3,
    progress: 75,
    message: 'Creating color variations...'
  });

  const colorVariants = await generateColorVariations(angleVariants, job.jobId);

  // Step 4: Style Applications (15s)
  await job.updateProgress('style_application', 100, 'completed');
  io.to(userId).emit('workflow-progress', {
    jobId: job.jobId,
    step: 4,
    progress: 100,
    message: 'Applying lighting styles...'
  });

  const styledVariants = await applyLightingStyles(colorVariants, job.jobId);

  return {
    processedImages: {
      front: angleVariants.front,
      back: angleVariants.back,
      side: angleVariants.side,
      top: angleVariants.top,
      detail: angleVariants.detail
    },
    platformExports: styledVariants,
    fileKeys: [
      ...Object.values(angleVariants),
      ...Object.values(styledVariants)
    ].map(url => getS3KeyFromUrl(url as string)).filter(Boolean) as string[]
  };
}

/**
 * Helper Functions
 */

async function callReplicateAPI(model: string, inputs: any): Promise<any> {
  if (!REPLICATE_API_TOKEN) {
    throw new Error('REPLICATE_API_TOKEN not configured');
  }

  try {
    const response = await axios.post(
      `${REPLICATE_BASE_URL}/predictions`,
      {
        version: model,
        input: inputs
      },
      {
        headers: {
          'Authorization': `Token ${REPLICATE_API_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const predictionId = response.data.id;
    
    // Poll for completion
    return await pollReplicateResult(predictionId);
    
  } catch (error) {
    console.error('Replicate API error:', error);
    throw new Error('AI processing failed');
  }
}

async function pollReplicateResult(predictionId: string): Promise<any> {
  const maxAttempts = 60; // 5 minutes max
  let attempts = 0;

  while (attempts < maxAttempts) {
    try {
      const response = await axios.get(
        `${REPLICATE_BASE_URL}/predictions/${predictionId}`,
        {
          headers: {
            'Authorization': `Token ${REPLICATE_API_TOKEN}`
          }
        }
      );

      const status = response.data.status;
      
      if (status === 'succeeded') {
        return response.data;
      } else if (status === 'failed') {
        throw new Error(`AI processing failed: ${response.data.error}`);
      }
      
      // Wait 5 seconds before next poll
      await new Promise(resolve => setTimeout(resolve, 5000));
      attempts++;
      
    } catch (error) {
      console.error('Error polling Replicate result:', error);
      attempts++;
    }
  }
  
  throw new Error('AI processing timed out');
}

async function generateBackgroundVariations(cleanProductUrl: string, jobId: string) {
  // Generate 5 different background types
  const variations = {
    white: await createWhiteBackground(cleanProductUrl, jobId),
    transparent: cleanProductUrl, // Already transparent
    gradient: await createGradientBackground(cleanProductUrl, jobId),
    lifestyle: await createAILifestyleBackground(cleanProductUrl, jobId),
    branded: await createBrandedBackground(cleanProductUrl, jobId)
  };
  
  return variations;
}

async function createPlatformExports(variations: any, jobId: string) {
  const exports: { [key: string]: string } = {};
  
  for (const [bgType, imageUrl] of Object.entries(variations)) {
    for (const [platform, config] of Object.entries(EXPORT_FORMATS)) {
      const exportKey = `${bgType}_${platform}`;
      exports[exportKey] = await resizeAndOptimizeImage(
        imageUrl as string,
        config.size[0],
        config.size[1],
        config.format as 'webp' | 'jpeg',
        config.quality,
        `${jobId}/${exportKey}`
      );
    }
  }
  
  return exports;
}

async function resizeAndOptimizeImage(
  imageUrl: string,
  width: number,
  height: number,
  format: 'webp' | 'jpeg',
  quality: number,
  s3Key: string
): Promise<string> {
  try {
    // Download image
    const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
    const imageBuffer = Buffer.from(response.data);
    
    // Process with Sharp
    let processedBuffer;
    if (format === 'webp') {
      processedBuffer = await sharp(imageBuffer)
        .resize(width, height, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
        .webp({ quality })
        .toBuffer();
    } else {
      processedBuffer = await sharp(imageBuffer)
        .resize(width, height, { fit: 'contain', background: { r: 255, g: 255, b: 255 } })
        .jpeg({ quality })
        .toBuffer();
    }
    
    // Upload to S3
    const uploadResult = await s3.upload({
      Bucket: process.env.AWS_S3_BUCKET || 'trippy-lol-uploads',
      Key: `workflow-results/${s3Key}.${format}`,
      Body: processedBuffer,
      ContentType: `image/${format}`,
      ACL: 'public-read'
    }).promise();
    
    return uploadResult.Location;
    
  } catch (error) {
    console.error('Error processing image:', error);
    throw new Error('Image processing failed');
  }
}

// Placeholder implementations for complex AI operations
async function createWhiteBackground(productUrl: string, jobId: string): Promise<string> {
  // Create pure white background version
  return await resizeAndOptimizeImage(productUrl, 2048, 2048, 'webp', 90, `${jobId}/white_bg`);
}

async function createGradientBackground(productUrl: string, jobId: string): Promise<string> {
  // Create gradient background using image compositing
  // This would involve more complex image processing
  return await resizeAndOptimizeImage(productUrl, 2048, 2048, 'webp', 90, `${jobId}/gradient_bg`);
}

async function createAILifestyleBackground(productUrl: string, jobId: string): Promise<string> {
  // Use Stable Diffusion to generate contextual background
  const lifestyleResult = await callReplicateAPI(AI_MODELS.lifestyle_generation, {
    prompt: "modern home interior, clean background for product photography, soft lighting",
    image: productUrl,
    strength: 0.3
  });
  
  return lifestyleResult.output[0];
}

async function createBrandedBackground(productUrl: string, jobId: string): Promise<string> {
  // Create brand-colored background
  return await resizeAndOptimizeImage(productUrl, 2048, 2048, 'webp', 90, `${jobId}/branded_bg`);
}

// Lifestyle workflow helpers (simplified implementations)
async function analyzeProductForLifestyle(imageUrl: string) {
  return { category: 'general', style: 'modern', colors: ['#ffffff', '#000000'] };
}

async function generateLifestyleScenes(analysis: any, jobId: string) {
  return {
    home: 'placeholder_url',
    social: 'placeholder_url', 
    outdoor: 'placeholder_url',
    professional: 'placeholder_url',
    seasonal: 'placeholder_url'
  };
}

async function integrateProductIntoScenes(productUrl: string, scenes: any, jobId: string) {
  return scenes; // Simplified - would do actual integration
}

async function optimizeForSocialMedia(scenes: any, jobId: string) {
  return scenes; // Simplified - would create social media formats
}

// Product variants helpers (simplified implementations)
async function create3DModel(imageUrl: string) {
  return { model: 'placeholder_3d_data' };
}

async function generateProductAngles(product3D: any, jobId: string) {
  return {
    front: 'placeholder_url',
    back: 'placeholder_url',
    side: 'placeholder_url', 
    top: 'placeholder_url',
    detail: 'placeholder_url'
  };
}

async function generateColorVariations(angles: any, jobId: string) {
  return angles; // Simplified
}

async function applyLightingStyles(variants: any, jobId: string) {
  return variants; // Simplified
}

function getS3KeyFromUrl(url: string): string | null {
  try {
    const urlObj = new URL(url);
    return urlObj.pathname.substring(1); // Remove leading slash
  } catch {
    return null;
  }
}