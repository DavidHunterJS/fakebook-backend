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
  'stable-diffusion-inpainting': 'black-forest-labs/flux-fill-dev',
  'midjourney-style': 'prompthero/openjourney:9936c2001faa2194a261c01381f90e65261879985476014a0a37a334593a05eb',
  'flux-schnell': 'black-forest-labs/flux-schnell',
  'google-imagen4': 'google/imagen-4',
  'bytedance-seedream3': 'bytedance/seedream-3',
  'recraft-v3-svg': 'recraft-ai/recraft-v3-svg',
  'luma-photon': 'luma/photon',
  'claude-4-sonnet': 'anthropic/claude-4-sonnet'
};

// Define which models generate images vs text
const IMAGE_GENERATION_MODELS = [
  'stable-diffusion-xl',
  'stable-diffusion-inpainting',
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
      imageUrls = output.map(item => {
        if (item && typeof item === 'object' && 'url' in item && typeof item.url === 'function') {
          return item.url();
        }
        return typeof item === 'string' ? item : '';
      }).filter(url => url);
    } else if (output && typeof output === 'object' && 'url' in output && typeof output.url === 'function') {
      imageUrls = [output.url()];
    } else if (typeof output === 'string') {
      imageUrls = [output];
    }

    res.json({
      success: true,
      images: imageUrls,
      model,
      parameters: transformedParams,
    });

  } catch (error) {
    console.error('Image generation error:', error);
    
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
      if (!transformed.max_tokens) {
        transformed.max_tokens = 8192;
      }
      transformed.max_tokens = Math.max(1024, Math.min(64000, parseInt(transformed.max_tokens)));
      
      if (transformed.system_prompt === undefined) transformed.system_prompt = "";
      if (transformed.extended_thinking === undefined) transformed.extended_thinking = false;
      
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
  case 'stable-diffusion-inpainting':
      // Ensure required fields are present
      if (!transformed.prompt || !transformed.image) {
        throw new Error('Prompt and Image URL are required for inpainting.');
      }

      // Convert string numbers to proper types
      if (transformed.num_outputs) {
        transformed.num_outputs = Math.max(1, Math.min(4, parseInt(transformed.num_outputs, 10)));
      }
      
      if (transformed.num_inference_steps) {
        transformed.num_inference_steps = Math.max(1, Math.min(50, parseInt(transformed.num_inference_steps, 10)));
      }
      
      if (transformed.guidance) {
        transformed.guidance = Math.max(0, Math.min(100, parseFloat(transformed.guidance)));
      }
      
      if (transformed.output_quality) {
        transformed.output_quality = Math.max(0, Math.min(100, parseInt(transformed.output_quality, 10)));
      }
      
      if (transformed.lora_scale) {
        transformed.lora_scale = Math.max(-1, Math.min(3, parseFloat(transformed.lora_scale)));
      }

      // Handle seed
      if (transformed.seed && transformed.seed !== '') {
        transformed.seed = parseInt(transformed.seed, 10);
      } else {
        delete transformed.seed;
      }

      // Handle optional LoRA weights
      if (!transformed.lora_weights || transformed.lora_weights.trim() === '') {
        delete transformed.lora_weights;
        delete transformed.lora_scale; // Remove lora_scale if no weights specified
      }

      // Handle boolean values
      if (transformed.disable_safety_checker === 'true' || transformed.disable_safety_checker === true) {
        transformed.disable_safety_checker = true;
      } else {
        transformed.disable_safety_checker = false;
      }

      // Remove any undefined or empty values
      Object.keys(transformed).forEach(key => {
        if (transformed[key] === undefined || transformed[key] === '') {
          delete transformed[key];
        }
      });

      break;
    case 'stable-diffusion-xl':
      if (transformed.guidance_scale) {
        transformed.cfg = parseFloat(transformed.guidance_scale);
        delete transformed.guidance_scale;
      }
      if (transformed.num_inference_steps) {
        transformed.steps = parseInt(transformed.num_inference_steps);
        delete transformed.num_inference_steps;
      }
      if (transformed.width && transformed.height) {
        const gcd = (a: number, b: number): number => b === 0 ? a : gcd(b, a % b);
        const w = parseInt(transformed.width);
        const h = parseInt(transformed.height);
        const divisor = gcd(w, h);
        transformed.aspect_ratio = `${w/divisor}:${h/divisor}`;
        delete transformed.width;
        delete transformed.height;
      }
      transformed.output_format = transformed.output_format || 'webp';
      transformed.output_quality = transformed.output_quality || 90;
      
      if (transformed.seed && transformed.seed !== '') {
        transformed.seed = parseInt(transformed.seed);
      } else {
        delete transformed.seed;
      }
      break;

    case 'midjourney-style':
      if (transformed.chaos) transformed.chaos = parseInt(transformed.chaos);
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
      if (transformed.output_quality) transformed.output_quality = parseInt(transformed.output_quality);
      if (transformed.num_outputs) transformed.num_outputs = parseInt(transformed.num_outputs);
      break;

    case 'google-imagen4':
      if (transformed.width && transformed.height) {
        const gcd = (a: number, b: number): number => b === 0 ? a : gcd(b, a % b);
        const w = parseInt(transformed.width);
        const h = parseInt(transformed.height);
        const divisor = gcd(w, h);
        const aspectRatio = `${w/divisor}:${h/divisor}`;
        
        const supportedRatios = ["1:1", "9:16", "16:9", "3:4", "4:3"];
        transformed.aspect_ratio = supportedRatios.includes(aspectRatio) ? aspectRatio : "1:1";
        delete transformed.width;
        delete transformed.height;
      }
      
      if (transformed.aspect_ratio && !["1:1", "9:16", "16:9", "3:4", "4:3"].includes(transformed.aspect_ratio)) {
        transformed.aspect_ratio = "1:1";
      }
      if (transformed.output_format && !["jpg", "png"].includes(transformed.output_format.toLowerCase())) {
        transformed.output_format = "jpg";
      }
      if (transformed.safety_filter_level && !["block_low_and_above", "block_medium_and_above", "block_only_high"].includes(transformed.safety_filter_level)) {
        transformed.safety_filter_level = "block_only_high";
      }
      
      delete transformed.guidance_scale;
      delete transformed.num_inference_steps;
      delete transformed.seed;
      break;

    case 'bytedance-seedream3':
      if (transformed.seed && transformed.seed !== '') {
        transformed.seed = parseInt(transformed.seed);
      } else {
        delete transformed.seed;
      }
      
      if (transformed.guidance_scale) {
        transformed.guidance_scale = Math.max(1, Math.min(10, parseFloat(transformed.guidance_scale)));
      }
      
      if (transformed.aspect_ratio === 'custom') {
        if (transformed.width) transformed.width = Math.max(512, Math.min(2048, parseInt(transformed.width)));
        if (transformed.height) transformed.height = Math.max(512, Math.min(2048, parseInt(transformed.height)));
        delete transformed.size;
      } else {
        delete transformed.width;
        delete transformed.height;
        if (!["1:1", "3:4", "4:3", "16:9", "9:16", "2:3", "3:2", "21:9"].includes(transformed.aspect_ratio)) {
          transformed.aspect_ratio = "16:9";
        }
        if (!["small", "regular", "big"].includes(transformed.size)) {
          transformed.size = "regular";
        }
      }
      
      if (!transformed.aspect_ratio && transformed.width && transformed.height) {
        transformed.aspect_ratio = 'custom';
        transformed.width = Math.max(512, Math.min(2048, parseInt(transformed.width)));
        transformed.height = Math.max(512, Math.min(2048, parseInt(transformed.height)));
        delete transformed.size;
      }
      break;

    case 'recraft-v3-svg':
      const validRatios = ["1:1", "4:3", "3:4", "3:2", "2:3", "16:9", "9:16", "1:2", "2:1", "7:5", "5:7", "4:5", "5:4", "3:5", "5:3"];
      if (transformed.aspect_ratio && validRatios.includes(transformed.aspect_ratio)) {
        delete transformed.size;
      } else {
        transformed.aspect_ratio = "Not set";
        const validSizes = ["1024x1024", "1365x1024", "1024x1365", "1536x1024", "1024x1536", "1820x1024", "1024x1820", "1024x2048", "2048x1024", "1434x1024", "1024x1434", "1024x1280", "1280x1024", "1024x1707", "1707x1024"];
        if (!validSizes.includes(transformed.size)) {
          transformed.size = "1024x1024";
        }
      }
      if (!["any", "engraving", "line_art", "line_circuit", "linocut"].includes(transformed.style)) {
        transformed.style = "any";
      }
      delete transformed.width;
      delete transformed.height;
      break;

    case 'luma-photon':
      if (!["1:1", "3:4", "4:3", "9:16", "16:9", "9:21", "21:9"].includes(transformed.aspect_ratio)) {
        transformed.aspect_ratio = "16:9";
      }
      if (transformed.seed && transformed.seed !== '') {
        transformed.seed = parseInt(transformed.seed);
      } else {
        delete transformed.seed;
      }
      if (transformed.image_reference_weight !== undefined) {
        transformed.image_reference_weight = Math.max(0, Math.min(1, parseFloat(transformed.image_reference_weight)));
      }
      if (transformed.style_reference_weight !== undefined) {
        transformed.style_reference_weight = Math.max(0, Math.min(1, parseFloat(transformed.style_reference_weight)));
      }
      delete transformed.width;
      delete transformed.height;
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