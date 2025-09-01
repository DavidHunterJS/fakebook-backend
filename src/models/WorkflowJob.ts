// src/models/WorkflowJob.ts
import mongoose, { Schema, Model } from 'mongoose';

export interface IWorkflowJobResults {
  processedImages: {
    // Product Enhancement workflow results
    white?: string;
    transparent?: string;
    gradient?: string;
    lifestyle?: string;
    branded?: string;
    
    // Lifestyle Scenes workflow results
    home?: string;
    social?: string;
    outdoor?: string;
    professional?: string;
    seasonal?: string;
    
    // Product Variants workflow results
    front?: string;
    back?: string;
    side?: string;
    top?: string;
    detail?: string;
    
    // Allow any additional keys for flexibility
    [key: string]: string | undefined;
  };
  platformExports: {
    [key: string]: string; // platform_background combination
  };
  fileKeys?: string[]; // S3 file keys for cleanup
}

export interface WorkflowJobMetadata {
  originalFilename: string;
  fileSize: number;
  mimeType: string;
  dimensions?: {
    width: number;
    height: number;
  };
  processingOptions?: {
    [key: string]: any;
  };
}

export interface IWorkflowJob {
  jobId: string; // UUID
  userId: mongoose.Types.ObjectId;
  workflowType: 'product_enhancement' | 'lifestyle_scenes' | 'product_variants';
  status: 'processing' | 'completed' | 'failed' | 'cancelled';
  progress: number; // 0-100
  
  // Input data
  inputImageUrl: string; // S3 URL
  inputImageKey: string; // S3 key for cleanup
  
  // Processing results
  results?: IWorkflowJobResults;
  
  // Credit information
  creditsUsed: number;
  
  // Error handling
  error?: string;
  retryCount: number;
  maxRetries: number;
  
  // Metadata
  metadata: WorkflowJobMetadata;
  
  // Processing steps tracking
  currentStep: string;
  stepProgress: Map<string, {
    status: 'pending' | 'processing' | 'completed' | 'failed';
    progress: number;
    startedAt?: Date;
    completedAt?: Date;
    error?: string;
  }>;
  
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  expiresAt: Date; // Auto-delete old jobs
}

// Interface for instance methods
export interface IWorkflowJobMethods {
  updateProgress(
    step: string,
    progress: number,
    stepStatus?: 'processing' | 'completed' | 'failed'
  ): Promise<void>;
  completeJob(results: IWorkflowJobResults): Promise<void>;
  failJob(error: string): Promise<void>;
  incrementRetry(): Promise<void>;
  cancel(): Promise<void>;
}

// Interface for static methods
export interface IWorkflowJobModel extends Model<IWorkflowJobDocument> {
  getActiveJobs(): Promise<IWorkflowJobDocument[]>;
  getFailedJobs(userId?: string): Promise<IWorkflowJobDocument[]>;
  getUserStats(userId: string): Promise<any>;
  cleanupExpiredJobs(): Promise<number>;
}

// Combined document interface
export interface IWorkflowJobDocument extends IWorkflowJob, IWorkflowJobMethods, mongoose.Document {
  processingTimeMs: number | null;
  processingTimeSeconds: number | null;
  canRetry: boolean;
  isExpired: boolean;
}

const WorkflowJobSchema = new Schema<IWorkflowJobDocument>(
  {
    jobId: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    workflowType: {
      type: String,
      enum: ['product_enhancement', 'lifestyle_scenes', 'product_variants'],
      required: true,
      index: true
    },
    status: {
      type: String,
      enum: ['processing', 'completed', 'failed', 'cancelled'],
      default: 'processing',
      index: true
    },
    progress: {
      type: Number,
      min: 0,
      max: 100,
      default: 0
    },
    
    // Input data
    inputImageUrl: {
      type: String,
      required: true
    },
    inputImageKey: {
      type: String,
      required: true
    },
    
    // Processing results
    results: {
      processedImages: {
        // Product Enhancement
        white: String,
        transparent: String,
        gradient: String,
        lifestyle: String,
        branded: String,
        
        // Lifestyle Scenes
        home: String,
        social: String,
        outdoor: String,
        professional: String,
        seasonal: String,
        
        // Product Variants
        front: String,
        back: String,
        side: String,
        top: String,
        detail: String,
        
        // Allow additional dynamic fields
        type: Schema.Types.Mixed
      },
      platformExports: {
        type: Schema.Types.Mixed // Allow flexible key-value pairs
      },
      fileKeys: [String]
    },
    
    // Credit information
    creditsUsed: {
      type: Number,
      required: true,
      min: 0
    },
    
    // Error handling
    error: String,
    retryCount: {
      type: Number,
      default: 0,
      min: 0
    },
    maxRetries: {
      type: Number,
      default: 3,
      min: 0
    },
    
    // Metadata
    metadata: {
      originalFilename: {
        type: String,
        required: true
      },
      fileSize: {
        type: Number,
        required: true
      },
      mimeType: {
        type: String,
        required: true
      },
      dimensions: {
        width: Number,
        height: Number
      },
      processingOptions: {
        type: Map,
        of: Schema.Types.Mixed
      }
    },
    
    // Processing steps tracking
    currentStep: {
      type: String,
      default: 'starting'
    },
    stepProgress: {
      type: Map,
      of: {
        status: {
          type: String,
          enum: ['pending', 'processing', 'completed', 'failed'],
          default: 'pending'
        },
        progress: {
          type: Number,
          min: 0,
          max: 100,
          default: 0
        },
        startedAt: Date,
        completedAt: Date,
        error: String
      },
      default: new Map()
    },
    
    // Timestamps
    completedAt: Date,
    expiresAt: {
      type: Date,
      default: () => {
        // Auto-delete jobs after 30 days
        const date = new Date();
        date.setDate(date.getDate() + 30);
        return date;
      },
      index: { expireAfterSeconds: 0 }
    }
  },
  { 
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Compound indexes for efficient queries
WorkflowJobSchema.index({ userId: 1, createdAt: -1 }); // User's job history
WorkflowJobSchema.index({ status: 1, createdAt: -1 }); // Status-based queries
WorkflowJobSchema.index({ workflowType: 1, status: 1 }); // Type and status filtering
WorkflowJobSchema.index({ expiresAt: 1 }); // For TTL cleanup

// Virtual for processing time
WorkflowJobSchema.virtual('processingTimeMs').get(function() {
  if (this.completedAt && this.createdAt) {
    return this.completedAt.getTime() - this.createdAt.getTime();
  }
  return null;
});

WorkflowJobSchema.virtual('processingTimeSeconds').get(function() {
  const timeMs = this.get('processingTimeMs');
  return timeMs ? Math.round(timeMs / 1000) : null;
});

// Virtual for checking if job can be retried
WorkflowJobSchema.virtual('canRetry').get(function() {
  return this.status === 'failed' && this.retryCount < this.maxRetries;
});

// Virtual for checking if job is expired
WorkflowJobSchema.virtual('isExpired').get(function() {
  return new Date() > this.expiresAt;
});

// Instance methods
WorkflowJobSchema.methods.updateProgress = async function(
  step: string,
  progress: number,
  stepStatus: 'processing' | 'completed' | 'failed' = 'processing'
) {
  this.currentStep = step;
  this.progress = progress;
  
  // Update step progress
  const stepData = this.stepProgress.get(step) || {
    status: 'pending',
    progress: 0
  };
  
  if (!stepData.startedAt && stepStatus === 'processing') {
    stepData.startedAt = new Date();
  }
  
  stepData.status = stepStatus;
  stepData.progress = progress;
  
  if (stepStatus === 'completed' || stepStatus === 'failed') {
    stepData.completedAt = new Date();
  }
  
  this.stepProgress.set(step, stepData);
  await this.save();
};

WorkflowJobSchema.methods.completeJob = async function(results: IWorkflowJobResults) {
  this.status = 'completed';
  this.progress = 100;
  this.results = results;
  this.completedAt = new Date();
  await this.save();
};

WorkflowJobSchema.methods.failJob = async function(error: string) {
  this.status = 'failed';
  this.error = error;
  this.completedAt = new Date();
  await this.save();
};

WorkflowJobSchema.methods.incrementRetry = async function() {
  this.retryCount += 1;
  this.status = 'processing';
  this.progress = 0;
  this.error = undefined;
  this.completedAt = undefined;
  this.currentStep = 'starting';
  
  // Reset all step progress
  this.stepProgress.clear();
  
  await this.save();
};

WorkflowJobSchema.methods.cancel = async function() {
  this.status = 'cancelled';
  this.completedAt = new Date();
  await this.save();
};

// Static methods
WorkflowJobSchema.statics.getActiveJobs = function() {
  return this.find({ 
    status: 'processing',
    expiresAt: { $gt: new Date() }
  });
};

WorkflowJobSchema.statics.getFailedJobs = function(userId?: string) {
  const query: any = { 
    status: 'failed',
    expiresAt: { $gt: new Date() }
  };
  
  if (userId) {
    query.userId = userId;
  }
  
  return this.find(query);
};

WorkflowJobSchema.statics.getUserStats = async function(userId: string) {
  const stats = await this.aggregate([
    { 
      $match: { 
        userId: new mongoose.Types.ObjectId(userId),
        expiresAt: { $gt: new Date() }
      }
    },
    {
      $group: {
        _id: null,
        totalJobs: { $sum: 1 },
        completedJobs: {
          $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
        },
        failedJobs: {
          $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] }
        },
        processingJobs: {
          $sum: { $cond: [{ $eq: ['$status', 'processing'] }, 1, 0] }
        },
        totalCreditsUsed: { $sum: '$creditsUsed' },
        avgProcessingTime: {
          $avg: {
            $cond: [
              { $and: ['$completedAt', '$createdAt'] },
              { 
                $divide: [
                  { $subtract: ['$completedAt', '$createdAt'] },
                  1000
                ]
              },
              null
            ]
          }
        }
      }
    }
  ]);
  
  return stats[0] || {
    totalJobs: 0,
    completedJobs: 0,
    failedJobs: 0,
    processingJobs: 0,
    totalCreditsUsed: 0,
    avgProcessingTime: null
  };
};

WorkflowJobSchema.statics.cleanupExpiredJobs = async function() {
  const expiredJobs = await this.find({
    expiresAt: { $lte: new Date() }
  });
  
  // TODO: Delete associated files from S3 here
  for (const job of expiredJobs) {
    if (job.results?.fileKeys) {
      console.log(`Would delete S3 files: ${job.results.fileKeys.join(', ')}`);
      // await deleteS3Files(job.results.fileKeys);
    }
  }
  
  const deleteResult = await this.deleteMany({
    expiresAt: { $lte: new Date() }
  });
  
  return deleteResult.deletedCount;
};

// Pre-save middleware to initialize step progress for new jobs
WorkflowJobSchema.pre('save', function(next) {
  if (this.isNew) {
    // Initialize steps based on workflow type
    const steps = getWorkflowSteps(this.workflowType);
    
    for (const step of steps) {
      this.stepProgress.set(step, {
        status: 'pending',
        progress: 0
      });
    }
  }
  
  next();
});

// Helper function to get workflow steps
function getWorkflowSteps(workflowType: string): string[] {
  switch (workflowType) {
    case 'product_enhancement':
      return ['detection', 'background_removal', 'enhancement', 'export_generation'];
    case 'lifestyle_scenes':
      return ['analysis', 'scene_generation', 'integration', 'optimization'];
    case 'product_variants':
      return ['3d_reconstruction', 'angle_generation', 'color_variation', 'style_application'];
    default:
      return ['processing'];
  }
}

const WorkflowJob = mongoose.model<IWorkflowJobDocument, IWorkflowJobModel>('WorkflowJob', WorkflowJobSchema);
export default WorkflowJob;