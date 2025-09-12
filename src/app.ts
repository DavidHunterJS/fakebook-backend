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

// Import all your route files
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
import uploadRoutes from './routes/upload.routes';
import followRoutes from './routes/follow.routes';
import conversationRoutes from './routes/conversation.routes';
import messageRoutes from './routes/message.routes';
import chatUploadRoutes from './routes/chatUploads.routes';
import workflowRoutes from './routes/workflow.routes';

dotenv.config();

const app = express();
const isProduction = process.env.NODE_ENV === 'production';

if (isProduction) {
  app.set('trust proxy', 1);
}

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['http://localhost:3000'];

const corsOptions: cors.CorsOptions = {
  origin: allowedOrigins,
  credentials: true,
};

app.use(cors(corsOptions));
app.use(express.json());

const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET || 'a-very-strong-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    maxAge: 24 * 60 * 60 * 1000,
    httpOnly: true,
    domain: isProduction ? process.env.COOKIE_DOMAIN : undefined,
  }
});

app.use(sessionMiddleware);
app.use(passport.initialize());
app.use(passport.session());

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
app.use('/api', imagegenRouter);
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

// ✅ --- THIS IS THE FINAL FIX ---
const io = new SocketIOServer(server, {
  cors: corsOptions,
  // This explicitly tells Socket.IO to use the same paths as a standard Express app,
  // which is required for compatibility with Heroku's router.
  path: '/socket.io/',
});
// --- END OF FIX ---

const wrap = (middleware: any) => (socket: any, next: any) => middleware(socket.request, {}, next);
io.use(wrap(sessionMiddleware));
io.use(wrap(passport.initialize()));
io.use(wrap(passport.session()));

io.use((socket, next) => {
  const req = socket.request as any;
  if (req.user) {
    next();
  } else {
    console.error('[SOCKET AUTH] Authentication FAILED: No user on request object.');
    next(new Error('unauthorized'));
  }
});

socketHandler(io);

// --- Server Start ---
if (process.env.NODE_ENV !== 'test') {
  connectDB();
}

if (require.main === module) {
  const PORT = process.env.PORT || 5000;
  server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}

export default app;

