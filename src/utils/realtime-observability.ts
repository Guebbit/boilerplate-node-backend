import type { Response } from 'express';
import {
    OBSERVABILITY_SSE_EVENTS,
    type IObservabilityMetricsPayload,
    type TObservabilitySseEventName
} from '@utils/realtime-contracts';
import { getHttpRequestCounters } from '@utils/observability';
import { getActiveWebSocketConnections } from '@utils/realtime-chat';

const sseClients = new Set<Response>();
const UPDATE_INTERVAL_MS = 5000;
const HEARTBEAT_INTERVAL_MS = 15_000;

const writeEvent = (
    response: Response,
    event: TObservabilitySseEventName,
    payload: IObservabilityMetricsPayload
) => {
    response.write(`event: ${event}\n`);
    response.write(`data: ${JSON.stringify(payload)}\n\n`);
};

export const getActiveSseClients = (): number => sseClients.size;

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

const writeMetricsEvent = (response: Response, eventName: TObservabilitySseEventName) => {
    void buildObservabilityPayload()
        .then((payload) => writeEvent(response, eventName, payload))
        .catch(() => {});
};

export const streamObservabilityMetrics = (response: Response) => {
    response.status(200);
    response.setHeader('Content-Type', 'text/event-stream');
    response.setHeader('Cache-Control', 'no-cache, no-transform');
    response.setHeader('Connection', 'keep-alive');
    response.flushHeaders();

    sseClients.add(response);
    writeMetricsEvent(response, OBSERVABILITY_SSE_EVENTS.SNAPSHOT);

    const updatesInterval = setInterval(() => {
        writeMetricsEvent(response, OBSERVABILITY_SSE_EVENTS.UPDATE);
    }, UPDATE_INTERVAL_MS);

    const heartbeatInterval = setInterval(() => {
        writeMetricsEvent(response, OBSERVABILITY_SSE_EVENTS.HEARTBEAT);
    }, HEARTBEAT_INTERVAL_MS);

    const teardown = () => {
        clearInterval(updatesInterval);
        clearInterval(heartbeatInterval);
        sseClients.delete(response);
    };

    response.on('close', teardown);
};
