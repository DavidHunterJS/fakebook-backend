// src/config/enums.ts

export enum JobStatus {
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  PENDING = 'pending',
}

export enum WorkflowType {
  PRODUCT_ENHANCEMENT = 'product_enhancement',
  LIFESTYLE_SCENES = 'lifestyle_scenes',
  PRODUCT_VARIANTS = 'product_variants',
}