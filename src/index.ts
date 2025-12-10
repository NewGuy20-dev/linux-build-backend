import 'dotenv/config';
import express from 'express';
import http from 'http';
import cors from 'cors';
import helmet from 'helmet';
import { initWebSocketServer } from './ws/websocket';
import buildRoutes from './api/build.routes';
import { startArtifactCleanupJob } from './utils/artifactCleanup';
import { errorHandler } from './middleware/errorHandler';

const app = express();
const server = http.createServer(app);

// Security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
    },
  },
  crossOriginEmbedderPolicy: false, // Allow embedding if needed
}));

// CORS configuration - restrict to allowed origins
const getAllowedOrigins = (): string[] | boolean => {
  const origins = process.env.ALLOWED_ORIGINS;
  if (!origins) {
    if (process.env.NODE_ENV === 'development') {
      return ['http://localhost:3000', 'http://localhost:3001', 'http://127.0.0.1:3000'];
    }
    return false;
  }
  return origins.split(',').map(o => o.trim());
};

app.use(cors({
  origin: getAllowedOrigins(),
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true,
}));

app.use((req, _res, next) => {
  const forwardedFor = req.headers['x-forwarded-for'];
  const sourceIp = Array.isArray(forwardedFor)
    ? forwardedFor[0]
    : forwardedFor ?? req.socket.remoteAddress;
  console.log(`[HTTP] ${new Date().toISOString()} ${req.method} ${req.originalUrl} from ${sourceIp}`);
  next();
});

app.use(express.json());
app.use('/api', buildRoutes);

// Global error handler - must be after routes
app.use(errorHandler);

initWebSocketServer(server);

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';

server.listen(PORT, HOST, () => {
  console.log(`Server is running on http://${HOST}:${PORT}`);
  startArtifactCleanupJob();
});
