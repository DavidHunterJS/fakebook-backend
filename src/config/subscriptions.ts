// This file acts as the single source of truth for all subscription tier rules.
// If you ever want to change credit amounts or rollover caps, you only need to edit this file.

// src/config/subscriptions.ts
export const TIER_LIMITS = {
  Free: {
    checks: 10, // Lifetime limit, not per month
    fixes: 3,   // Lifetime limit, not per month
  },
  Basic: {
    checks: 50, // Per month
    fixes: 25,  // Per month
    rolloverCaps: {
      checks: 200,
      fixes: 100,
    },
  },
  Pro: {
    checks: 150, // Per month
    fixes: 75,   // Per month
    rolloverCaps: {
      checks: 500,
      fixes: 250,
    },
  },
} as const; // Using "as const" makes this object readonly and improves TypeScript type inference.

// We can also define a type helper for our tier names for convenience
export type Tier = keyof typeof TIER_LIMITS;