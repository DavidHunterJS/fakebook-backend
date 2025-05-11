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
const server = http.createServer(app);

const clientUrl = process.env.CLIENT_URL || 'http://localhost:3000';

const io = new SocketIOServer(server, {
  cors: {
    origin: clientUrl,
    methods: ['GET', 'POST']
  }
});

// Connect to Database
connectDB();

// Init Middleware
app.use(express.json());
app.use(cors({
  origin: clientUrl,
  credentials: true
}));

// --- Static File Serving ---
// This path should resolve to /home/lazer/repos/fakebook/backend/uploads/
// This assumes your compiled server.js is one level inside the 'backend' folder
// (e.g., in backend/dist/ or backend/src/ if running ts-node from backend/)
// and your 'uploads' folder is also a direct child of 'backend'.
const staticUploadsPath = path.join(__dirname, '../uploads');
console.log('Express will serve static files for /uploads from absolute path:', staticUploadsPath); // This log uses the correct variable
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

// Socket.io connection
socketHandler(io);

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

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  // --- CORRECTED LOG ---
  // This log now uses the same path variable as express.static for clarity and accuracy
  console.log('Confirmed static /uploads serving from:', staticUploadsPath);
  // ---------------------
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err: Error) => {
  console.log('Unhandled Rejection:', err.message);
  server.close(() => process.exit(1));
});