import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { setupWebSocketServer } from '@utils/helpers-websockets';
import { onChatConnected, onChatDisconnected, onChatMessage } from '@utils/realtime-chat';

// The URL path that the HTTP server upgrades to a WebSocket connection.
export const CHAT_WEBSOCKET_PATH = '/ws/chat';

// Single shared WebSocket server instance — runs without its own port so it
// can be attached to the existing Express HTTP server via handleWebSocketUpgrade.
export const wss = setupWebSocketServer({
    connectionCallback: (ws) => onChatConnected(ws),
    onMessage: (ws, message) => onChatMessage(ws, message),
    onClose: (ws) => onChatDisconnected(ws)
});

// Handles HTTP → WebSocket upgrade requests. Rejects unknown paths with 404
// to prevent unintended WebSocket access on other routes.
export const handleWebSocketUpgrade = (request: IncomingMessage, socket: Duplex, head: Buffer) => {
    const host = request.headers.host ?? 'localhost';
    const pathname = new URL(request.url ?? '/', `http://${host}`).pathname;
    if (pathname !== CHAT_WEBSOCKET_PATH) {
        socket.write(
            'HTTP/1.1 404 Not Found\r\nContent-Type: text/plain\r\nConnection: close\r\n\r\nWebSocket endpoint not found'
        );
        socket.destroy();
        return;
    }

    // Delegate the upgrade to the ws library, which then fires the 'connection' event.
    wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
    });
};
