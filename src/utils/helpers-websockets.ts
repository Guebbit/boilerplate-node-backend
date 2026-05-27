import { WebSocketServer, WebSocket, type RawData, type MessageEvent, type ErrorEvent } from 'ws';

// Lifecycle callbacks for a WebSocket server — all optional except connectionCallback.
export interface IWebSocketServerCallbacks {
    port?: number;
    connectionCallback: (ws: WebSocket) => void;
    onMessage: (ws: WebSocket, message: RawData) => void;
    onError: (ws: WebSocket, error: Error) => void;
    onClose: (ws: WebSocket, code: number, reason: Buffer) => void;
}

// Creates and wires a WebSocket server. Pass no port to run in noServer mode
// (attach to an existing HTTP server via handleUpgrade instead).
export const setupWebSocketServer = ({
    port,
    connectionCallback,
    onMessage,
    onError,
    onClose
}: Partial<IWebSocketServerCallbacks> = {}): WebSocketServer => {
    const wss = new WebSocketServer({
        // When port is omitted the server expects manual HTTP upgrade delegation.
        port,
        noServer: !port,

        // Per-Message Deflate: compress frames with zlib to reduce bandwidth.
        // context takeover disabled to trade memory reuse for security isolation.
        perMessageDeflate: {
            zlibDeflateOptions: { chunkSize: 1024, memLevel: 7, level: 3 },
            zlibInflateOptions: {},
            clientNoContextTakeover: true,
            serverNoContextTakeover: true,
            serverMaxWindowBits: 10,
            concurrencyLimit: 10,
            // Skip compression for small frames — overhead would outweigh benefit.
            threshold: 1024
        }
    });

    // Wire per-connection event handlers.
    wss.on('connection', (ws) => {
        if (connectionCallback) connectionCallback(ws);
        ws.on('message', (message) => onMessage && onMessage(ws, message));
        ws.on('error', (error) => onError && onError(ws, error));
        ws.on('close', (code, reason) => onClose && onClose(ws, code, reason));
    });

    return wss;
};

// Lifecycle callbacks for a WebSocket client.
export interface IWebSocketClientCallbacks {
    onOpen?: (ws: WebSocket) => void;
    onMessage?: (ws: WebSocket, message: MessageEvent) => void;
    onError?: (ws: WebSocket, error: ErrorEvent) => void;
    onClose?: (ws: WebSocket, code: number, reason: string) => void;
}

// Creates a WebSocket client connected to url, wiring optional event listeners.
export const setupWebSocketClient = (
    url: string,
    { onOpen, onMessage, onError, onClose }: Partial<IWebSocketClientCallbacks> = {}
): WebSocket => {
    const ws = new WebSocket(url);
    ws.addEventListener('open', () => onOpen && onOpen(ws));
    ws.addEventListener('message', (message) => onMessage && onMessage(ws, message));
    ws.addEventListener('error', (error) => onError && onError(ws, error));
    ws.addEventListener('close', (event) => onClose && onClose(ws, event.code, event.reason));
    return ws;
};
