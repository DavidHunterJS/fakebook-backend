// src/routes/webhooks.ts
import express, { Request, Response } from 'express';
import Stripe from 'stripe';
import User from '../models/User';
import { performMonthlyReset } from '../services/creditService';

const router = express.Router();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-09-30.clover',
});

// Custom interface to handle subscription property
interface InvoiceWithSubscription extends Stripe.Invoice {
  subscription: string | Stripe.Subscription | null;
}

router.post('/stripe', express.raw({ type: 'application/json' }), async (req: Request, res: Response) => {
  console.log("--- STRIPE WEBHOOK ENDPOINT HIT ---"); 
  const sig = req.headers['stripe-signature'] as string;
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET!;

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
  } catch (err: any) {
    console.error(`❌ Webhook signature verification failed.`, err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  console.log(`✅ Stripe Webhook Received: ${event.type}`);
  
  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        
        console.log("--- checkout.session.completed ---");
        console.log("Session ID:", session.id);
        console.log("Metadata:", session.metadata);
        
        const { userId, tier } = session.metadata!;
        
        if (!userId || !tier) {
          console.error(`❌ Missing userId or tier in metadata`);
          break;
        }
        
        // Extract subscription ID
        let subscriptionId: string | null = null;
        if (typeof session.subscription === 'string') {
          subscriptionId = session.subscription;
        } else if (session.subscription && typeof session.subscription === 'object') {
          subscriptionId = session.subscription.id;
        }

        if (!subscriptionId) {
          console.error(`❌ No subscription ID found for session ${session.id}`);
          break;
        }

        console.log(`Processing subscription ${subscriptionId} for user ${userId}`);

        await User.findByIdAndUpdate(userId, {
          'subscription.tier': tier,
          'subscription.status': 'Active',
          'subscription.stripeCustomerId': session.customer,
          'subscription.stripeSubscriptionId': subscriptionId,
          'subscription.lastResetDate': new Date(),
        });

        await performMonthlyReset(userId);
        console.log(`✅ User ${userId} successfully subscribed to ${tier} tier.`);
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as InvoiceWithSubscription;
        const subscription = invoice.subscription;
        
        let subscriptionId: string | null = null;
        if (typeof subscription === 'string') {
          subscriptionId = subscription;
        } else if (subscription && typeof subscription === 'object') {
          subscriptionId = subscription.id;
        }

        if (subscriptionId) {
          const user = await User.findOne({ 'subscription.stripeSubscriptionId': subscriptionId });
          if (user) {
            await performMonthlyReset(user._id);
            user.subscription.status = 'Active';
            await user.save();
            console.log(`✅ Monthly reset completed for user ${user._id}`);
          } else {
            console.warn(`⚠️ No user found with subscription ${subscriptionId}`);
          }
        } else {
          console.log(`Invoice ${invoice.id} is not related to a subscription.`);
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as InvoiceWithSubscription;
        const subscription = invoice.subscription;

        let subscriptionId: string | null = null;
        if (typeof subscription === 'string') {
          subscriptionId = subscription;
        } else if (subscription && typeof subscription === 'object') {
          subscriptionId = subscription.id;
        }

        if (subscriptionId) {
          await User.updateOne(
            { 'subscription.stripeSubscriptionId': subscriptionId },
            { 'subscription.status': 'Past Due' }
          );
          console.warn(`⚠️ Payment failed for subscription ${subscriptionId}`);
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        await User.updateOne(
          { 'subscription.stripeSubscriptionId': subscription.id },
          {
            'subscription.tier': 'Free',
            'subscription.status': 'Cancelled',
            'subscription.stripeSubscriptionId': null,
          }
        );
        console.log(`✅ Subscription ${subscription.id} deleted. User downgraded to Free.`);
        break;
      }
      
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const newTier = subscription.metadata.tier as 'Basic' | 'Pro';

        if (subscription.cancel_at_period_end) {
          console.log(`Subscription ${subscription.id} will cancel at period end.`);
        } else if (newTier) {
          console.log(`Subscription ${subscription.id} updated to ${newTier}.`);
          await User.updateOne(
            { 'subscription.stripeSubscriptionId': subscription.id },
            { 'subscription.tier': newTier }
          );
        }
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }
  } catch (err: any) {
    console.error(`❌ Error processing webhook ${event.type}:`, err);
    // Still return 200 to Stripe so they don't retry
    // But log the error for investigation
  }

  res.status(200).json({ received: true });
});

// ✅ CRITICAL: Export the router
export default router;