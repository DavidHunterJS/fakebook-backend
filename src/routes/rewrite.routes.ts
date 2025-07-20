// src/routes/rewrite.routes.ts

import express, { Request, Response, Router } from 'express';
import Replicate from 'replicate';

interface RewriteTextRequestBody {
  text: string;
}

const replicate = new Replicate();
const router: Router = express.Router();

router.post(
  '/rewrite-text',
  async (req: Request<{}, {}, RewriteTextRequestBody>, res: Response) => {
    const { text: userText } = req.body;

    if (!userText || userText.trim().length === 0) {
      return res.status(400).json({ message: 'Text to rewrite is required.' });
    }

    try {
      // This is the specific model version for Llama 3 8B-Instruct
      const model = "meta/meta-llama-3-8b-instruct" // Copy the latest hash from the Replicate page

      // We create a specific prompt to instruct the AI on its task.
      const prompt = `Rewrite the following text to be more engaging and clear, correcting any grammatical errors. Do not add any commentary, introductory phrases like "Here is the rewritten text:", or markdown formatting. Just provide the rewritten text directly.\n\nOriginal Text: "${userText}"\n\nRewritten Text:`;
      
      const input = {
        top_p: 0.9,
        prompt: prompt,
        temperature: 0.6,
        max_new_tokens: 1024,
      };

      console.log('Requesting text rewrite from Replicate...');
      const output = await replicate.run(model, { input });

      // Llama 3 streams its output as an array of strings; we join them.
      const rewrittenText = (output as string[]).join("");

      return res.status(200).json({ rewrittenText });

    } catch (error) {
      console.error('Replicate API error:', error);
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
      res.status(500).json({ message: 'Failed to rewrite text.', error: errorMessage });
    }
  }
);

export default router;