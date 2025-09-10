import express, { Request, Response, NextFunction } from 'express';
import connectDB from './config/db';
import cors from 'cors';
import path from 'path';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import dotenv from 'dotenv';
import socketHandler from './sockets/socket';
import session from 'express-session';
import passport from './config/passport';

// Load env vars
dotenv.config();

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

// Session middleware
const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET || 'your-session-secret-here',
  resave: false,
  saveUninitialized: false,
  cookie: {
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000,
    httpOnly: true
  }
});

const app = express();

if (process.env.NODE_ENV !== 'test') {
  connectDB();
}

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['http://localhost:3000'];

// --- Middleware Setup ---
app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json());

// Request logger for debugging
app.use((req: Request, res: Response, next: NextFunction) => {
  console.log(`[REQUEST LOGGER] Incoming: ${req.method} ${req.originalUrl}`);
  next();
});

app.use(sessionMiddleware);
app.use(passport.initialize());
app.use(passport.session());

// --- Static Files & Health Check ---
const staticUploadsPath = path.join(__dirname, '../uploads');
app.use('/uploads', express.static(staticUploadsPath));
app.get('/health', (req, res) => res.status(200).send('OK'));
app.get('/', (req, res) => res.json({ message: 'API is running' }));

if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

// --- API ROUTES ---
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


// --- 404 and Error Handlers ---
app.use('*', (req, res) => {
  res.status(404).json({ message: 'Route not found', path: req.originalUrl });
});

app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Server Error', error: err.message });
});

// --- Server and Socket.IO Setup ---
const server = http.createServer(app);
const io = new SocketIOServer(server, { cors: { origin: allowedOrigins, credentials: true } });
app.set('io', io);

// Attach session and passport middleware to Socket.IO
io.use((socket, next) => sessionMiddleware(socket.request as Request, {} as Response, next as NextFunction));
io.use((socket, next) => passport.initialize()(socket.request as Request, {} as Response, next as NextFunction));
io.use((socket, next) => passport.session()(socket.request as Request, {} as Response, next as NextFunction));
io.use((socket, next) => {
    const req = socket.request as Request;
    if (req.user) {
        (socket as any).user = req.user;
        next();
    } else {
        next(new Error('unauthorized'));
    }
});
socketHandler(io);


// --- Server Start ---
if (require.main === module) {
  const PORT = process.env.PORT || 5000;
  server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  process.on('unhandledRejection', (err: Error) => {
    console.log('Unhandled Rejection:', err.message);
    server.close(() => process.exit(1));
  });
}

export default app;

