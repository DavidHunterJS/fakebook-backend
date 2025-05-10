// scripts/createAdmin.ts
import mongoose from 'mongoose';
import User from '../src/models/User';
import { Role, Permission } from '../src/config/roles';
import path from 'path';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Get the MongoDB URI from environment variables
const mongoUri = process.env.MONGODB_URI;

// Check if the MongoDB URI is defined
if (!mongoUri) {
  console.error('MongoDB URI is not defined in environment variables');
  process.exit(1);
}

async function createAdminUser() {
  try {
    console.log('Attempting to connect to MongoDB...');
    
    // TypeScript now knows mongoUri is not undefined here
    await mongoose.connect(process.env.MONGODB_URI as string);
    console.log('Connected to MongoDB');

    // Check if admin already exists
    const adminExists = await User.findOne({ role: Role.ADMIN });
    
    if (adminExists) {
      console.log('Admin user already exists');
      await mongoose.disconnect();
      return;
    }

    // Create admin user with appropriate role and permissions
    const adminUser = new User({
      firstName: 'Admin',
      lastName: 'User',
      username: 'admin',
      email: 'admin@example.com',
      password: 'secureAdminPassword123', // This will be hashed by the pre-save hook
      role: Role.ADMIN,
      isEmailVerified: true,
      permissions: [
        Permission.CREATE_POST,
        Permission.DELETE_POST,
        Permission.EDIT_USER,
        Permission.DELETE_USER,
        Permission.MANAGE_USERS,
        Permission.VIEW_ADMIN_DASHBOARD,
        // Add any other permissions needed
      ]
    });

    await adminUser.save();
    console.log('Admin user created successfully');
    
    await mongoose.disconnect();
  } catch (error) {
    console.error('Error creating admin user:', error);
    process.exit(1);
  }
}

createAdminUser();