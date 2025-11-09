// src/routes/subscription.ts
import express, { Request, Response } from 'express';
import Stripe from 'stripe';
import User from '../models/User';
import requireAuth from '../middlewares/auth.middleware';
import { TIER_LIMITS, Tier } from '../config/subscriptions';
import { canUserPerformAction, deductCredit } from '../services/creditService';

const router = express.Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-09-30.clover',
});

// Create Stripe Checkout Session OR Portal Session
router.post('/create-checkout-session', requireAuth, async (req: Request, res: Response) => {
  try {
    const { tier } = req.body; // 'Basic' or 'Pro'
    const userId = req.user!._id;
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // --- (START) THIS IS THE NEW LOGIC ---

    // CHECK 1: Does the user have an active subscription?
    if (user.subscription.tier !== 'Free' && user.stripeCustomerId) {
      // YES. User has an active sub. Send them to the Billing Portal.
      console.log(`✅ User ${userId} has an active sub. Creating Billing Portal session.`);
      
      const portalSession = await stripe.billingPortal.sessions.create({
        customer: user.stripeCustomerId,
        // Send them to your main page after
        return_url: `${process.env.CLIENT_URL}/`, 
      });

      // Send back the portal URL to redirect
      return res.json({ url: portalSession.url });
    }

    // CHECK 2: User is on 'Free' tier. Proceed with new checkout.
    const priceId = tier === 'Basic' 
      ? process.env.STRIPE_BASIC_PRICE_ID 
      : process.env.STRIPE_PRO_PRICE_ID;

    if (!priceId) {
      return res.status(500).json({ error: 'Price ID not configured' });
    }

    // Prepare session options
    const sessionOptions: Stripe.Checkout.SessionCreateParams = {
      payment_method_types: ['card'],
      mode: 'subscription',
      line_items: [{
        price: priceId,
        quantity: 1,
      }],
      success_url: `${process.env.CLIENT_URL}/subscription/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.CLIENT_URL}/subscription/cancel`,
      metadata: {
        userId: userId.toString(),
        tier,
      },
    };

    // This is key: Use the Customer ID if it exists, otherwise use the email.
    // This prevents duplicate customers in Stripe.
    if (user.stripeCustomerId) {
      sessionOptions.customer = user.stripeCustomerId;
    } else {
      sessionOptions.customer_email = user.email;
    }

    // --- (END) NEW LOGIC ---

    const session = await stripe.checkout.sessions.create(sessionOptions);

    console.log(`✅ Checkout session created for user ${userId}: ${session.id}`);
    res.json({ sessionId: session.id, url: session.url });
  } catch (error: any) {
    console.error('❌ Error creating checkout session:', error);
    res.status(500).json({ error: error.message });
  }
});

// ... (the rest of your file /status, /cancel, /reactivate remains the same) ...

// Get current subscription status and available credits
router.get('/status', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!._id;
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // ✅ Type assertion to tell TypeScript this is a valid Tier
    const tier = user.subscription.tier as Tier;
    const limits = TIER_LIMITS[tier];

    // Calculate available credits based on tier
    let availableCredits;
    
    if (tier === 'Free') {
      availableCredits = {
        checks: {
          total: limits.checks,
          used: user.lifetimeCredits.checksUsed,
          remaining: Math.max(0, limits.checks - user.lifetimeCredits.checksUsed),
        },
        fixes: {
          total: limits.fixes,
          used: user.lifetimeCredits.fixesUsed,
          remaining: Math.max(0, limits.fixes - user.lifetimeCredits.fixesUsed),
        },
      };
    } else {
      // ✅ TypeScript now knows this tier has rolloverCaps
      const checksMonthlyRemaining = Math.max(0, limits.checks - user.credits.checksUsed);
      const fixesMonthlyRemaining = Math.max(0, limits.fixes - user.credits.fixesUsed);
      
      availableCredits = {
        checks: {
          monthly: limits.checks,
          monthlyUsed: user.credits.checksUsed,
          monthlyRemaining: checksMonthlyRemaining,
          rollover: user.credits.checksRollover,
          totalAvailable: checksMonthlyRemaining + user.credits.checksRollover,
        },
        fixes: {
          monthly: limits.fixes,
          monthlyUsed: user.credits.fixesUsed,
          monthlyRemaining: fixesMonthlyRemaining,
          rollover: user.credits.fixesRollover,
          totalAvailable: fixesMonthlyRemaining + user.credits.fixesRollover,
        },
      };
    }

    res.json({
      tier: user.subscription.tier,
      status: user.subscription.status,
      lastResetDate: user.subscription.lastResetDate,
      credits: availableCredits,
    });
  } catch (error: any) {
    console.error('❌ Error fetching subscription status:', error);
    res.status(500).json({ error: error.message });
  }
});

// Cancel subscription (set to cancel at period end)
router.post('/cancel', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!._id;
    const user = await User.findById(userId);
    
    if (!user?.subscription.stripeSubscriptionId) {
      return res.status(400).json({ error: 'No active subscription found' });
    }

    const subscription = await stripe.subscriptions.update(
      user.subscription.stripeSubscriptionId, 
      {
        cancel_at_period_end: true,
      }
    );

    console.log(`✅ Subscription ${subscription.id} will cancel at period end`);
    res.json({ 
      message: 'Subscription will be cancelled at the end of the billing period',
      cancelAt: subscription.cancel_at ? new Date(subscription.cancel_at * 1000) : null,
    });
  } catch (error: any) {
    console.error('❌ Error cancelling subscription:', error);
    res.status(500).json({ error: error.message });
  }
});

// Reactivate a cancelled subscription (before period end)
router.post('/reactivate', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!._id;
    const user = await User.findById(userId);
    
    if (!user?.subscription.stripeSubscriptionId) {
      return res.status(400).json({ error: 'No subscription found' });
    }

    const subscription = await stripe.subscriptions.update(
      user.subscription.stripeSubscriptionId,
      {
        cancel_at_period_end: false,
      }
    );

    console.log(`✅ Subscription ${subscription.id} reactivated`);
    res.json({ 
      message: 'Subscription reactivated successfully',
    });
  } catch (error: any) {
    console.error('❌ Error reactivating subscription:', error);
    res.status(500).json({ error: error.message });
  }
});




// ⚠️ TEMPORARY TEST ENDPOINT - Remove in production
router.post('/test-deduct', requireAuth, async (req: Request, res: Response) => {
  try {
    const { actionType } = req.body; // 'check' or 'fix'
    const userId = req.user!._id.toString();

    console.log(`Testing deduction for user ${userId}, action: ${actionType}`);

    // Check if user has credits
    const canPerform = await canUserPerformAction(userId, actionType);
    if (!canPerform) {
      return res.status(403).json({
        error: 'Insufficient credits',
        code: 'CREDITS_EXHAUSTED',
        message: `No ${actionType} credits remaining`
      });
    }

    // Deduct credit
    await deductCredit(userId, actionType);

    console.log(`✅ Successfully deducted 1 ${actionType} credit`);

    res.json({ 
      success: true, 
      message: `Successfully deducted 1 ${actionType} credit` 
    });
  } catch (error: any) {
    console.error('❌ Test deduction error:', error);
    res.status(500).json({ error: error.message });
  }
});


export default router;