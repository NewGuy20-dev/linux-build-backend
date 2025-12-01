import 'dotenv/config';
import express from 'express';
import http from 'http';
import cors from 'cors';
import { initWebSocketServer } from './ws/websocket';
import buildRoutes from './api/build.routes';

const app = express();
const server = http.createServer(app);

// CORS - allow frontend origins
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
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

initWebSocketServer(server);

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';

server.listen(PORT, HOST, () => {
  console.log(`Server is running on http://${HOST}:${PORT}`);
});
