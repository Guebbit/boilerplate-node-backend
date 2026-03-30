import {setupWebSocketServer} from "../utils/helpers-websockets";
import {WebSocket} from 'ws';

/**
 * Needed to later clear the interval
 */
let broadcastTimeInterval: NodeJS.Timeout;

/**
 *
 */
export const wss = setupWebSocketServer({
    connectionCallback: () => {
        // Send time every 5 seconds
        broadcastTimeInterval = setInterval(() => {
            // Broadcast to all connected clients
            for (const client of wss.clients)

                if (client.readyState === WebSocket.OPEN)
                    client.send("The time is now: " + new Date().toISOString());
        }, 10_000)
    },
    onMessage: (ws, message) => {
        // eslint-disable-next-line no-console
        console.log("SERVER: Client message received", message instanceof Buffer ? message.toString() : message);
        ws.send("Thank you, we received your message!");
    },
    onClose: (ws, code, reason) => {
        // eslint-disable-next-line no-console
        console.log(`SERVER: connection closed: ${code}`, reason instanceof Buffer ? reason.toString() : reason)
        clearInterval(broadcastTimeInterval);
    },
});


