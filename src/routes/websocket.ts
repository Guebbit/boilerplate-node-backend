import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { setupWebSocketServer } from '@utils/helpers-websockets';
import { onChatConnected, onChatDisconnected, onChatMessage } from '@utils/realtime-chat';

export const CHAT_WEBSOCKET_PATH = '/ws/chat';

export const wss = setupWebSocketServer({
    connectionCallback: (ws) => onChatConnected(ws),
    onMessage: (ws, message) => onChatMessage(ws, message),
    onClose: (ws) => onChatDisconnected(ws)
});

export const handleWebSocketUpgrade = (
    request: IncomingMessage,
    socket: Duplex,
    head: Buffer
) => {
    const host = request.headers.host ?? 'localhost';
    const pathname = new URL(request.url ?? '/', `http://${host}`).pathname;
    if (pathname !== CHAT_WEBSOCKET_PATH) {
        socket.write(
            'HTTP/1.1 404 Not Found\r\nContent-Type: text/plain\r\nConnection: close\r\n\r\nWebSocket endpoint not found'
        );
        socket.destroy();
        return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
    });
};
