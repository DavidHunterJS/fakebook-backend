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
// ... etc.

dotenv.config();

// --- DIAGNOSTIC LOGGING ---
// This will print the exact values from your Heroku environment to the logs at startup.
console.log('--- [SERVER STARTUP DIAGNOSTICS] ---');
console.log(`NODE_ENV: ${process.env.NODE_ENV}`);
console.log(`COOKIE_DOMAIN from env: ${process.env.COOKIE_DOMAIN}`);
console.log(`ALLOWED_ORIGINS from env: ${process.env.ALLOWED_ORIGINS}`);
console.log('------------------------------------');

const app = express();
const isProduction = process.env.NODE_ENV === 'production';

// Trust the proxy in production (Heroku)
if (isProduction) {
  app.set('trust proxy', 1);
}

// --- Robust CORS Configuration ---
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['http://localhost:3000'];

const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    // This log is crucial for debugging.
    console.log(`[CORS] Incoming request from origin: ${origin}`);
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.error(`[CORS] Blocked a request from origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
};

app.use(cors(corsOptions));

// Body parser
app.use(express.json());

// Session Middleware
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

// Passport Middleware
app.use(passport.initialize());
app.use(passport.session());

// --- API ROUTES ---
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
// ... (register all your other routes)

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
const io = new SocketIOServer(server, { cors: corsOptions });

const wrap = (middleware: any) => (socket: any, next: any) => middleware(socket.request, {}, next);
io.use(wrap(sessionMiddleware));
io.use(wrap(passport.initialize()));
io.use(wrap(passport.session()));

io.use((socket, next) => {
  const req = socket.request as Request;
  if (req.user) {
    next();
  } else {
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

