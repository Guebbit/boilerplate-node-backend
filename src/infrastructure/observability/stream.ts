/**
 * Live metrics over Server-Sent Events (SSE).
 *
 * SSE rather than WebSockets: the data flows one way (server → dashboard), it is plain HTTP so
 * no protocol upgrade or extra dependency is needed, and browsers reconnect automatically via
 * the built-in `EventSource` client.
 *
 * See: docs/tools/frontend-observability.md
 */

import type { Response } from 'express';
import {
    // Channel-name constants, shared with asyncapi.yaml so the event names a dashboard listens
    // for are contractual rather than ad hoc strings.
    OBSERVABILITY_CHANNELS,
    type ObservabilityMetricsPayload,
    type ObservabilityChannel
} from '@types';
import { getHttpRequestCounters } from '@infrastructure/observability/metrics-http';
import { processSnapshot } from '@infrastructure/observability/process-snapshot';

/**
 * In-memory set of active SSE response objects — one entry per connected client.
 *
 * A `Set` so `delete(response)` on disconnect is O(1) and a response can never be added twice.
 * Per-process, like the audit buffer: under clustering each worker tracks only its own clients.
 */
const sseClients = new Set<Response>();

/** How often the server pushes a metrics delta to all connected SSE clients. */
const UPDATE_INTERVAL_MS = 5000;

/**
 * Lightweight keep-alive ping to prevent proxies/load-balancers from closing idle SSE streams.
 *
 * Reverse proxies commonly drop connections after 30-60s of silence, and the client cannot tell
 * an idle stream from a dead one. 15s stays comfortably under the usual thresholds.
 */
const HEARTBEAT_INTERVAL_MS = 15_000;

/**
 * Writes a single SSE frame (event + data) to the response stream.
 *
 * The wire format is strict and whitespace-significant: `event:` names the channel the client
 * listens on, `data:` carries the payload, and the *blank line* (the trailing `\n\n`) is what
 * marks the end of a frame. Omit it and the client buffers indefinitely.
 * Payloads must be single-line, which JSON guarantees — a raw newline inside `data:` would be
 * parsed as a frame boundary.
 */
const writeEvent = (
    response: Response,
    event: ObservabilityChannel,
    payload: ObservabilityMetricsPayload
) => {
    response.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
};

/**
 * Returns the current number of open SSE connections (used by observability payload itself).
 * Slightly self-referential on purpose: a leak in `sseClients` (connections added but never
 * removed) shows up as a climbing number on the dashboard those very connections feed.
 */
export const getActiveSseClients = (): number => sseClients.size;

/**
 * Builds a snapshot of current process/runtime metrics matching the asyncapi.yaml schema.
 * Merges Node.js memory stats with HTTP counters and realtime connection counts.
 */
export const buildObservabilityPayload = (): Promise<ObservabilityMetricsPayload> => {
    // Read synchronously before the async counter read, so all numbers in one frame describe
    // roughly the same instant. What each memory field means is documented where it is read.
    const snapshot = processSnapshot();
    return getHttpRequestCounters().then((counters) => ({
        // ISO-8601 so the client can compute its own clock skew and staleness.
        timestamp: new Date().toISOString(),
        uptimeSeconds: snapshot.uptimeSeconds,
        // Bytes, the same four fields the two REST endpoints publish. The client differences
        // consecutive frames, which is why nothing here is rounded to megabytes.
        memory: snapshot.memory,
        http: {
            // Cumulative since boot (see `getHttpRequestCounters`), so the *client* derives
            // rates by differencing consecutive frames.
            totalRequests: counters.totalRequests,
            totalErrors: counters.totalErrors
        },
        realtime: {
            sseClients: getActiveSseClients()
        }
    }));
};

/**
 * Fires-and-forgets a metrics event — errors are silently swallowed to avoid crashing the stream.
 *
 * Two failure modes are absorbed: a rejected metrics read, and a `write()` on a socket the
 * client has already dropped. Neither is worth tearing the stream down for, and an unhandled
 * rejection inside an interval callback would take the process with it.
 */
const writeMetricsEvent = (response: Response, eventName: ObservabilityChannel) => {
    // `void` marks the floating promise as deliberate — the interval must not wait on it.
    void buildObservabilityPayload()
        .then((payload) => {
            writeEvent(response, eventName, payload);
        })
        .catch(() => undefined);
};

/**
 * Opens an SSE stream on the given response: sets headers, sends an immediate snapshot,
 * then schedules periodic updates and heartbeats, cleaning up all intervals on close.
 */
export const streamObservabilityMetrics = (response: Response) => {
    response.status(200);
    // The MIME type that makes this an SSE stream — it is what tells the browser's `EventSource`
    // to parse frames incrementally instead of waiting for the body to end.
    response.setHeader('Content-Type', 'text/event-stream');
    // `no-cache` stops an intermediary from serving a stale snapshot; `no-transform` stops
    // proxies from gzipping/buffering the body, which would delay frames until the buffer fills.
    response.setHeader('Cache-Control', 'no-cache, no-transform');
    // Keep the TCP connection open — the response is intentionally never completed.
    response.setHeader('Connection', 'keep-alive');
    // Send the headers now, without any body. Express would otherwise hold them until the first
    // write, leaving the client waiting on an apparently unanswered request.
    response.flushHeaders();

    sseClients.add(response);
    // Send the first payload immediately so the client has data before the first interval fires.
    // Without it the dashboard would render empty for the first 5 seconds. A distinct
    // SNAPSHOT channel (vs UPDATED) lets the client treat it as an initial state.
    writeMetricsEvent(response, OBSERVABILITY_CHANNELS.METRICS_SNAPSHOT);

    // Periodic data push — the actual purpose of the stream.
    const updatesInterval = setInterval(() => {
        writeMetricsEvent(response, OBSERVABILITY_CHANNELS.METRICS_UPDATED);
    }, UPDATE_INTERVAL_MS);

    // Keep-alive on a separate, slower timer. It carries a real payload rather than an SSE
    // comment, so the client can also use it as a liveness signal.
    const heartbeatInterval = setInterval(() => {
        writeMetricsEvent(response, OBSERVABILITY_CHANNELS.HEARTBEAT);
    }, HEARTBEAT_INTERVAL_MS);

    // Cleanup when the client disconnects to avoid memory leaks and stale intervals.
    // Both are essential: uncleared intervals would keep writing to a dead socket forever, and
    // an un-deleted Set entry would pin the whole Response object in memory.
    const teardown = () => {
        clearInterval(updatesInterval);
        clearInterval(heartbeatInterval);
        sseClients.delete(response);
    };

    // 'close' fires on any disconnect — tab closed, navigation, network drop, proxy timeout.
    // It is the only reliable teardown hook, since the response never 'finish'es normally.
    response.on('close', teardown);
};
