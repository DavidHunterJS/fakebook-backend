// src/controllers/workflow.controller.ts
import { Request, Response } from 'express';
import { validationResult } from 'express-validator';
import { v4 as uuidv4 } from 'uuid';
import User from '../models/User';
import WorkflowJob from '../models/WorkflowJob';
import { IUser } from '../types/user.types';
import { processWorkflow } from '../services/workflow.service';
import archiver from 'archiver';
import { JobStatus, WorkflowType } from '../config/enums';

declare module 'express-serve-static-core' {
  interface Request {
    user?: IUser;
    file?: Express.MulterS3.File;
  }
}

// Use standard Express Request instead of custom interface
type AuthenticatedRequest = Request;

// Workflow credit costs
const WORKFLOW_COSTS = {
  product_enhancement: 3,
  lifestyle_scenes: 4,
  product_variants: 5
} as const;

/**
 * @desc    Start a new workflow processing job
 * @route   POST /api/workflow/start
 * @access  Private
 */
export const startWorkflow = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        message: 'Validation errors', 
        errors: errors.array() 
      });
    }

    if (!req.user) {
      return res.status(401).json({ message: 'User not authenticated' });
    }

    const { workflowType } = req.body;
    const userId = req.user.id;
    const uploadedFile = req.file;

    if (!uploadedFile) {
      return res.status(400).json({ message: 'No image file provided' });
    }

    // Check if workflow type is valid
    if (!WORKFLOW_COSTS[workflowType as keyof typeof WORKFLOW_COSTS]) {
      return res.status(400).json({ message: 'Invalid workflow type' });
    }

    const requiredCredits = WORKFLOW_COSTS[workflowType as keyof typeof WORKFLOW_COSTS];

    // Get user and check credits
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (!user.hasEnoughCredits(requiredCredits)) {
      return res.status(400).json({ 
        message: 'Insufficient credits',
        required: requiredCredits,
        available: user.creditsRemaining
      });
    }

    // Create workflow job
    const jobId = uuidv4();
    const workflowJob = new WorkflowJob({
      jobId,
      userId,
      workflowType,
      status: 'processing',
      progress: 0,
      creditsUsed: requiredCredits,
      inputImageUrl: uploadedFile.location, // S3 URL
      inputImageKey: uploadedFile.key,
      metadata: {
        originalFilename: uploadedFile.originalname,
        fileSize: uploadedFile.size,
        mimeType: uploadedFile.mimetype
      }
    });

    await workflowJob.save();

    // Deduct credits
    await user.deductCredits(
      requiredCredits, 
      `Workflow: ${workflowType}`, 
      jobId
    );

    // Update workflow stats
    await user.updateWorkflowStats(workflowType);

    // Get Socket.IO instance from app
    const io = req.app.get('io');
    
    // Start background processing
    processWorkflow(jobId, workflowType, uploadedFile.location, io)
      .catch(async (error) => {
        console.error(`Workflow ${jobId} failed:`, error);
        
        // Update job status to failed
        await WorkflowJob.findOneAndUpdate(
          { jobId },
          { 
            status: 'failed',
            error: error.message,
            completedAt: new Date()
          }
        );

        // Refund credits on failure
        await user.refundCredits(
          requiredCredits,
          `Workflow failed: ${workflowType}`,
          jobId
        );

        // Emit error to user
        if (io) {
          io.to(userId).emit('workflow-error', {
            jobId,
            message: 'Processing failed. Credits have been refunded.'
          });
        }
      });

    res.status(202).json({
      message: 'Workflow started successfully',
      jobId,
      status: 'processing',
      creditsUsed: requiredCredits,
      creditsRemaining: user.creditsRemaining - requiredCredits
    });

  } catch (error) {
    console.error('Error starting workflow:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * @desc    Get workflow job status
 * @route   GET /api/workflow/status/:jobId
 * @access  Private
 */
export const getWorkflowStatus = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        message: 'Validation errors', 
        errors: errors.array() 
      });
    }

    if (!req.user) {
      return res.status(401).json({ message: 'User not authenticated' });
    }

    const { jobId } = req.params;
    const userId = req.user.id;

    const job = await WorkflowJob.findOne({ jobId, userId });
    if (!job) {
      return res.status(404).json({ message: 'Workflow job not found' });
    }

    res.json({
      jobId: job.jobId,
      status: job.status,
      progress: job.progress,
      workflowType: job.workflowType,
      creditsUsed: job.creditsUsed,
      createdAt: job.createdAt,
      completedAt: job.completedAt,
      error: job.error
    });

  } catch (error) {
    console.error('Error getting workflow status:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * @desc    Get workflow results
 * @route   GET /api/workflow/results/:jobId
 * @access  Private
 */
export const getWorkflowResults = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        message: 'Validation errors', 
        errors: errors.array() 
      });
    }

    if (!req.user) {
      return res.status(401).json({ message: 'User not authenticated' });
    }

    const { jobId } = req.params;
    const userId = req.user.id;

    const job = await WorkflowJob.findOne({ jobId, userId });
    if (!job) {
      return res.status(404).json({ message: 'Workflow job not found' });
    }

    if (job.status !== 'completed') {
      return res.status(400).json({ 
        message: 'Workflow not completed yet',
        status: job.status,
        progress: job.progress
      });
    }

    res.json({
      jobId: job.jobId,
      workflowType: job.workflowType,
      status: job.status,
      processedImages: job.results?.processedImages || {},
      platformExports: job.results?.platformExports || {},
      completedAt: job.completedAt,
      processingTime: job.completedAt && job.createdAt 
        ? Math.round((job.completedAt.getTime() - job.createdAt.getTime()) / 1000)
        : null
    });

  } catch (error) {
    console.error('Error getting workflow results:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * @desc    Download workflow results as ZIP or individual files
 * @route   GET /api/workflow/download/:jobId
 * @access  Private
 */
export const downloadResults = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        message: 'Validation errors', 
        errors: errors.array() 
      });
    }

    if (!req.user) {
      return res.status(401).json({ message: 'User not authenticated' });
    }

    const { jobId } = req.params;
    const { format = 'zip' } = req.query;
    const userId = req.user.id;

    const job = await WorkflowJob.findOne({ jobId, userId });
    if (!job) {
      return res.status(404).json({ message: 'Workflow job not found' });
    }

    if (job.status !== 'completed' || !job.results) {
      return res.status(400).json({ 
        message: 'Workflow results not available',
        status: job.status
      });
    }

    if (format === 'zip') {
      // Create ZIP archive
      const archive = archiver('zip', {
        zlib: { level: 9 }
      });

      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="product-photos-${jobId}.zip"`);

      archive.pipe(res);

      // Add all processed images to ZIP
      const allImages = {
        ...job.results.processedImages,
        ...job.results.platformExports
      };

      for (const [name, url] of Object.entries(allImages)) {
        if (typeof url === 'string') {
          try {
            // If it's an S3 URL, we'd need to download and stream it
            // For now, just add the URL as a text file
            archive.append(url, { name: `${name}.txt` });
          } catch (error) {
            console.error(`Error adding ${name} to ZIP:`, error);
          }
        }
      }

      await archive.finalize();

    } else {
      // Return JSON with download URLs
      res.json({
        jobId: job.jobId,
        downloadUrls: {
          ...job.results.processedImages,
          ...job.results.platformExports
        }
      });
    }

  } catch (error) {
    console.error('Error downloading workflow results:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * @desc    Get user's workflow history
 * @route   GET /api/workflow/history
 * @access  Private
 */
export const getWorkflowHistory = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        message: 'Validation errors', 
        errors: errors.array() 
      });
    }

    if (!req.user) {
      return res.status(401).json({ message: 'User not authenticated' });
    }

    const { page = 1, limit = 20, workflowType } = req.query;
    const userId = req.user.id;

    const query: any = { userId };
    if (workflowType) {
      query.workflowType = workflowType;
    }

    const skip = (Number(page) - 1) * Number(limit);
    
    const [jobs, total] = await Promise.all([
      WorkflowJob.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .select('-results'), // Exclude large results data
      WorkflowJob.countDocuments(query)
    ]);

    res.json({
      jobs,
      pagination: {
        currentPage: Number(page),
        totalPages: Math.ceil(total / Number(limit)),
        totalJobs: total,
        hasNext: skip + jobs.length < total,
        hasPrev: Number(page) > 1
      }
    });

  } catch (error) {
    console.error('Error getting workflow history:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * @desc    Delete workflow job and results
 * @route   DELETE /api/workflow/:jobId
 * @access  Private
 */
export const deleteWorkflow = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        message: 'Validation errors', 
        errors: errors.array() 
      });
    }

    if (!req.user) {
      return res.status(401).json({ message: 'User not authenticated' });
    }

    const { jobId } = req.params;
    const userId = req.user.id;

    const job = await WorkflowJob.findOneAndDelete({ jobId, userId });
    if (!job) {
      return res.status(404).json({ message: 'Workflow job not found' });
    }

    // TODO: Delete files from S3 storage here
    // await deleteS3Files(job.inputImageKey, job.results?.fileKeys || []);

    res.json({ message: 'Workflow deleted successfully' });

  } catch (error) {
    console.error('Error deleting workflow:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * @desc    Retry failed workflow
 * @route   POST /api/workflow/:jobId/retry
 * @access  Private
 */
export const retryWorkflow = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        message: 'Validation errors', 
        errors: errors.array() 
      });
    }

    if (!req.user) {
      return res.status(401).json({ message: 'User not authenticated' });
    }

    const { jobId } = req.params;
    const userId = req.user.id;

    const job = await WorkflowJob.findOne({ jobId, userId });
    if (!job) {
      return res.status(404).json({ message: 'Workflow job not found' });
    }

    if (job.status !== 'failed') {
      return res.status(400).json({ 
        message: 'Can only retry failed workflows',
        status: job.status
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const requiredCredits = WORKFLOW_COSTS[job.workflowType as keyof typeof WORKFLOW_COSTS];

    if (!user.hasEnoughCredits(requiredCredits)) {
      return res.status(400).json({ 
        message: 'Insufficient credits for retry',
        required: requiredCredits,
        available: user.creditsRemaining
      });
    }

    // Reset job status
    job.status = JobStatus.PROCESSING;
    job.progress = 0;
    job.error = undefined;
    job.results = undefined;
    job.completedAt = undefined;
    await job.save();

    // Deduct credits for retry
    await user.deductCredits(
      requiredCredits,
      `Workflow retry: ${job.workflowType}`,
      jobId
    );

    // Get Socket.IO instance
    const io = req.app.get('io');

    // Restart processing
    processWorkflow(jobId, job.workflowType, job.inputImageUrl, io)
      .catch(async (error) => {
        console.error(`Workflow retry ${jobId} failed:`, error);
        
        await WorkflowJob.findOneAndUpdate(
          { jobId },
          { 
            status: 'failed',
            error: error.message,
            completedAt: new Date()
          }
        );

        await user.refundCredits(
          requiredCredits,
          `Workflow retry failed: ${job.workflowType}`,
          jobId
        );

        if (io) {
          io.to(userId).emit('workflow-error', {
            jobId,
            message: 'Retry failed. Credits have been refunded.'
          });
        }
      });

    res.json({
      message: 'Workflow retry started',
      jobId,
      status: 'processing',
      creditsUsed: requiredCredits
    });

  } catch (error) {
    console.error('Error retrying workflow:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * @desc    Get user's credit information
 * @route   GET /api/workflow/credits
 * @access  Private
 */
export const getUserCredits = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'User not authenticated' });
    }

    const userId = req.user.id;
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Check if monthly credits need to be reset
    await user.resetMonthlyCredits();

    res.json({
      creditsRemaining: user.creditsRemaining,
      creditsTotal: user.creditsTotal,
      subscription: user.subscription,
      workflowStats: user.workflowStats,
      recentTransactions: user.creditTransactions
        .sort((a, b) => b.date.getTime() - a.date.getTime())
        .slice(0, 10) // Last 10 transactions
    });

  } catch (error) {
    console.error('Error getting user credits:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * @desc    Add credits to user account (testing/admin only)
 * @route   POST /api/workflow/credits/add
 * @access  Private
 */
export const addCredits = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        message: 'Validation errors', 
        errors: errors.array() 
      });
    }

    if (!req.user) {
      return res.status(401).json({ message: 'User not authenticated' });
    }

    // Only allow in development or for admin users
    if (process.env.NODE_ENV === 'production' && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized to add credits' });
    }

    const { credits } = req.body;
    const userId = req.user.id;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    await user.addCredits(credits, 'Manual credit addition (testing)');

    res.json({
      message: 'Credits added successfully',
      creditsAdded: credits,
      creditsRemaining: user.creditsRemaining,
      creditsTotal: user.creditsTotal
    });

  } catch (error) {
    console.error('Error adding credits:', error);
    res.status(500).json({ message: 'Server error' });
  }
};