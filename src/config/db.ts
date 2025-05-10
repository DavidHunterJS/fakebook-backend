// src/config/db.ts
import mongoose from 'mongoose';

const connectDB = async (): Promise<void> => {
  try {
    const mongoURI = process.env.MONGODB_URI;
    
    if (!mongoURI) {
      throw new Error('MongoDB connection string is not defined');
    }
    
    await mongoose.connect(mongoURI);
    
    console.log('MongoDB Connected');
  } catch (err) {
    console.error('MongoDB connection error:', (err as Error).message);
    // Exit process with failure
    process.exit(1);
  }
};

export default connectDB;