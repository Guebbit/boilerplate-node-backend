// GENERATED — do not edit manually.
// Source: asyncapi.yaml  |  Regenerate: npm run gen:asyncapi-types

// ---------------------------------------------------------------------------
// Channel name constants (canonical event identifiers from asyncapi.yaml)
// ---------------------------------------------------------------------------

/** WebSocket chat channel names */
export const CHAT_CHANNELS = {
    COMMAND_JOIN: 'realtime.chat.command.join',
    COMMAND_MESSAGE_SEND: 'realtime.chat.command.message.send',
    EVENT_USER_JOINED: 'realtime.chat.event.user.joined',
    EVENT_USER_LEFT: 'realtime.chat.event.user.left',
    EVENT_MESSAGE_NEW: 'realtime.chat.event.message.new',
    EVENT_PRESENCE_UPDATED: 'realtime.chat.event.presence.updated',
    EVENT_JOINED: 'realtime.chat.event.joined',
    EVENT_ERROR: 'realtime.chat.event.error'
} as const;

/** SSE observability channel names */
export const OBSERVABILITY_CHANNELS = {
    METRICS_SNAPSHOT: 'observability.metrics.snapshot',
    METRICS_UPDATED: 'observability.metrics.updated',
    HEARTBEAT: 'observability.heartbeat'
} as const;

/** Ecommerce domain event channel names */
export const ECOMMERCE_CHANNELS = {
    CART_CHECKED_OUT: 'ecommerce.cart.checked_out'
} as const;

/** RabbitMQ worker queue channel names */
export const WORKER_CHANNELS = {
    EMAIL_SEND: 'worker.email.send',
    PDF_GENERATE: 'worker.pdf.generate'
} as const;

/** Redis pub/sub cache channel names */
export const CACHE_CHANNELS = {
    TAGS_INVALIDATED: 'cache.tags.invalidated'
} as const;

/** Union of all SSE observability channel names. */
export type TObservabilityChannel =
    (typeof OBSERVABILITY_CHANNELS)[keyof typeof OBSERVABILITY_CHANNELS];

/** Union of all ecommerce channel names. */
export type TEcommerceChannel = (typeof ECOMMERCE_CHANNELS)[keyof typeof ECOMMERCE_CHANNELS];

/** Union of all worker queue channel names. */
export type TWorkerChannel = (typeof WORKER_CHANNELS)[keyof typeof WORKER_CHANNELS];

/** Union of all cache pub/sub channel names. */
export type TCacheChannel = (typeof CACHE_CHANNELS)[keyof typeof CACHE_CHANNELS];

// ---------------------------------------------------------------------------
// Component schemas
// ---------------------------------------------------------------------------

export interface IChatSystemPayload {
    type: 'chat:system';
    payload: {
        message: string;
        room: 'general';
        timestamp: string;
    };
}
export interface IChatMessagePayload {
    type: 'chat:message';
    payload: {
        id: string;
        username: string;
        room: 'general';
        message: string;
        timestamp: string;
    };
}
export interface IChatPresencePayload {
    type: 'chat:presence';
    payload: {
        room: 'general';
        users: string[];
    };
}
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
export interface IEmailJobPayload {
    request: {
        to: string;
        subject?: string;
        text?: string;
        html?: string;
    };
    from?: string;
    templateName: string;
    data: unknown;
}
export interface IPdfJobPayload {
    templatePath: string;
    templateData: unknown;
    outputPath: string;
}
export interface ICacheTagsInvalidatedPayload {
    tags: string[];
    origin: string;
    timestamp: string;
}

// ---------------------------------------------------------------------------
// Inline message schemas (not in components.schemas but used in channels)
// ---------------------------------------------------------------------------

export interface IChatJoinCommand {
    type: 'chat:join';
    payload: {
        username: string;
        room?: 'general';
    };
}

export interface IChatMessageSendCommand {
    type: 'chat:message:send';
    payload: {
        message: string;
    };
}

export interface IChatErrorEvent {
    type: 'chat:error';
    payload: {
        message: string;
    };
}

export interface IChatJoinedEvent {
    type: 'chat:joined';
    payload: {
        username: string;
        room: 'general';
    };
}

export interface ICartCheckedOutEvent {
    eventName: 'ecommerce.cart.checked_out';
    eventId: string;
    occurredAt: string;
    cartId: string;
    userId: string;
    orderId: string;
    itemCount: number;
}

// ---------------------------------------------------------------------------
// Application-level union types (built from generated interfaces above)
// ---------------------------------------------------------------------------

/** Default chat room name — mirrors the enum constraint in asyncapi.yaml. */
export const DEFAULT_CHAT_ROOM = 'general' as const;
export type TChatRoom = typeof DEFAULT_CHAT_ROOM;

/** All event types a chat client can send to the server. */
export type TChatClientEvent = IChatJoinCommand | IChatMessageSendCommand;

/** All event types the server can push to a chat client. */
export type TChatServerEvent =
    | IChatSystemPayload
    | IChatMessagePayload
    | IChatPresencePayload
    | IChatJoinedEvent
    | IChatErrorEvent;
