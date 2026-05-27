import type { Response } from 'express';
import {
    OBSERVABILITY_CHANNELS,
    type IObservabilityMetricsPayload,
    type TObservabilityChannel
} from '@types';
import { getHttpRequestCounters } from '@utils/observability';
import { getActiveWebSocketConnections } from '@utils/realtime-chat';

// In-memory set of active SSE response objects — one entry per connected client.
const sseClients = new Set<Response>();

// How often the server pushes a metrics delta to all connected SSE clients.
const UPDATE_INTERVAL_MS = 5000;

// Lightweight keep-alive ping to prevent proxies/load-balancers from closing idle SSE streams.
const HEARTBEAT_INTERVAL_MS = 15_000;

// Writes a single SSE frame (event + data) to the response stream.
const writeEvent = (
    response: Response,
    event: TObservabilityChannel,
    payload: IObservabilityMetricsPayload
) => {
    response.write(`event: ${event}\n`);
    response.write(`data: ${JSON.stringify(payload)}\n\n`);
};

// Returns the current number of open SSE connections (used by observability payload itself).
export const getActiveSseClients = (): number => sseClients.size;

// Builds a snapshot of current process/runtime metrics matching the asyncapi.yaml schema.
export const buildObservabilityPayload = (): Promise<IObservabilityMetricsPayload> => {
    const memoryUsage = process.memoryUsage();
    return getHttpRequestCounters().then((counters) => ({
        timestamp: new Date().toISOString(),
        uptimeSeconds: Math.round(process.uptime()),
        memory: {
            rss: memoryUsage.rss,
            heapUsed: memoryUsage.heapUsed,
            heapTotal: memoryUsage.heapTotal,
            external: memoryUsage.external
        },
        http: {
            totalRequests: counters.totalRequests,
            totalErrors: counters.totalErrors
        },
        realtime: {
            websocketConnections: getActiveWebSocketConnections(),
            sseClients: getActiveSseClients()
        }
    }));
};

// Fires-and-forgets a metrics event — errors are silently swallowed to avoid crashing the stream.
const writeMetricsEvent = (response: Response, eventName: TObservabilityChannel) => {
    void buildObservabilityPayload()
        .then((payload) => {
            writeEvent(response, eventName, payload);
        })
        .catch(() => {});
};

// Opens an SSE stream on the given response: sets headers, sends an immediate snapshot,
// then schedules periodic updates and heartbeats, cleaning up all intervals on close.
export const streamObservabilityMetrics = (response: Response) => {
    response.status(200);
    response.setHeader('Content-Type', 'text/event-stream');
    response.setHeader('Cache-Control', 'no-cache, no-transform');
    response.setHeader('Connection', 'keep-alive');
    response.flushHeaders();

    sseClients.add(response);
    // Send the first payload immediately so the client has data before the first interval fires.
    writeMetricsEvent(response, OBSERVABILITY_CHANNELS.METRICS_SNAPSHOT);

    const updatesInterval = setInterval(() => {
        writeMetricsEvent(response, OBSERVABILITY_CHANNELS.METRICS_UPDATED);
    }, UPDATE_INTERVAL_MS);

    const heartbeatInterval = setInterval(() => {
        writeMetricsEvent(response, OBSERVABILITY_CHANNELS.HEARTBEAT);
    }, HEARTBEAT_INTERVAL_MS);

    // Cleanup when the client disconnects to avoid memory leaks and stale intervals.
    const teardown = () => {
        clearInterval(updatesInterval);
        clearInterval(heartbeatInterval);
        sseClients.delete(response);
    };

    response.on('close', teardown);
};
