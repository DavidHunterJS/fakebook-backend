// src/app.ts
import express, { Request, Response, NextFunction } from 'express';
import connectDB from './config/db';
import cors from 'cors';
import path from 'path';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import dotenv from 'dotenv';
import socketHandler from './sockets/socket';
import session from 'express-session';
import passport from 'passport';

// Load env vars FIRST
dotenv.config();

// Verify Google OAuth is configured
if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
  console.warn('⚠️  Google OAuth not configured. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in your .env file');
} else {
  console.log('✅ Google OAuth configured successfully');
}

// THEN import passport config (after env vars are loaded)
import './config/passport';

// Import routes
import authRoutes from './routes/auth.routes';
import userRoutes from './routes/user.routes';
import postRoutes from './routes/post.routes';
import commentRoutes from './routes/comment.routes';
import friendRoutes from './routes/friend.routes';
import notificationRoutes from './routes/notification.routes';
import adminRoutes from './routes/admin.routes';
import generationRoutes from './routes/generation.routes';
import rewriteRoutes from './routes/rewrite.routes';
import imagegenRouter from './routes/genimgage.routes';
import uploadRoutes from './routes/upload.routes'
import followRoutes from './routes/follow.routes';
import conversationRoutes from './routes/conversation.routes';
import messageRoutes from './routes/message.routes';
import chatUploadRoutes from './routes/chatUploads.routes';
import workflowRoutes from './routes/workflow.routes';


// Session middleware (required for Passport)
const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET || 'your-session-secret-here',
  resave: false,
  saveUninitialized: false,
  cookie: {
    sameSite: 'none', // Required for cross-site cookie
    secure: true,     // Required for sameSite='none'
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
});


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
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  credentials: true
}));

// Add error handling middleware for passport
app.use((error: any, req: Request, res: Response, next: NextFunction) => {
  if (error.name === 'TokenError') {
    console.error('=== OAuth Token Error ===');
    console.error('Error message:', error.message);
    console.error('Error details:', error);
    console.error('Request URL:', req.url);
    console.error('========================');
    return res.redirect('/login?error=oauth_token_error');
  }
  next(error);
});

// Apply session middleware to Express
app.use(sessionMiddleware);

// Passport middleware for Express
app.use(passport.initialize());
app.use(passport.session());


// --- Static File Serving ---
const staticUploadsPath = path.join(__dirname, '../uploads');
console.log('Express will serve static files for /uploads from absolute path:', staticUploadsPath);
app.use('/uploads', express.static(staticUploadsPath));
// ---------------------------

// --- Add this health check route ---
app.get('/health', (req: Request, res: Response) => {
  res.status(200).send('OK');
});
// ------------------------------------

// Root route handler
app.get('/', (req: Request, res: Response) => {
  res.json({ message: 'Fakebook API is running' });
});

// Google OAuth routes
app.get('/api/auth/google', 
  passport.authenticate('google', { 
    scope: ['profile', 'email'],
    accessType: 'offline',
    prompt: 'consent'
  })
);

app.get('/api/auth/google/callback',
  passport.authenticate('google', { 
    failureRedirect: '/login?error=auth_failed',
    failureFlash: false 
  }),
  (req: Request, res: Response) => {
    console.log('OAuth success! User:', {
      id: (req.user as any)?._id,
      email: (req.user as any)?.email,
      name: (req.user as any)?.firstName + ' ' + (req.user as any)?.lastName
    });
    
    // Successful authentication - redirect to frontend
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    res.redirect(`${frontendUrl}/dashboard?auth=success`);
  }
);



// Define API Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/comments', commentRoutes);
app.use('/api/friends', friendRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api', generationRoutes);
app.use('/api', rewriteRoutes);
app.use('/api', imagegenRouter );
app.use('/api/upload', uploadRoutes);
app.use('/api/follows', followRoutes);
app.use('/api/conversations', conversationRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/chat', chatUploadRoutes);
app.use('/api/workflow', workflowRoutes);

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
app.set('io', io);

// 1. Make Express session available to Socket.IO
io.use((socket, next) => {
  sessionMiddleware(socket.request as Request, {} as Response, next as NextFunction);
});

// 2. Initialize Passport for Socket.IO
io.use((socket, next) => {
  passport.initialize()(socket.request as Request, {} as Response, next as NextFunction);
});

// 3. Make Passport session available to Socket.IO
io.use((socket, next) => {
  passport.session()(socket.request as Request, {} as Response, next as NextFunction);
});

// 4. NOW you can check for the user and attach it to the socket
io.use((socket, next) => {
  const req = socket.request as Request;
  if (req.user) {
    (socket as any).user = req.user; // Attach user to the socket object
    next();
  } else {
    // Deny connection if not authenticated
    next(new Error('unauthorized'));
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