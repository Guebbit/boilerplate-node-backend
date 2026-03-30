import type { Request, Response } from 'express';
import { setupWebSocketServer, setupWebSocketClient } from '@utils/helpers-websockets';

/**
 * Homepage
 *
 * @param _request
 * @param response
 */
const getWebsocketTest = (_request: Request, response: Response) => {
    const port = 3001;
    const url = `ws://localhost:${port}`;

    // Create a WebSocket server
    const wss = setupWebSocketServer({
        port,
        // eslint-disable-next-line no-console
        connectionCallback: () => console.log("SERVER: created"),
        onMessage: (ws, message) => {
            // eslint-disable-next-line no-console
            console.log("SERVER: Client message received", message instanceof Buffer ? message.toString() : message);
            ws.send("We received your message!");
        },
        // eslint-disable-next-line no-console
        onClose: (ws, code, reason) => console.log(`SERVER: connection closed: ${code}`, reason instanceof Buffer ? reason.toString() : reason),
    });

    // eslint-disable-next-line no-console
    console.log(`SERVER: running on ${url}`);

    // Create a WebSocket client after 1 second (to ensure that server started)
    setTimeout(() => {
        const ws = setupWebSocketClient(url,
            {
                onOpen: (ws) => {
                    // eslint-disable-next-line no-console
                    console.log("CLIENT: connected to server");
                    ws.send("Hello Server!");
                },
                // eslint-disable-next-line no-console
                onMessage: (ws, message) => console.log("CLIENT: Server message received", message.data),
                // eslint-disable-next-line no-console
                onClose: (ws, code, reason) => console.log(`CLIENT: connection closed: ${code}`, reason)
            }
        );

        // Close the client after 2 seconds, no need to keep it open
        setTimeout(() => ws.close(1000, "Test complete"), 2000);
    }, 1000);

    // eslint-disable-next-line no-console
    setTimeout(() => wss.close(() => console.log("SERVER: closed")), 4000);

    response.status(200)
        .json({
            success: true,
            message: 'Websocket test initiated'
        });
}

export default getWebsocketTest;