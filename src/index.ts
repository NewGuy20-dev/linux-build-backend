import 'dotenv/config';
import express from 'express';
import http from 'http';
import { initWebSocketServer } from './ws/websocket';
import buildRoutes from './api/build.routes';

const app = express();
const server = http.createServer(app);

app.use(express.json());
app.use('/api', buildRoutes);

initWebSocketServer(server);

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
