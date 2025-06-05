// src/server.ts
import express, { Request, Response, NextFunction } from 'express';
import connectDB from './config/db';
import cors from 'cors';
import path from 'path';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import dotenv from 'dotenv';
import socketHandler from './sockets/socket';

// Import routes
import authRoutes from './routes/auth.routes';
import userRoutes from './routes/user.routes';
import postRoutes from './routes/post.routes';
import commentRoutes from './routes/comment.routes';
import friendRoutes from './routes/friend.routes';
import notificationRoutes from './routes/notification.routes';
import adminRoutes from './routes/admin.routes';

// Load env vars
dotenv.config();

// Initialize express
const app = express();

// Support multiple origins
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['http://localhost:3000'];

console.log('Allowed Origins:', allowedOrigins);

// Connect to Database (only if not in test environment)
if (process.env.NODE_ENV !== 'test') {
  connectDB();
}

// Init Middleware
app.use(express.json());
app.use(cors({
  origin: allowedOrigins,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true
}));

// --- Static File Serving ---
const staticUploadsPath = path.join(__dirname, '../uploads');
console.log('Express will serve static files for /uploads from absolute path:', staticUploadsPath);
app.use('/uploads', express.static(staticUploadsPath));
// ---------------------------

// Root route handler
app.get('/', (req: Request, res: Response) => {
  res.json({ message: 'Fakebook API is running' });
});

// Define API Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/comments', commentRoutes);
app.use('/api/friends', friendRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/admin', adminRoutes);

// Catch-all route handler (must be placed after all other routes)
app.use('*', (req: Request, res: Response) => {
  res.status(404).json({
    message: 'Route not found',
    path: req.originalUrl
  });
});

// Error handler - Should typically be defined AFTER all routes
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error(err.stack);
  if (req.originalUrl.startsWith('/api/')) {
    return res.status(500).json({ message: 'Server Error', error: err.message });
  }
  res.status(500).send('Server Error');
});

// Create server and Socket.IO setup
const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Socket.io connection
socketHandler(io);

// Only start server if this file is run directly (not imported)
if (require.main === module) {
  const PORT = process.env.PORT || 5000;
  
  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log('Confirmed static /uploads serving from:', staticUploadsPath);
  });

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (err: Error) => {
    console.log('Unhandled Rejection:', err.message);
    server.close(() => process.exit(1));
  });
}

// Export for testing
export { app, server, io };
export default app;