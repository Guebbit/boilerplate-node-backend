import crypto from 'node:crypto';
import { WebSocket, type RawData } from 'ws';
import {
    DEFAULT_CHAT_ROOM,
    type TChatClientEvent,
    type TChatServerEvent,
    type TChatRoom
} from '@utils/realtime-contracts';

interface IChatClientState {
    username?: string;
    room: TChatRoom;
}

const chatClients = new Map<WebSocket, IChatClientState>();
/** Keep demo payloads bounded so malformed clients cannot flood memory. */
const MAX_USERNAME_LENGTH = 32;
const MAX_MESSAGE_LENGTH = 500;

const safeJsonParse = (input: string): unknown => {
    try {
        return JSON.parse(input) as unknown;
    } catch {
        return undefined;
    }
};

const sendEvent = (ws: WebSocket, event: TChatServerEvent) => {
    if (ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify(event));
};

const getActiveUsernames = (room: TChatRoom): string[] =>
    [...chatClients.values()]
        .filter((client) => client.room === room && Boolean(client.username))
        .map((client) => client.username as string);

const broadcastToRoom = (room: TChatRoom, event: TChatServerEvent) => {
    for (const [client, state] of chatClients) {
        if (state.room !== room) continue;
        sendEvent(client, event);
    }
};

const emitPresence = (room: TChatRoom) =>
    broadcastToRoom(room, {
        type: 'chat:presence',
        payload: {
            room,
            users: getActiveUsernames(room)
        }
    });

const toClientEvent = (rawMessage: RawData): TChatClientEvent | undefined => {
    /** Parse unknown websocket payloads defensively before narrowing by event type. */
    const parsed = safeJsonParse(
        rawMessage instanceof Buffer ? rawMessage.toString('utf8') : String(rawMessage)
    ) as Partial<TChatClientEvent> | undefined;
    if (!parsed || typeof parsed !== 'object' || typeof parsed.type !== 'string') return;
    if (parsed.type !== 'chat:join' && parsed.type !== 'chat:message:send') return;
    return parsed as TChatClientEvent;
};

const emitError = (ws: WebSocket, message: string) =>
    sendEvent(ws, {
        type: 'chat:error',
        payload: { message }
    });

export const onChatConnected = (ws: WebSocket) => {
    chatClients.set(ws, { room: DEFAULT_CHAT_ROOM });
};

export const onChatDisconnected = (ws: WebSocket) => {
    const state = chatClients.get(ws);
    if (!state) return;
    chatClients.delete(ws);
    if (!state.username) return;

    const timestamp = new Date().toISOString();
    broadcastToRoom(state.room, {
        type: 'chat:system',
        payload: {
            room: state.room,
            message: `${state.username} left ${state.room}`,
            timestamp
        }
    });
    emitPresence(state.room);
};

export const onChatMessage = (ws: WebSocket, rawMessage: RawData) => {
    const event = toClientEvent(rawMessage);
    if (!event) {
        emitError(ws, 'Invalid event payload');
        return;
    }

    if (event.type === 'chat:join') {
        const username = event.payload.username?.trim();
        if (!username) {
            emitError(ws, 'username is required');
            return;
        }
        if (username.length > MAX_USERNAME_LENGTH) {
            emitError(ws, `username must be <= ${MAX_USERNAME_LENGTH} characters`);
            return;
        }

        const state = chatClients.get(ws);
        if (!state) {
            emitError(ws, 'connection state not found');
            return;
        }

        state.username = username;
        sendEvent(ws, {
            type: 'chat:joined',
            payload: {
                username,
                room: DEFAULT_CHAT_ROOM
            }
        });

        const timestamp = new Date().toISOString();
        broadcastToRoom(DEFAULT_CHAT_ROOM, {
            type: 'chat:system',
            payload: {
                room: DEFAULT_CHAT_ROOM,
                message: `${username} joined ${DEFAULT_CHAT_ROOM}`,
                timestamp
            }
        });
        emitPresence(DEFAULT_CHAT_ROOM);
        return;
    }

    const state = chatClients.get(ws);
    if (!state?.username) {
        emitError(ws, 'join first');
        return;
    }

    const message = event.payload.message?.trim();
    if (!message) {
        emitError(ws, 'message is required');
        return;
    }
    if (message.length > MAX_MESSAGE_LENGTH) {
        emitError(ws, `message must be <= ${MAX_MESSAGE_LENGTH} characters`);
        return;
    }

    broadcastToRoom(state.room, {
        type: 'chat:message',
        payload: {
            id: crypto.randomUUID(),
            username: state.username,
            room: state.room,
            message,
            timestamp: new Date().toISOString()
        }
    });
};

export const getActiveWebSocketConnections = (): number => chatClients.size;

export const clearRealtimeChatState = () => {
    chatClients.clear();
};
