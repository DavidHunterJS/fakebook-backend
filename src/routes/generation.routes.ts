// src/routes/generation.routes.ts

import express, { Request, Response, Router } from 'express';
import Replicate from 'replicate';

interface GenerateImageRequestBody {
  prompt: string;
}

const replicate = new Replicate();
const router: Router = express.Router();

router.post(
  '/generate-image',
  async (req: Request<{}, {}, GenerateImageRequestBody>, res: Response) => {
    const { prompt } = req.body;

    if (!prompt || prompt.trim().length === 0) {
      return res.status(400).json({ message: 'A non-empty prompt is required.' });
    }

    try {
      const model = "google/imagen-4";
      const input = {
        prompt: prompt,
        aspect_ratio: "1:1",
      };

      console.log(`Requesting image from Replicate with model ${model}...`);

      // Call the API
      const output = await replicate.run(model, { input });

      // ✅ Use the .url() method as shown in the official example
      if (output && typeof (output as any).url === 'function') {
        const imageUrl = (output as any).url();
        console.log('Received image URL from Replicate:', imageUrl);
        return res.status(200).json({ imageUrl: imageUrl });
      }

      // If the output is not in the expected format, throw an error
      console.error('Unexpected output format from Replicate:', output);
      throw new Error('Failed to get a valid response from Replicate.');

    } catch (error) {
      console.error('Replicate API error:', error);
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
      res.status(500).json({ message: 'Failed to generate image.', error: errorMessage });
    }
  }
);

export default router;