export const DEFAULT_CHAT_ROOM = 'general';

export type TChatRoom = typeof DEFAULT_CHAT_ROOM;

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

export type TChatClientEvent = IChatJoinEvent | IChatMessageSendEvent;

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

export type TChatServerEvent =
    | IChatSystemEvent
    | IChatPresenceEvent
    | IChatMessageEvent
    | IChatJoinedEvent
    | IChatErrorEvent;

export const OBSERVABILITY_SSE_EVENTS = {
    SNAPSHOT: 'metrics.snapshot',
    UPDATE: 'metrics.updated',
    HEARTBEAT: 'heartbeat'
} as const;

export type TObservabilitySseEventName =
    (typeof OBSERVABILITY_SSE_EVENTS)[keyof typeof OBSERVABILITY_SSE_EVENTS];

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
