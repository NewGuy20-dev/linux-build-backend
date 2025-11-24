import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';

interface CustomWebSocket extends WebSocket {
  buildId?: string;
}

let wss: WebSocketServer;

export const initWebSocketServer = (server: Server) => {
  wss = new WebSocketServer({ server });

  wss.on('connection', (ws: CustomWebSocket, req) => {
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const buildId = url.searchParams.get('buildId');

    if (buildId) {
      ws.buildId = buildId;
      console.log(`Client connected for build ${buildId}`);
    } else {
      console.log('Client connected without buildId');
    }

    ws.on('close', () => console.log('Client disconnected'));
  });
};

export const broadcast = (buildId: string, message: string) => {
  if (wss) {
    wss.clients.forEach((client: WebSocket) => {
      const customClient = client as CustomWebSocket;
      if (customClient.readyState === WebSocket.OPEN && customClient.buildId === buildId) {
        customClient.send(JSON.stringify({ buildId, message }));
      }
    });
  }
};
