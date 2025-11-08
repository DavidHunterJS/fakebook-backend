//  src/app.ts
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
import MongoStore from 'connect-mongo';

// Import all your route files
import authRoutes from './routes/auth.routes';
import userRoutes from './routes/user.routes';
// import postRoutes from './routes/post.routes';
import commentRoutes from './routes/comment.routes';
import friendRoutes from './routes/friend.routes';
import notificationRoutes from './routes/notification.routes';
import adminRoutes from './routes/admin.routes';
import generationRoutes from './routes/generation.routes';
import rewriteRoutes from './routes/rewrite.routes';
import imagegenRouter from './routes/genimgage.routes';
import uploadRoutes from './routes/upload.routes';
// import followRoutes from './routes/follow.routes';
import conversationRoutes from './routes/conversation.routes';
import messageRoutes from './routes/message.routes';
import chatUploadRoutes from './routes/chatUploads.routes';
// import workflowRoutes from './routes/workflow.routes';
import webhooksRouter from './routes/webhooks';
import subscriptionRoutes from './routes/subscriptions';
import analysisRoutes from './routes/analysis';
import fixRoutes from './routes/fix.routes'


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
  exposedHeaders: ['Set-Cookie']
};
app.options('*', cors(corsOptions));
app.use(cors(corsOptions));

// ✅ Redis setup for production
let redisClient;
let RedisStore;

if (isProduction && process.env.REDIS_URL) {
  try {
    const redis = require('redis');
    const connectRedis = require('connect-redis');
    
    redisClient = redis.createClient({
      url: process.env.REDIS_URL,
      socket: {
        connectTimeout: 5000,
        lazyConnect: true
      }
    });
    
    RedisStore = connectRedis.default ? connectRedis.default(session) : connectRedis(session);
    
    redisClient.connect().catch((err: any) => {
      console.error('Redis connection failed:', err);
      redisClient = null;
      RedisStore = null;
    });
    
  } catch (error: any) {
    console.error('Redis setup failed:', error);
    redisClient = null;
    RedisStore = null;
  }
}

// ✅ Session configuration with MongoDB fallback
const sessionMiddleware = session({
  store: (redisClient && RedisStore) 
    ? new RedisStore({ client: redisClient })
    : MongoStore.create({
        mongoUrl: process.env.MONGODB_URI!,
        ttl: 24 * 60 * 60, // 1 day in seconds
      }),
  secret: process.env.SESSION_SECRET || 'a-very-strong-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    maxAge: 24 * 60 * 60 * 1000, // 1 day in milliseconds
    httpOnly: true,
    domain: isProduction ? process.env.COOKIE_DOMAIN : undefined,
  }
});

app.use(sessionMiddleware);
app.use(passport.initialize());
app.use(passport.session());

// ✅ Debug logging middleware (comment out in production)
app.use((req, res, next) => {
  if (req.path.startsWith('/api') && process.env.NODE_ENV !== 'production') {
    console.log(`📍 ${req.method} ${req.path}`);
    if (req.isAuthenticated && req.isAuthenticated()) {
      console.log('   ✅ Authenticated:', (req.user as any)?.email || (req.user as any)?.username);
    } else {
      console.log('   ❌ Not authenticated');
    }
  }
  next();
});

// ✅ Webhook route MUST come BEFORE express.json() (for Stripe raw body)
app.use('/api/webhooks', webhooksRouter); 

// ✅ Now parse JSON for all other routes
app.use(express.json());

// --- API ROUTES ---
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
// app.use('/api/posts', postRoutes);
// app.use('/api/comments', commentRoutes);
// app.use('/api/friends', friendRoutes);
// app.use('/api/notifications', notificationRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api', generationRoutes);
app.use('/api', rewriteRoutes);
app.use('/api', imagegenRouter);
app.use('/api', analysisRoutes);
app.use('/api', fixRoutes);
app.use('/api/upload', uploadRoutes);
// app.use('/api/follows', followRoutes);
// app.use('/api/conversations', conversationRoutes);
// app.use('/api/messages', messageRoutes);
// app.use('/api/chat', chatUploadRoutes);
// app.use('/api/workflow', workflowRoutes);
app.use('/api/subscription', subscriptionRoutes); // ✅ Subscription routes

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

const io = new SocketIOServer(server, {
  cors: corsOptions,
  path: '/socket.io/',
});

// ✅ Share session with Socket.IO
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
  server.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`📍 Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:3000'}`);
  });
}

export default app;