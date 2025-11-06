import dotenv from 'dotenv';
import Stripe from 'stripe';
import path from 'path';

// --- START: DEBUG LOGGING ---

// 1. Log the current working directory to see where the script is running from.
const CWD = process.cwd();
console.log(`[DEBUG] Current Working Directory: ${CWD}`);

// 2. Construct the full, absolute path to the .env file we expect to find.
const envPath = path.resolve(CWD, '.env');
console.log(`[DEBUG] Attempting to load .env file from: ${envPath}`);

// --- END: DEBUG LOGGING ---


// Load environment variables from the constructed path
dotenv.config({ path: envPath });

// Check if the key was loaded successfully
const stripeKey = process.env.STRIPE_SECRET_KEY;

if (!stripeKey) {
  console.error('\n❌ FATAL ERROR: STRIPE_SECRET_KEY was not found after loading .env file.');
  console.error('   Please ensure your .env file is in the correct directory (shown above) and contains the STRIPE_SECRET_KEY variable.');
  process.exit(1); // Exit immediately with an error
}

console.log(`[DEBUG] Stripe key loaded successfully.`);

// Initialize Stripe with the loaded secret key
const stripe = new Stripe(stripeKey);

async function createSubscriptionCheckout() {
  // --- CONFIGURE YOUR TEST HERE ---
  const userId = '68ee9cb477be39fc754aa744';
  const priceId = 'price_1SIDvVQT7T1f70ikTKYMfXmD';
  // --- END OF CONFIGURATION ---

  console.log('\nCreating a Stripe Checkout session for a subscription...');

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [ { price: priceId, quantity: 1 } ],
      metadata: { userId: userId, tier: 'Basic' },
      success_url: 'https://example.com/success',
      cancel_url: 'https://example.com/cancel',
    });

    console.log('\n✅ Success! A Checkout Session has been created.');
    console.log('\n--- VISIT THIS URL IN YOUR BROWSER TO COMPLETE THE TEST ---');
    console.log(session.url);
    console.log('\nAfter you click "Subscribe" on that page, check your Express server logs for the webhook.\n');

  } catch (error: any) {
    console.error('\n❌ An error occurred while creating the session:');
    console.error(error.message);
  }
}

createSubscriptionCheckout();