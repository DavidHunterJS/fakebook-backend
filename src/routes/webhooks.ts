import express, { Request, Response } from 'express';
import Stripe from 'stripe';
import User from '../models/User';
import { performMonthlyReset } from '../services/creditService';
import { TIER_LIMITS } from '../config/subscriptions';

const router = express.Router();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-09-30.clover',
});

// --- THIS IS THE FIX ---
// We create our own interface that extends Stripe's and adds the missing property.
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
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      
      console.log("--- Inspected checkout.session.completed object ---:", session)
      
      const { userId, tier } = session.metadata!;
      
      // Safely extract the subscription ID, because it might not be a simple string.
      let subscriptionId: string | null = null;
      if (typeof session.subscription === 'string') {
        subscriptionId = session.subscription;
      } else if (session.subscription && typeof session.subscription === 'object') {
        subscriptionId = session.subscription.id;
      }

      if (!subscriptionId) {
        console.error(`❌ Critical Error: Could not find subscription ID on checkout session ${session.id}`);
        break; // Stop processing this event
      }

      await User.findByIdAndUpdate(userId, {
        'subscription.tier': tier,
        'subscription.status': 'Active',
        'subscription.stripeCustomerId': session.customer,
        'subscription.stripeSubscriptionId': session.subscription,
        'subscription.lastResetDate': new Date(),
      });

      await performMonthlyReset(userId);
      console.log(`User ${userId} successfully subscribed to ${tier} tier.`);
      break;
    }

    case 'invoice.payment_succeeded': {
      // Use our new, more accurate interface here
      const invoice = event.data.object as InvoiceWithSubscription;
      const subscription = invoice.subscription; // This will now work without an error
      
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
          console.log(`Monthly reset completed for user ${user._id} via successful payment.`);
        }
      } else {
        console.log(`Invoice ${invoice.id} is not related to a subscription. Skipping reset.`);
      }
      break;
    }

    case 'invoice.payment_failed': {
      // Use our new interface here as well
      const invoice = event.data.object as InvoiceWithSubscription;
      const subscription = invoice.subscription; // This will also work now

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
        console.warn(`Payment failed for subscription ${subscriptionId}. User status set to 'Past Due'.`);
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
      console.log(`Subscription ${subscription.id} was deleted. User downgraded to Free.`);
      break;
    }
    
    case 'customer.subscription.updated': {
      const subscription = event.data.object as Stripe.Subscription;
      const newTier = subscription.metadata.tier as 'Basic' | 'Pro';

      if (subscription.cancel_at_period_end) {
        console.log(`Subscription ${subscription.id} scheduled for downgrade to ${newTier} at period end.`);
      } else {
        console.log(`Subscription ${subscription.id} was upgraded to ${newTier}.`);
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

  res.status(200).json({ received: true });
});

export default router;