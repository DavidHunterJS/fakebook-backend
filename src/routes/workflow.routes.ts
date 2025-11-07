// // src/routes/workflow.routes.ts
// import express, { Router } from 'express';
// import { body, param, query } from 'express-validator';
// // import * as workflowController from '../controllers/workflow.controller';
// import authMiddleware from '../middlewares/auth.middleware';
// import s3UploadMiddleware from '../middlewares/s3-upload.middleware';

// const router: Router = express.Router();

// // Apply auth middleware to all routes
// router.use(authMiddleware);

// /**
//  * @route   POST /api/workflow/start
//  * @desc    Start a new workflow processing job
//  * @access  Private
//  */
// router.post(
//   '/start',
//   s3UploadMiddleware.workflowImage,
//   [
//     body('workflowType')
//       .isIn(['product_enhancement', 'lifestyle_scenes', 'product_variants'])
//       .withMessage('Invalid workflow type'),
//     body('userId')
//       .optional()
//       .isMongoId()
//       .withMessage('Invalid user ID')
//   ],
//   workflowController.startWorkflow
// );

// /**
//  * @route   GET /api/workflow/status/:jobId
//  * @desc    Get workflow job status
//  * @access  Private
//  */
// router.get(
//   '/status/:jobId',
//   [
//     param('jobId')
//       .isUUID()
//       .withMessage('Invalid job ID')
//   ],
//   workflowController.getWorkflowStatus
// );

// /**
//  * @route   GET /api/workflow/results/:jobId
//  * @desc    Get workflow results
//  * @access  Private
//  */
// router.get(
//   '/results/:jobId',
//   [
//     param('jobId')
//       .isUUID()
//       .withMessage('Invalid job ID')
//   ],
//   workflowController.getWorkflowResults
// );

// /**
//  * @route   GET /api/workflow/download/:jobId
//  * @desc    Download workflow results as ZIP or individual files
//  * @access  Private
//  */
// router.get(
//   '/download/:jobId',
//   [
//     param('jobId')
//       .isUUID()
//       .withMessage('Invalid job ID'),
//     query('format')
//       .optional()
//       .isIn(['zip', 'individual'])
//       .withMessage('Format must be zip or individual')
//   ],
//   workflowController.downloadResults
// );

// /**
//  * @route   GET /api/workflow/history
//  * @desc    Get user's workflow history
//  * @access  Private
//  */
// router.get(
//   '/history',
//   [
//     query('page')
//       .optional()
//       .isInt({ min: 1 })
//       .withMessage('Page must be a positive integer'),
//     query('limit')
//       .optional()
//       .isInt({ min: 1, max: 50 })
//       .withMessage('Limit must be between 1 and 50'),
//     query('workflowType')
//       .optional()
//       .isIn(['product_enhancement', 'lifestyle_scenes', 'product_variants'])
//       .withMessage('Invalid workflow type')
//   ],
//   workflowController.getWorkflowHistory
// );

// /**
//  * @route   DELETE /api/workflow/:jobId
//  * @desc    Delete workflow job and results
//  * @access  Private
//  */
// router.delete(
//   '/:jobId',
//   [
//     param('jobId')
//       .isUUID()
//       .withMessage('Invalid job ID')
//   ],
//   workflowController.deleteWorkflow
// );

// /**
//  * @route   POST /api/workflow/:jobId/retry
//  * @desc    Retry failed workflow
//  * @access  Private
//  */
// router.post(
//   '/:jobId/retry',
//   [
//     param('jobId')
//       .isUUID()
//       .withMessage('Invalid job ID')
//   ],
//   workflowController.retryWorkflow
// );

// /**
//  * @route   GET /api/workflow/credits
//  * @desc    Get user's credit information
//  * @access  Private
//  */
// router.get('/credits', workflowController.getUserCredits);

// /**
//  * @route   POST /api/workflow/credits/add
//  * @desc    Add credits to user account (testing/admin only)
//  * @access  Private
//  */
// router.post(
//   '/credits/add',
//   [
//     body('credits')
//       .isInt({ min: 1 })
//       .withMessage('Credits must be a positive integer')
//   ],
//   workflowController.addCredits
// );

// export default router;