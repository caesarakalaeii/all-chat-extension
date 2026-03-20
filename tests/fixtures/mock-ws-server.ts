import { WebSocketServer, WebSocket } from 'ws';

let wss: WebSocketServer | null = null;

export async function startMockWsServer(port = 8080): Promise<WebSocketServer> {
  wss = new WebSocketServer({ port });

  wss.on('connection', (socket: WebSocket) => {
    socket.send(
      JSON.stringify({
        type: 'connected',
        data: { overlay_id: 'test-overlay' },
        timestamp: new Date().toISOString(),
      })
    );

    socket.on('message', (raw: Buffer) => {
      let msg: { type?: string };
      try {
        msg = JSON.parse(raw.toString()) as { type?: string };
      } catch {
        return;
      }
      if (msg.type === 'ping') {
        socket.send(JSON.stringify({ type: 'pong' }));
      }
    });
  });

  return wss;
}

export async function stopMockWsServer(): Promise<void> {
  if (!wss) return;
  return new Promise((resolve, reject) => {
    wss!.close((err) => {
      if (err) reject(err);
      else resolve();
    });
    wss = null;
  });
}

export function getMockWsServer(): WebSocketServer | null {
  return wss;
}
