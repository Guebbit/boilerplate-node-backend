import { WebSocketServer, WebSocket, type RawData, type MessageEvent, type ErrorEvent } from 'ws';

/**
 *
 */
export interface IWebSocketServerCallbacks {
    port?: number;
    connectionCallback: (ws: WebSocket) => void;
    onMessage: (ws: WebSocket, message: RawData) => void;
    onError: (ws: WebSocket, error: Error) => void;
    onClose: (ws: WebSocket, code: number, reason: Buffer) => void;
}

/**
 * Create a WebSocket server.
 *
 * @param port
 * @param connectionCallback
 * @param onMessage
 * @param onError
 * @param onClose
 * @returns {WebSocketServer} The WebSocket client instance.
 */
export const setupWebSocketServer = ({
    port,
    connectionCallback,
    onMessage,
    onError,
    onClose
}: Partial<IWebSocketServerCallbacks> = {}): WebSocketServer => {
    const wss = new WebSocketServer({
        /**
         * This sets the WebSocket server to listen on a port
         * (if specified)
         */
        port,

        /**
         * If no port is specified, noServer will be true
         * Necessary for "upgrading" a route to WebSocket
         */
        noServer: !port,

        /**
         * This option enables the Per-Message Deflate extension,
         * which allows WebSocket messages to be compressed using zlib before being sent.
         * It improves performance and reduces bandwidth usage, especially for large payloads.
         * Configures various compression options.
         */
        perMessageDeflate: {
            /**
             * These options control how deflation (compression) is handled.
             */
            zlibDeflateOptions: {
                // The size of chunks when decompressing data (default is 16384 in zlib).
                chunkSize: 1024,
                // Controls how much memory is allocated for compression (range: 1-9, default is 8).
                memLevel: 7,
                //  The compression level (range: 0-9, where 0 is no compression and 9 is max compression).
                level: 3
            },

            /**
             * These options control how inflation (decompression) is handled.
             */
            zlibInflateOptions: {
                // chunkSize: 16384
            },

            /**
             * Prevents clients from reusing compression context.
             * Each WebSocket message will have a new compression state.
             * Improves security but increases compression overhead.
             */
            clientNoContextTakeover: true,

            /**
             * Prevents the server from reusing compression context.
             * Each WebSocket message will have a new compression state.
             * Reduces memory usage at the cost of efficiency.
             */
            serverNoContextTakeover: true,

            /**
             * This controls the maximum size of the sliding window used for compression.
             * Lower values reduce memory usage but may decrease compression efficiency.
             * Default is negotiated between client and server.
             */
            serverMaxWindowBits: 10,

            /**
             * Limits the number of simultaneous zlib compression processes.
             * Helps prevent performance issues caused by too many concurrent compression operations.
             */
            concurrencyLimit: 10,

            /**
             * Messages smaller than {threshold} bytes will NOT be compressed if context takeover is disabled.
             * Avoids unnecessary compression for small messages, which might not benefit much.
             */
            threshold: 1024
        }
    });

    /**
     * Fired when a NEW client connects to the server.
     */
    wss.on('connection', (ws) => {
        if (connectionCallback) connectionCallback(ws);

        /**
         * Fired when a message is received from a client.
         */
        ws.on('message', (message) => onMessage && onMessage(ws, message));

        /**
         * Fired when an error occurs.
         */
        ws.on('error', (error) => onError && onError(ws, error));

        /**
         * Fired when the connection is closed.
         */
        ws.on('close', (code, reason) => onClose && onClose(ws, code, reason));
    });

    return wss;
};

/**
 *
 */
export interface IWebSocketClientCallbacks {
    onOpen?: (ws: WebSocket) => void;
    onMessage?: (ws: WebSocket, message: MessageEvent) => void;
    onError?: (ws: WebSocket, error: ErrorEvent) => void;
    onClose?: (ws: WebSocket, code: number, reason: string) => void;
}

/**
 * Create a WebSocket client
 *
 * @param url - The WebSocket server URL.
 * @param onOpen - Called when the connection is successfully established.
 * @param onMessage - Called when a message is received.
 * @param onError - Called when an error occurs.
 * @param onClose - Called when the connection is closed.
 * @returns {WebSocket} The WebSocket client instance.
 */
export const setupWebSocketClient = (
    url: string,
    { onOpen, onMessage, onError, onClose }: Partial<IWebSocketClientCallbacks> = {}
): WebSocket => {
    const ws = new WebSocket(url);

    /**
     * Fired when the connection is successfully established.
     */
    ws.addEventListener('open', () => onOpen && onOpen(ws));

    /**
     * Fired when a message is received from the server.
     */
    ws.addEventListener('message', (message) => onMessage && onMessage(ws, message));

    /**
     * Fired when an error occurs.
     */
    ws.addEventListener('error', (error) => onError && onError(ws, error));

    /**
     * Fired when the connection is closed.
     */
    ws.addEventListener('close', (event) => onClose && onClose(ws, event.code, event.reason));

    return ws;
};
