// src/routes/imagegen.ts
import express, { Request, Response } from 'express';
import Replicate from 'replicate';

const router = express.Router();

// Initialize Replicate client
const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN, // Make sure to set this in your .env file
});

interface GenerateImageRequest {
  model: string;
  parameters: Record<string, any>;
}

interface GenerateTextRequest {
  model: string;
  parameters: {
    prompt: string;
    system_prompt?: string;
    max_tokens?: number;
    extended_thinking?: boolean;
    max_image_resolution?: number;
    thinking_budget_tokens?: number;
    image?: string;
  };
}

// Model mappings to actual Replicate model versions
const MODEL_MAPPINGS: Record<string, `${string}/${string}` | `${string}/${string}:${string}`> = {
  'stable-diffusion-xl': 'stability-ai/stable-diffusion-3.5-large',
  'midjourney-style': 'prompthero/openjourney:9936c2001faa2194a261c01381f90e65261879985476014a0a37a334593a05eb',
  'flux-schnell': 'black-forest-labs/flux-schnell',
  'google-imagen4': 'google/imagen-4',
  'bytedance-seedream3': 'bytedance/seedream-3',
  'recraft-v3-svg': 'recraft-ai/recraft-v3-svg',
  'luma-photon': 'luma/photon', // Replace with actual model name
  'claude-4-sonnet': 'anthropic/claude-4-sonnet'
};

// Define which models generate images vs text
const IMAGE_GENERATION_MODELS = [
  'stable-diffusion-xl',
  'midjourney-style',
  'flux-schnell',
  'google-imagen4',
  'bytedance-seedream3',
  'recraft-v3-svg',
  'luma-photon'
];

const TEXT_GENERATION_MODELS = [
  'claude-4-sonnet'
];

// Existing image generation endpoint
router.post('/generate-image-advanced', async (req: Request<{}, {}, GenerateImageRequest>, res: Response) => {
  try {
    const { model, parameters } = req.body;

    // Validate request
    if (!model || !parameters) {
      return res.status(400).json({ 
        error: 'Missing required fields: model and parameters' 
      });
    }

    // Check if this is an image generation model
    if (!IMAGE_GENERATION_MODELS.includes(model)) {
      return res.status(400).json({
        error: `Model ${model} is not an image generation model. Use /generate-text for text models.`
      });
    }

    // Get the actual Replicate model version
    const replicateModel = MODEL_MAPPINGS[model];
    if (!replicateModel) {
      return res.status(400).json({ 
        error: `Unsupported model: ${model}` 
      });
    }

    // Transform parameters based on the selected model
    const transformedParams = transformParametersForModel(model, parameters);

    console.log(`Generating image with model: ${model}`);
    console.log('Parameters:', transformedParams);

    // Call Replicate API
    const output = await replicate.run(replicateModel, {
      input: transformedParams
    });

    // Handle the response based on model output format
    let imageUrls: string[] = [];
    
    if (Array.isArray(output)) {
      // New format: objects with .url() method
      imageUrls = output.map(item => {
        if (item && typeof item === 'object' && 'url' in item && typeof item.url === 'function') {
          return item.url();
        }
        // Fallback for direct URL strings (older format)
        return typeof item === 'string' ? item : '';
      }).filter(url => url);
    } else if (output && typeof output === 'object' && 'url' in output && typeof output.url === 'function') {
      // Single image with .url() method
      imageUrls = [output.url()];
    } else if (typeof output === 'string') {
      // Direct URL string (fallback)
      imageUrls = [output];
    }

    // Save to database if needed (your existing logic)
    // const savedPost = await saveImagePost({
    //   userId: req.user?.id,
    //   model,
    //   parameters: transformedParams,
    //   imageUrls,
    //   createdAt: new Date()
    // });

    res.json({
      success: true,
      images: imageUrls,
      model,
      parameters: transformedParams,
      // postId: savedPost?.id
    });

  } catch (error) {
    console.error('Image generation error:', error);
    
    // Handle specific Replicate errors
    if (error instanceof Error) {
      if (error.message.includes('unauthorized')) {
        return res.status(401).json({ 
          error: 'Invalid Replicate API token' 
        });
      }
      if (error.message.includes('rate limit')) {
        return res.status(429).json({ 
          error: 'Rate limit exceeded. Please try again later.' 
        });
      }
    }

    res.status(500).json({ 
      error: 'Failed to generate image',
      details: process.env.NODE_ENV === 'development' ? error : undefined
    });
  }
});

// New text generation endpoint for Claude
router.post('/generate-text', async (req: Request<{}, {}, GenerateTextRequest>, res: Response) => {
  try {
    const { model, parameters } = req.body;

    // Validate request
    if (!model || !parameters || !parameters.prompt) {
      return res.status(400).json({ 
        error: 'Missing required fields: model and parameters.prompt' 
      });
    }

    // Check if this is a text generation model
    if (!TEXT_GENERATION_MODELS.includes(model)) {
      return res.status(400).json({
        error: `Model ${model} is not a text generation model. Use /generate-image-advanced for image models.`
      });
    }

    // Get the actual Replicate model version
    const replicateModel = MODEL_MAPPINGS[model];
    if (!replicateModel) {
      return res.status(400).json({ 
        error: `Unsupported model: ${model}` 
      });
    }

    // Transform parameters for Claude
    const transformedParams = transformParametersForTextModel(model, parameters);

    console.log(`Generating text with model: ${model}`);
    console.log('Parameters:', transformedParams);

    // Call Replicate API
    const output = await replicate.run(replicateModel, {
      input: transformedParams
    });

    // Handle Claude response - it typically returns a string or array of strings
    let responseText: unknown = '';
    
    if (Array.isArray(output)) {
      responseText = output.join('');
    } else if (typeof output === 'string') {
      responseText = output;
    } else if (output && typeof output === 'object' && 'text' in output) {
      responseText = output.text;
    }

    res.json({
      success: true,
      text: responseText,
      model,
      parameters: transformedParams
    });

  } catch (error) {
    console.error('Text generation error:', error);
    
    // Handle specific Replicate errors
    if (error instanceof Error) {
      if (error.message.includes('unauthorized')) {
        return res.status(401).json({ 
          error: 'Invalid Replicate API token' 
        });
      }
      if (error.message.includes('rate limit')) {
        return res.status(429).json({ 
          error: 'Rate limit exceeded. Please try again later.' 
        });
      }
    }

    res.status(500).json({ 
      error: 'Failed to generate text',
      details: process.env.NODE_ENV === 'development' ? error : undefined
    });
  }
});

// Transform parameters for text generation models
function transformParametersForTextModel(model: string, params: any): Record<string, any> {
  const transformed = { ...params };

  switch (model) {
    case 'claude-4-sonnet':
      // Ensure required parameters are set with defaults
      if (!transformed.max_tokens) {
        transformed.max_tokens = 8192;
      }
      
      // Validate max_tokens range
      transformed.max_tokens = Math.max(1024, Math.min(64000, parseInt(transformed.max_tokens)));
      
      // Set defaults for optional parameters
      if (transformed.system_prompt === undefined) {
        transformed.system_prompt = "";
      }
      
      if (transformed.extended_thinking === undefined) {
        transformed.extended_thinking = false;
      }
      
      if (transformed.max_image_resolution === undefined) {
        transformed.max_image_resolution = 0.5;
      } else {
        transformed.max_image_resolution = Math.max(0.001, Math.min(2, parseFloat(transformed.max_image_resolution)));
      }
      
      if (transformed.thinking_budget_tokens === undefined) {
        transformed.thinking_budget_tokens = 1024;
      } else {
        transformed.thinking_budget_tokens = Math.max(1024, Math.min(64000, parseInt(transformed.thinking_budget_tokens)));
      }
      
      // Handle image parameter (optional)
      if (transformed.image && typeof transformed.image !== 'string') {
        delete transformed.image;
      }
      
      break;
      
    default:
      break;
  }

  return transformed;
}

// Transform parameters to match each model's expected input format
function transformParametersForModel(model: string, params: Record<string, any>): Record<string, any> {
  const transformed = { ...params };

  switch (model) {
    case 'stable-diffusion-xl':
      // SD 3.5 Large specific transformations (updated for new model)
      if (transformed.guidance_scale) {
        transformed.cfg = parseFloat(transformed.guidance_scale);
        delete transformed.guidance_scale; // Use 'cfg' instead
      }
      if (transformed.num_inference_steps) {
        transformed.steps = parseInt(transformed.num_inference_steps);
        delete transformed.num_inference_steps; // Use 'steps' instead
      }
      if (transformed.width && transformed.height) {
        // Convert to aspect ratio format
        const gcd = (a: number, b: number): number => b === 0 ? a : gcd(b, a % b);
        const w = parseInt(transformed.width);
        const h = parseInt(transformed.height);
        const divisor = gcd(w, h);
        transformed.aspect_ratio = `${w/divisor}:${h/divisor}`;
        delete transformed.width;
        delete transformed.height;
      }
      // Set output format and quality
      transformed.output_format = transformed.output_format || 'webp';
      transformed.output_quality = transformed.output_quality || 90;
      
      if (transformed.seed && transformed.seed !== '') {
        transformed.seed = parseInt(transformed.seed);
      } else {
        delete transformed.seed;
      }
      break;

    case 'midjourney-style':
      // Midjourney style transformations
      if (transformed.chaos) {
        transformed.chaos = parseInt(transformed.chaos);
      }
      // Map aspect ratio to width/height if the model expects it
      if (transformed.aspect_ratio) {
        const [w, h] = transformed.aspect_ratio.split(':').map(Number);
        const baseSize = 512;
        if (w && h) {
          transformed.width = Math.round(baseSize * (w / Math.max(w, h)));
          transformed.height = Math.round(baseSize * (h / Math.max(w, h)));
        }
        delete transformed.aspect_ratio;
      }
      break;

    case 'flux-schnell':
      // Flux specific transformations
      if (transformed.output_quality) {
        transformed.output_quality = parseInt(transformed.output_quality);
      }
      if (transformed.num_outputs) {
        transformed.num_outputs = parseInt(transformed.num_outputs);
      }
      break;

    case 'google-imagen4':
      // Google Imagen 4 specific transformations
      // Convert width/height to aspect_ratio if provided
      if (transformed.width && transformed.height) {
        const gcd = (a: number, b: number): number => b === 0 ? a : gcd(b, a % b);
        const w = parseInt(transformed.width);
        const h = parseInt(transformed.height);
        const divisor = gcd(w, h);
        const aspectRatio = `${w/divisor}:${h/divisor}`;
        
        // Map to supported aspect ratios
        const supportedRatios = ["1:1", "9:16", "16:9", "3:4", "4:3"];
        if (supportedRatios.includes(aspectRatio)) {
          transformed.aspect_ratio = aspectRatio;
        } else {
          // Default to 1:1 if aspect ratio not supported
          transformed.aspect_ratio = "1:1";
        }
        delete transformed.width;
        delete transformed.height;
      }
      
      // Ensure aspect_ratio is valid
      if (transformed.aspect_ratio) {
        const supportedRatios = ["1:1", "9:16", "16:9", "3:4", "4:3"];
        if (!supportedRatios.includes(transformed.aspect_ratio)) {
          transformed.aspect_ratio = "1:1";
        }
      }
      
      // Ensure output_format is valid
      if (transformed.output_format) {
        const supportedFormats = ["jpg", "png"];
        if (!supportedFormats.includes(transformed.output_format.toLowerCase())) {
          transformed.output_format = "jpg";
        } else {
          transformed.output_format = transformed.output_format.toLowerCase();
        }
      }
      
      // Ensure safety_filter_level is valid
      if (transformed.safety_filter_level) {
        const supportedLevels = ["block_low_and_above", "block_medium_and_above", "block_only_high"];
        if (!supportedLevels.includes(transformed.safety_filter_level)) {
          transformed.safety_filter_level = "block_only_high";
        }
      }
      
      // Remove unsupported parameters
      delete transformed.guidance_scale;
      delete transformed.num_inference_steps;
      delete transformed.seed;
      delete transformed.cfg;
      delete transformed.steps;
      break;

    case 'bytedance-seedream3':
      // ByteDance SeeDream-3 specific transformations
      if (transformed.seed && transformed.seed !== '') {
        transformed.seed = parseInt(transformed.seed);
      } else {
        delete transformed.seed; // Let it be null/undefined for random
      }
      
      if (transformed.guidance_scale) {
        const guidanceValue = parseFloat(transformed.guidance_scale);
        // Clamp between 1 and 10
        transformed.guidance_scale = Math.max(1, Math.min(10, guidanceValue));
      }
      
      // Handle aspect ratio and dimensions
      if (transformed.aspect_ratio === 'custom') {
        // When custom, use width and height
        if (transformed.width) {
          const width = parseInt(transformed.width);
          transformed.width = Math.max(512, Math.min(2048, width));
        }
        if (transformed.height) {
          const height = parseInt(transformed.height);
          transformed.height = Math.max(512, Math.min(2048, height));
        }
        // Remove size parameter when using custom dimensions
        delete transformed.size;
      } else {
        // When using predefined aspect ratio, remove width/height and use size
        delete transformed.width;
        delete transformed.height;
        
        // Validate aspect ratio
        const supportedRatios = ["1:1", "3:4", "4:3", "16:9", "9:16", "2:3", "3:2", "21:9"];
        if (!supportedRatios.includes(transformed.aspect_ratio)) {
          transformed.aspect_ratio = "16:9"; // Default
        }
        
        // Validate size
        if (transformed.size) {
          const supportedSizes = ["small", "regular", "big"];
          if (!supportedSizes.includes(transformed.size)) {
            transformed.size = "regular";
          }
        }
      }
      
      // Convert width/height to custom aspect ratio if both are provided but aspect_ratio isn't custom
      if (!transformed.aspect_ratio || transformed.aspect_ratio === '') {
        if (transformed.width && transformed.height) {
          transformed.aspect_ratio = 'custom';
          transformed.width = Math.max(512, Math.min(2048, parseInt(transformed.width)));
          transformed.height = Math.max(512, Math.min(2048, parseInt(transformed.height)));
          delete transformed.size;
        } else {
          transformed.aspect_ratio = "16:9";
        }
      }
      
      // Remove unsupported parameters
      delete transformed.negative_prompt;
      delete transformed.num_inference_steps;
      delete transformed.cfg;
      delete transformed.steps;
      delete transformed.chaos;
      delete transformed.output_quality;
      delete transformed.num_outputs;
      delete transformed.output_format;
      delete transformed.safety_filter_level;
      break;

    case 'recraft-v3-svg':
      // Recraft V3 SVG specific transformations
      
      // Handle aspect ratio and size logic
      if (transformed.aspect_ratio && transformed.aspect_ratio !== 'Not set') {
        // When aspect ratio is set, size is ignored according to schema
        const supportedRatios = [
          "1:1", "4:3", "3:4", "3:2", "2:3", "16:9", "9:16", 
          "1:2", "2:1", "7:5", "5:7", "4:5", "5:4", "3:5", "5:3"
        ];
        if (!supportedRatios.includes(transformed.aspect_ratio)) {
          transformed.aspect_ratio = "Not set";
        }
        
        // Remove size when aspect ratio is set
        if (transformed.aspect_ratio !== "Not set") {
          delete transformed.size;
        }
      } else {
        // When aspect ratio is "Not set" or missing, use size
        transformed.aspect_ratio = "Not set";
        
        if (transformed.size) {
          const supportedSizes = [
            "1024x1024", "1365x1024", "1024x1365", "1536x1024", "1024x1536",
            "1820x1024", "1024x1820", "1024x2048", "2048x1024", "1434x1024",
            "1024x1434", "1024x1280", "1280x1024", "1024x1707", "1707x1024"
          ];
          if (!supportedSizes.includes(transformed.size)) {
            transformed.size = "1024x1024";
          }
        }
      }
      
      // Convert width/height to size if provided but no aspect ratio or size set
      if (transformed.width && transformed.height && !transformed.size && (!transformed.aspect_ratio || transformed.aspect_ratio === "Not set")) {
        const width = parseInt(transformed.width);
        const height = parseInt(transformed.height);
        transformed.size = `${width}x${height}`;
        transformed.aspect_ratio = "Not set";
        delete transformed.width;
        delete transformed.height;
      }
      
      // Validate style
      if (transformed.style) {
        const supportedStyles = ["any", "engraving", "line_art", "line_circuit", "linocut"];
        if (!supportedStyles.includes(transformed.style)) {
          transformed.style = "any";
        }
      }
      
      // Remove unsupported parameters
      delete transformed.negative_prompt;
      delete transformed.guidance_scale;
      delete transformed.num_inference_steps;
      delete transformed.seed;
      delete transformed.cfg;
      delete transformed.steps;
      delete transformed.chaos;
      delete transformed.output_quality;
      delete transformed.num_outputs;
      delete transformed.output_format;
      delete transformed.safety_filter_level;
      delete transformed.width;
      delete transformed.height;
      break;

    case 'luma-photon':
      // Reference-guided model transformations
      
      // Validate aspect ratio
      if (transformed.aspect_ratio) {
        const supportedRatios = ["1:1", "3:4", "4:3", "9:16", "16:9", "9:21", "21:9"];
        if (!supportedRatios.includes(transformed.aspect_ratio)) {
          transformed.aspect_ratio = "16:9"; // Default
        }
      } else {
        transformed.aspect_ratio = "16:9"; // Default if not provided
      }
      
      // Handle seed
      if (transformed.seed && transformed.seed !== '') {
        transformed.seed = parseInt(transformed.seed);
      } else {
        delete transformed.seed; // Let it be random if not provided
      }
      
      // Validate and clamp reference weights
      if (transformed.image_reference_weight !== undefined) {
        transformed.image_reference_weight = Math.max(0, Math.min(1, parseFloat(transformed.image_reference_weight)));
      } else {
        transformed.image_reference_weight = 0.85; // Default
      }
      
      if (transformed.style_reference_weight !== undefined) {
        transformed.style_reference_weight = Math.max(0, Math.min(1, parseFloat(transformed.style_reference_weight)));
      } else {
        transformed.style_reference_weight = 0.85; // Default
      }
      
      // Handle deprecated URL parameters - convert to new format if needed
      if (transformed.image_reference_url && !transformed.image_reference) {
        transformed.image_reference = transformed.image_reference_url;
      }
      if (transformed.style_reference_url && !transformed.style_reference) {
        transformed.style_reference = transformed.style_reference_url;
      }
      if (transformed.character_reference_url && !transformed.character_reference) {
        transformed.character_reference = transformed.character_reference_url;
      }
      
      // Remove deprecated parameters
      delete transformed.image_reference_url;
      delete transformed.style_reference_url;
      delete transformed.character_reference_url;
      
      // Remove unsupported parameters that might be passed from other models
      delete transformed.width;
      delete transformed.height;
      delete transformed.guidance_scale;
      delete transformed.cfg;
      delete transformed.num_inference_steps;
      delete transformed.steps;
      delete transformed.negative_prompt;
      delete transformed.chaos;
      delete transformed.output_quality;
      delete transformed.num_outputs;
      delete transformed.output_format;
      delete transformed.safety_filter_level;
      delete transformed.size;
      delete transformed.style;
      break;

    default:
      break;
  }

  return transformed;
}

// Get available models endpoint
router.get('/models', (req: Request, res: Response) => {
  res.json({
    image_models: IMAGE_GENERATION_MODELS,
    text_models: TEXT_GENERATION_MODELS,
    all_models: Object.keys(MODEL_MAPPINGS)
  });
});

export default router;