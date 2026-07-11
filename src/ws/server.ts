import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';
import url from 'url';

let wss: WebSocketServer | null = null;
const clients: Set<WebSocket> = new Set();

export function initWebSocketServer(server: http.Server) {
  wss = new WebSocketServer({ server });

  wss.on('connection', (ws, req) => {
    const tokenRequired = process.env.WARDEN_API_TOKEN || '';
    if (tokenRequired) {
      const parsedUrl = url.parse(req.url || '', true);
      const reqToken = parsedUrl.query?.token || req.headers['x-warden-token'];
      if (reqToken !== tokenRequired) {
        ws.close(4001, 'Unauthorized');
        return;
      }
    }
    clients.add(ws);
    ws.on('close', () => clients.delete(ws));
    ws.send(JSON.stringify({ type: 'hello', payload: 'Warden WS Connected' }));
  });
}

export function broadcastEvent(type: string, payload: unknown) {
  const message = JSON.stringify({ type, payload });
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  }
}
