// src/middleware/checkCredits.ts
import { Request, Response, NextFunction } from 'express';
import { canUserPerformAction, deductCredit } from '../services/creditService';

type ActionType = 'check' | 'fix';

// Middleware to check if user has credits before performing an action
export const checkCredits = (actionType: ActionType) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // ✅ Non-null assertion since requireAuth middleware runs first
      const userId = req.user!._id.toString();
      
      const canPerform = await canUserPerformAction(userId, actionType);
      
      if (!canPerform) {
        return res.status(403).json({ 
          error: 'Insufficient credits',
          code: 'CREDITS_EXHAUSTED',
          actionType,
          message: `You've run out of ${actionType} credits. Please upgrade your plan to continue.`,
        });
      }
      
      // User has credits, proceed to next middleware/route
      next();
    } catch (error: any) {
      console.error('❌ Error checking credits:', error);
      res.status(500).json({ error: 'Error checking credits', details: error.message });
    }
  };
};

// Middleware to deduct credit after successful action
export const deductCreditAfterAction = (actionType: ActionType) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!._id.toString();
      await deductCredit(userId, actionType);
      console.log(`✅ Deducted 1 ${actionType} credit from user ${userId}`);
      next();
    } catch (error: any) {
      console.error('❌ Error deducting credit:', error);
      // Don't block the response, just log the error
      next();
    }
  };
};

export default { checkCredits, deductCreditAfterAction };