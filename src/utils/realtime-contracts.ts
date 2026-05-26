// Default room name — mirrors the `enum: [general]` constraint in asyncapi.yaml.
export const DEFAULT_CHAT_ROOM = 'general';

export type TChatRoom = typeof DEFAULT_CHAT_ROOM;

// --- Chat client → server commands ---

export interface IChatJoinEvent {
    type: 'chat:join';
    payload: {
        username: string;
        room?: TChatRoom;
    };
}

export interface IChatMessageSendEvent {
    type: 'chat:message:send';
    payload: {
        message: string;
    };
}

// Union of all messages a client can send to the server.
export type TChatClientEvent = IChatJoinEvent | IChatMessageSendEvent;

// --- Chat server → client events ---

export interface IChatSystemEvent {
    type: 'chat:system';
    payload: {
        message: string;
        room: TChatRoom;
        timestamp: string;
    };
}

export interface IChatPresenceEvent {
    type: 'chat:presence';
    payload: {
        room: TChatRoom;
        users: string[];
    };
}

export interface IChatMessageEvent {
    type: 'chat:message';
    payload: {
        id: string;
        username: string;
        room: TChatRoom;
        message: string;
        timestamp: string;
    };
}

export interface IChatJoinedEvent {
    type: 'chat:joined';
    payload: {
        username: string;
        room: TChatRoom;
    };
}

export interface IChatErrorEvent {
    type: 'chat:error';
    payload: {
        message: string;
    };
}

// Union of all messages the server can push to clients.
export type TChatServerEvent =
    | IChatSystemEvent
    | IChatPresenceEvent
    | IChatMessageEvent
    | IChatJoinedEvent
    | IChatErrorEvent;

// --- SSE observability event names (mirrors asyncapi.yaml channel names) ---

export const OBSERVABILITY_SSE_EVENTS = {
    SNAPSHOT: 'metrics.snapshot',
    UPDATE: 'metrics.updated',
    HEARTBEAT: 'heartbeat'
} as const;

export type TObservabilitySseEventName =
    (typeof OBSERVABILITY_SSE_EVENTS)[keyof typeof OBSERVABILITY_SSE_EVENTS];

// Payload shape for all three SSE event types (snapshot / update / heartbeat).
export interface IObservabilityMetricsPayload {
    timestamp: string;
    uptimeSeconds: number;
    memory: {
        rss: number;
        heapUsed: number;
        heapTotal: number;
        external: number;
    };
    http: {
        totalRequests: number;
        totalErrors: number;
    };
    realtime: {
        websocketConnections: number;
        sseClients: number;
    };
}

// --- Ecommerce domain events ---

// Emitted after a successful cart checkout; matches the asyncapi.yaml CartCheckedOutEvent schema.
export interface ICartCheckedOutEvent {
    eventName: 'ecommerce.cart.checked_out';
    eventId: string;
    occurredAt: string;
    cartId: string;
    userId: string;
    orderId: string;
    itemCount: number;
}
