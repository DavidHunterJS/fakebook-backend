import { Request, Response } from 'express';
import Stripe from 'stripe';
import  verifyToken  from '../middlewares/auth.middleware'; // Your auth middleware

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export const createCheckoutSession = async (req: Request, res: Response) => {
  try {
    // Get authenticated user
    const userId = req.user?.id; // Assuming your auth middleware adds user to req
    const userEmail = req.user?.email;

    if (!userId || !userEmail) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const { tier } = req.body;

    if (!tier || !['basic', 'pro'].includes(tier)) {
      return res.status(400).json({ error: 'Invalid tier' });
    }

    // Get the correct price ID
    const priceId = tier === 'basic' 
      ? process.env.STRIPE_BASIC_PRICE_ID 
      : process.env.STRIPE_PRO_PRICE_ID;

    if (!priceId) {
      return res.status(500).json({ error: 'Price ID not configured' });
    }

    // Create Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      customer_email: userEmail,
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: `${process.env.NEXT_PUBLIC_URL}/dashboard?success=true`,
      cancel_url: `${process.env.NEXT_PUBLIC_URL}/pricing?canceled=true`,
      metadata: {
        userId: userId.toString(),
        tier: tier,
      },
    });

    return res.json({ url: session.url });
  } catch (error) {
    console.error('Error creating checkout session:', error);
    return res.status(500).json({ error: 'Failed to create checkout session' });
  }
};