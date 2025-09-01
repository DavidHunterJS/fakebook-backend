// src/sockets/workflow.socket.ts
import { Server, Socket } from 'socket.io';
import WorkflowJob from '../models/WorkflowJob';
import User from '../models/User';
import { IUser } from '../types/user.types';

interface CustomSocket extends Socket {
  user?: IUser;
}

/**
 * Workflow-specific Socket.IO event handlers
 * Add these to your existing socket.ts file
 */
export const handleWorkflowEvents = (io: Server, socket: CustomSocket) => {
  if (!socket.user) {
    console.log('Workflow events require authenticated user');
    return;
  }

  const user = socket.user;
  const userId = user.id.toString();
  
  console.log(`Setting up workflow events for user: ${user.username} (${userId})`);

  /**
   * Join a workflow room for real-time updates
   */
  socket.on('join-workflow', async (data: { jobId: string; userId: string }) => {
    try {
      const { jobId, userId: requestUserId } = data;
      
      // Verify the user owns this workflow job
      if (requestUserId !== userId) {
        socket.emit('workflow-error', {
          jobId,
          message: 'Not authorized to access this workflow'
        });
        return;
      }

      const job = await WorkflowJob.findOne({ jobId, userId });
      if (!job) {
        socket.emit('workflow-error', {
          jobId,
          message: 'Workflow job not found'
        });
        return;
      }

      // Join the workflow room
      const roomName = `workflow-${jobId}`;
      socket.join(roomName);
      
      console.log(`User ${user.username} joined workflow room: ${roomName}`);
      
      // Send current status
      socket.emit('workflow-status', {
        jobId: job.jobId,
        status: job.status,
        progress: job.progress,
        currentStep: job.currentStep,
        workflowType: job.workflowType,
        createdAt: job.createdAt,
        completedAt: job.completedAt,
        error: job.error
      });

      // If job is completed, send results immediately
      if (job.status === 'completed' && job.results) {
        socket.emit('workflow-complete', {
          jobId: job.jobId,
          processedImages: job.results.processedImages,
          platformExports: job.results.platformExports,
          processingTime: job.processingTimeSeconds
        });
      }

    } catch (error) {
      console.error('Error joining workflow room:', error);
      socket.emit('workflow-error', {
        jobId: data.jobId,
        message: 'Failed to join workflow updates'
      });
    }
  });

  /**
   * Leave workflow room
   */
  socket.on('leave-workflow', (data: { jobId: string }) => {
    try {
      const { jobId } = data;
      const roomName = `workflow-${jobId}`;
      
      socket.leave(roomName);
      console.log(`User ${user.username} left workflow room: ${roomName}`);
      
      socket.emit('left-workflow', { jobId });
      
    } catch (error) {
      console.error('Error leaving workflow room:', error);
    }
  });

  /**
   * Get workflow status on demand
   */
  socket.on('get-workflow-status', async (data: { jobId: string }) => {
    try {
      const { jobId } = data;
      
      const job = await WorkflowJob.findOne({ jobId, userId });
      if (!job) {
        socket.emit('workflow-error', {
          jobId,
          message: 'Workflow job not found'
        });
        return;
      }

      socket.emit('workflow-status', {
        jobId: job.jobId,
        status: job.status,
        progress: job.progress,
        currentStep: job.currentStep,
        workflowType: job.workflowType,
        stepProgress: Object.fromEntries(job.stepProgress),
        createdAt: job.createdAt,
        completedAt: job.completedAt,
        error: job.error,
        retryCount: job.retryCount,
        canRetry: job.canRetry
      });

    } catch (error) {
      console.error('Error getting workflow status:', error);
      socket.emit('workflow-error', {
        jobId: data.jobId,
        message: 'Failed to get workflow status'
      });
    }
  });

  /**
   * Cancel a running workflow
   */
  socket.on('cancel-workflow', async (data: { jobId: string }) => {
    try {
      const { jobId } = data;
      
      const job = await WorkflowJob.findOne({ jobId, userId });
      if (!job) {
        socket.emit('workflow-error', {
          jobId,
          message: 'Workflow job not found'
        });
        return;
      }

      if (job.status !== 'processing') {
        socket.emit('workflow-error', {
          jobId,
          message: 'Can only cancel processing workflows'
        });
        return;
      }

      // Cancel the job
      await job.cancel();
      
      // Refund credits
      const userToRefund = await User.findById(userId);
      if (userToRefund) {
        await userToRefund.refundCredits(
          job.creditsUsed,
          'Workflow cancelled by user',
          jobId
        );
      }

      // Notify user
      socket.emit('workflow-cancelled', {
        jobId,
        creditsRefunded: job.creditsUsed,
        message: 'Workflow cancelled successfully'
      });

      // Notify workflow room
      io.to(`workflow-${jobId}`).emit('workflow-cancelled', {
        jobId,
        message: 'Workflow was cancelled'
      });

      console.log(`Workflow ${jobId} cancelled by user ${user.username}`);

    } catch (error) {
      console.error('Error cancelling workflow:', error);
      socket.emit('workflow-error', {
        jobId: data.jobId,
        message: 'Failed to cancel workflow'
      });
    }
  });

  /**
   * Get user's workflow history
   */
  socket.on('get-workflow-history', async (data: { 
    page?: number; 
    limit?: number; 
    workflowType?: string;
    status?: string;
  }) => {
    try {
      const { 
        page = 1, 
        limit = 20, 
        workflowType, 
        status 
      } = data;

      const query: any = { userId };
      
      if (workflowType) {
        query.workflowType = workflowType;
      }
      
      if (status) {
        query.status = status;
      }

      const skip = (page - 1) * limit;
      
      const [jobs, total] = await Promise.all([
        WorkflowJob.find(query)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .select('-results'), // Exclude large results data
        WorkflowJob.countDocuments(query)
      ]);

      socket.emit('workflow-history', {
        jobs: jobs.map(job => ({
          jobId: job.jobId,
          workflowType: job.workflowType,
          status: job.status,
          progress: job.progress,
          creditsUsed: job.creditsUsed,
          createdAt: job.createdAt,
          completedAt: job.completedAt,
          processingTime: job.processingTimeSeconds,
          error: job.error,
          canRetry: job.canRetry,
          metadata: {
            originalFilename: job.metadata.originalFilename,
            fileSize: job.metadata.fileSize
          }
        })),
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(total / limit),
          totalJobs: total,
          hasNext: skip + jobs.length < total,
          hasPrev: page > 1
        }
      });

    } catch (error) {
      console.error('Error getting workflow history:', error);
      socket.emit('workflow-error', {
        message: 'Failed to get workflow history'
      });
    }
  });

  /**
   * Get user's credit information
   */
  socket.on('get-credits-info', async () => {
    try {
      const user = await User.findById(userId);
      if (!user) {
        socket.emit('workflow-error', {
          message: 'User not found'
        });
        return;
      }

      // Check if monthly credits need reset
      await user.resetMonthlyCredits();

      socket.emit('credits-info', {
        creditsRemaining: user.creditsRemaining,
        creditsTotal: user.creditsTotal,
        subscription: {
          plan: user.subscription.plan,
          creditsPerMonth: user.subscription.creditsPerMonth,
          resetDate: user.subscription.resetDate
        },
        workflowStats: user.workflowStats,
        recentTransactions: user.creditTransactions
          .sort((a, b) => b.date.getTime() - a.date.getTime())
          .slice(0, 10)
      });

    } catch (error) {
      console.error('Error getting credits info:', error);
      socket.emit('workflow-error', {
        message: 'Failed to get credits information'
      });
    }
  });

  /**
   * Get workflow analytics/stats
   */
  socket.on('get-workflow-stats', async () => {
    try {
      const stats = await WorkflowJob.getUserStats(userId);
      
      socket.emit('workflow-stats', {
        totalJobs: stats.totalJobs,
        completedJobs: stats.completedJobs,
        failedJobs: stats.failedJobs,
        processingJobs: stats.processingJobs,
        totalCreditsUsed: stats.totalCreditsUsed,
        avgProcessingTime: stats.avgProcessingTime,
        successRate: stats.totalJobs > 0 
          ? Math.round((stats.completedJobs / stats.totalJobs) * 100) 
          : 0
      });

    } catch (error) {
      console.error('Error getting workflow stats:', error);
      socket.emit('workflow-error', {
        message: 'Failed to get workflow statistics'
      });
    }
  });

  /**
   * Handle disconnection - cleanup workflow rooms
   */
  socket.on('disconnect', () => {
    console.log(`User ${user.username} disconnected from workflow events`);
    // Socket.IO automatically handles room cleanup on disconnect
  });
};

/**
 * Utility functions to emit workflow updates from the service layer
 */
export const emitWorkflowProgress = (
  io: Server, 
  userId: string, 
  jobId: string, 
  step: number, 
  progress: number, 
  message: string
) => {
  io.to(userId).emit('workflow-progress', {
    jobId,
    step,
    progress,
    message,
    timestamp: new Date()
  });

  // Also emit to workflow room
  io.to(`workflow-${jobId}`).emit('workflow-progress', {
    jobId,
    step,
    progress,
    message,
    timestamp: new Date()
  });
};

export const emitWorkflowComplete = (
  io: Server,
  userId: string,
  jobId: string,
  results: any
) => {
  const completeData = {
    jobId,
    processedImages: results.processedImages,
    platformExports: results.platformExports,
    processingTime: results.processingTime,
    timestamp: new Date()
  };

  io.to(userId).emit('workflow-complete', completeData);
  io.to(`workflow-${jobId}`).emit('workflow-complete', completeData);
};

export const emitWorkflowError = (
  io: Server,
  userId: string,
  jobId: string,
  message: string
) => {
  const errorData = {
    jobId,
    message,
    timestamp: new Date()
  };

  io.to(userId).emit('workflow-error', errorData);
  io.to(`workflow-${jobId}`).emit('workflow-error', errorData);
};

export const emitCreditsUpdate = (
  io: Server,
  userId: string,
  creditsRemaining: number,
  creditsUsed: number,
  reason: string
) => {
  io.to(userId).emit('credits-updated', {
    creditsRemaining,
    creditsUsed,
    reason,
    timestamp: new Date()
  });
};