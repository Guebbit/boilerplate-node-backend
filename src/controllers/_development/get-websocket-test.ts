import type { Request, Response } from 'express';
import { setupWebSocketServer, setupWebSocketClient } from '@utils/helpers-websockets';
import logger from '@utils/winston';

/**
 * GET /websocket-test
 * WebSocket test endpoint.
 */
const getWebsocketTest = (request: Request, response: Response) => {
    const port = 3001;
    const url = `ws://localhost:${port}`;

    // Create a WebSocket server
    const wss = setupWebSocketServer({
        port,
        connectionCallback: () => logger.info('SERVER: created'),
        onMessage: (ws, message) => {
            logger.info(
                'SERVER: Client message received',
                message instanceof Buffer ? message.toString() : message
            );
            ws.send('We received your message!');
        },

        onClose: (ws, code, reason) =>
            logger.info(
                `SERVER: connection closed: ${code}`,
                reason instanceof Buffer ? reason.toString() : reason
            )
    });
    
    logger.info(`SERVER: running on ${url}`);

    // Create a WebSocket client after 1 second (to ensure that server started)
    setTimeout(() => {
        const ws = setupWebSocketClient(url, {
            onOpen: (ws) => {
                logger.info('CLIENT: connected to server');
                ws.send('Hello Server!');
            },

            onMessage: (ws, message) =>
                logger.info('CLIENT: Server message received', message.data),
            onClose: (ws, code, reason) => logger.info(`CLIENT: connection closed: ${code}`, reason)
        });

        // Close the client after 2 seconds, no need to keep it open
        setTimeout(() => ws.close(1000, 'Test complete'), 2000);
    }, 1000);

    setTimeout(() => wss.close(() => logger.info('SERVER: closed')), 4000);

    response.status(200).json({
        success: true,
        message: 'Websocket test initiated'
    });
};

export default getWebsocketTest;
