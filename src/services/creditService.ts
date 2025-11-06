// src/services/creditService.ts
import User from '../models/User';
import { TIER_LIMITS, Tier } from '../config/subscriptions';
import { IUser } from '../models/User';

type ActionType = 'check' | 'fix';

// --- Helper Function ---
const hasMonthPassed = (lastResetDate: Date): boolean => {
  const aMonthAgo = new Date();
  aMonthAgo.setDate(aMonthAgo.getDate() - 30);
  return lastResetDate < aMonthAgo;
};

// --- Function 1: The Gatekeeper (canUserPerformAction) ---
export async function canUserPerformAction(userId: string, actionType: ActionType): Promise<boolean> {
  let user = await User.findById(userId).lean<IUser>();
  if (!user) {
    console.error(`canUserPerformAction: User not found for ID: ${userId}`);
    return false;
  }

  // --- Part 6: Handle Free tier edge case (with safety check) ---
  if (user.subscription.tier === 'Free') {
    const limit = (actionType === 'check') ? TIER_LIMITS.Free.checks : TIER_LIMITS.Free.fixes;
    
    // Safely get the 'used' count, defaulting to 0
    const used = (actionType === 'check') 
      ? (user.lifetimeCredits?.checksUsed || 0) 
      : (user.lifetimeCredits?.fixesUsed || 0);
      
    return used < limit;
  }
  
  // --- Part 9: "Lazy Reset" Logic ---
  if (hasMonthPassed(user.subscription.lastResetDate)) {
    console.log(`Monthly reset triggered for user: ${userId}`);
    await performMonthlyReset(userId);
    user = await User.findById(userId).lean();
    if (!user) return false;
  }

  // --- Part 3: Calculate if credits are available for Basic/Pro tiers ---
  const tier = user.subscription.tier as Exclude<Tier, 'Free'>;
  const limits = TIER_LIMITS[tier];

  const monthlyAllowance = (actionType === 'check') ? limits.checks : limits.fixes;
  const monthlyUsed = (actionType === 'check') ? user.credits.checksUsed : user.credits.fixesUsed;
  const rolloverAvailable = (actionType === 'check') ? user.credits.checksRollover : user.credits.fixesRollover;
  
  const monthlyRemaining = monthlyAllowance - monthlyUsed;
  const totalAvailable = (monthlyRemaining > 0 ? monthlyRemaining : 0) + rolloverAvailable;

  return totalAvailable >= 1;
}


// --- Function 2: The Bookkeeper (deductCredit) ---
// 👇 --- THIS IS THE FULLY CORRECTED FUNCTION --- 👇
export async function deductCredit(userId: string, actionType: ActionType): Promise<void> {
  console.log("deductCredit FIRED NOW!!!!!!!!!!!!!!!!!!!!!!!")
  const user = await User.findById(userId);
  if (!user) {
    console.error(`deductCredit: User not found for ID: ${userId}`);
    return;
  }

  const field = (actionType === 'check') ? 'checks' : 'fixes';
  const usedField = `${field}Used` as 'checksUsed' | 'fixesUsed';
  const rolloverField = `${field}Rollover` as 'checksRollover' | 'fixesRollover';

  // Fix 1: Corrected debug log
  console.log(`deductCredit: Deducting 1 '${field}' credit from user ID: ${userId}`);

  // --- Part 6: Handle Free tier edge case ---
  if (user.subscription.tier === 'Free') {
    
    // Fix 2: Add safety check
    if (!user.lifetimeCredits) {
      user.lifetimeCredits = { checksUsed: 0, fixesUsed: 0 };
    }
    if (typeof user.lifetimeCredits[usedField] !== 'number') {
      user.lifetimeCredits[usedField] = 0;
    }
    // --- End Fix ---

    user.lifetimeCredits[usedField]++;
    await user.save();
    console.log(`deductCredit: Free tier user ${userId} new count: ${user.lifetimeCredits[usedField]}`);
    return;
  }

  // --- Part 3: Use monthly credits FIRST ---
  const tier = user.subscription.tier as Exclude<Tier, 'Free'>;
  const monthlyAllowance = TIER_LIMITS[tier][field];
  
  if (user.credits[usedField] < monthlyAllowance) {
    user.credits[usedField]++;
  } else { 
    user.credits[rolloverField] = Math.max(0, user.credits[rolloverField] - 1);
  }
  
  await user.save();
  console.log(`deductCredit: Paid tier user ${userId} credit deducted.`);
}


// --- Function 3: The Monthly Accountant (performMonthlyReset) ---
export async function performMonthlyReset(userId: string): Promise<void> {
  const user = await User.findById(userId);
  if (!user || user.subscription.tier === 'Free') return;

  const tier = user.subscription.tier as Exclude<Tier, 'Free'>;
  const limits = TIER_LIMITS[tier];
  
  const unusedChecks = limits.checks - user.credits.checksUsed;
  const unusedFixes = limits.fixes - user.credits.fixesUsed;

  const newChecksRollover = user.credits.checksRollover + (unusedChecks > 0 ? unusedChecks : 0);
  const newFixesRollover = user.credits.fixesRollover + (unusedFixes > 0 ? unusedFixes : 0);
  
  user.credits.checksRollover = Math.min(newChecksRollover, limits.rolloverCaps.checks);
  user.credits.fixesRollover = Math.min(newFixesRollover, limits.rolloverCaps.fixes);

  user.credits.checksUsed = 0;
  user.credits.fixesUsed = 0;
  
  user.subscription.lastResetDate = new Date();
  
  await user.save();
  console.log(`Successfully performed monthly reset for user ${userId}.`);
}