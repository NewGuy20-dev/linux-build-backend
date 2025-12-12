import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import { URL } from 'url';

let wss: WebSocketServer;

// Track authenticated clients and their subscribed builds
interface AuthenticatedClient extends WebSocket {
  isAuthenticated: boolean;
  subscribedBuilds: Set<string>;
}

// Load API keys from environment
const getApiKeys = (): Set<string> => {
  const keys = process.env.API_KEYS?.split(',').map(k => k.trim()).filter(Boolean) || [];
  return new Set(keys);
};

export interface BuildCompletePayload {
  type: 'BUILD_COMPLETE';
  buildId: string;
  status: 'SUCCESS' | 'FAILED' | 'CANCELLED';
  artifacts: {
    dockerImage?: string;
    isoDownloadUrl?: string;
    dockerTarDownloadUrl?: string;
  };
}

export const initWebSocketServer = (server: any) => {
  wss = new WebSocketServer({ server });

  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    const client = ws as AuthenticatedClient;
    client.subscribedBuilds = new Set();
    
    // Check for token in query string: ws://host/ws?token=xxx
    const apiKeys = getApiKeys();
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const token = url.searchParams.get('token');
    
    // In development with no keys, allow all connections
    if (apiKeys.size === 0 && process.env.NODE_ENV === 'development') {
      client.isAuthenticated = true;
      console.log('Client connected (dev mode - no auth required)');
    } else if (token && apiKeys.has(token)) {
      client.isAuthenticated = true;
      console.log('Client connected (authenticated)');
    } else {
      client.isAuthenticated = false;
      console.log('Client connected (unauthenticated - limited access)');
      // Close unauthenticated connections after brief delay
      ws.send(JSON.stringify({ type: 'ERROR', message: 'Authentication required. Connect with ?token=YOUR_API_KEY' }));
      setTimeout(() => ws.close(4001, 'Unauthorized'), 1000);
      return;
    }

    // Handle subscription messages
    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'SUBSCRIBE' && msg.buildId) {
          client.subscribedBuilds.add(msg.buildId);
          ws.send(JSON.stringify({ type: 'SUBSCRIBED', buildId: msg.buildId }));
        }
      } catch {
        // Ignore invalid messages
      }
    });

    ws.on('close', () => console.log('Client disconnected'));
  });
};

export const broadcast = (message: string) => {
  if (wss) {
    wss.clients.forEach(client => {
      const authClient = client as AuthenticatedClient;
      if (client.readyState === WebSocket.OPEN && authClient.isAuthenticated) {
        client.send(message);
      }
    });
  }
};

// Broadcast to clients subscribed to a specific build
export const broadcastToBuild = (buildId: string, message: string) => {
  if (wss) {
    wss.clients.forEach(client => {
      const authClient = client as AuthenticatedClient;
      if (client.readyState === WebSocket.OPEN && 
          authClient.isAuthenticated && 
          authClient.subscribedBuilds.has(buildId)) {
        client.send(message);
      }
    });
  }
};

export const broadcastBuildComplete = (payload: BuildCompletePayload) => {
  // Broadcast to all authenticated clients (they can filter by buildId)
  broadcast(JSON.stringify(payload));
};
