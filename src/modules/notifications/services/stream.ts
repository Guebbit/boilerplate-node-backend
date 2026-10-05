/**
 * @module
 * Live delivery over Server-Sent Events, one stream per open tab, routed by user: a frame reaches
 * only the connections of the user it is about. The same plain-HTTP choice and the same pattern
 * as the observability stream — see `../../observability/services/stream.ts` for the reasoning —
 * with a `Map` keyed by user where that one holds a flat `Set`.
 *
 * Per process, like it: a message written in another worker process arrives at the next
 * `GET /notifications` instead. No broker fan-out ("no multi-host for now").
 *
 * See: docs/modules/notifications.md
 */

import type { Response } from 'express';
import type { NotificationsChannel, SseEventPayloadMap } from '@types';

/** User id → that user's open responses. A `Set` so a disconnect is O(1) and nothing is added twice. */
const connections = new Map<string, Set<Response>>();

/** Keep-alive cadence; idle proxies commonly drop a connection after 30-60s of silence. */
const HEARTBEAT_INTERVAL_MS = 15_000;

/**
 * How often an open stream re-proves its caller still holds the key that opened it. Revocation
 * lands on the next request everywhere else; a stream has no next request until this closes it.
 */
const REVERIFY_INTERVAL_MS = 30_000;

/**
 * Write one SSE frame. `event:` names the channel, `data:` carries single-line JSON, and the
 * trailing blank line ends the frame — omit it and the client buffers indefinitely.
 */
const writeFrame = <TChannel extends NotificationsChannel>(
    response: Response,
    event: TChannel,
    payload: SseEventPayloadMap[TChannel]
): void => {
    response.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
};

/**
 * Push one frame to every open stream of `userId`. A user with no open tab costs one map lookup.
 * A write to a socket the client already dropped is swallowed: its `close` handler is about to
 * remove it, and a throw here would fail the write that triggered the push.
 */
export const publishToUser = <TChannel extends NotificationsChannel>(
    userId: string,
    event: TChannel,
    payload: SseEventPayloadMap[TChannel]
): void => {
    for (const response of connections.get(userId) ?? [])
        // eslint-disable-next-line no-restricted-syntax -- a socket the client dropped must not fail the write that pushed to it
        try {
            writeFrame(response, event, payload);
        } catch {
            // The `close` handler removes it.
        }
};

/** How many streams are open across all users — for tests and gauges. */
export const openStreamCount = (): number =>
    [...connections.values()].reduce((total, set) => total + set.size, 0);

/**
 * Open a stream for `userId` on `response`: headers, then keep-alive and a periodic permission
 * recheck, all torn down when the client goes.
 *
 * @param reverify - re-answers "does this caller still hold the key that opened the stream",
 *   polled every {@link REVERIFY_INTERVAL_MS}. A plain callback so this file stays agnostic of how
 *   a caller is authenticated; the controller wires it to the refresh cookie.
 */
export const streamNotifications = (
    response: Response,
    userId: string,
    reverify: () => Promise<boolean>
): void => {
    response.status(200);
    // The MIME type that makes this an SSE stream for the browser's `EventSource`.
    response.setHeader('Content-Type', 'text/event-stream');
    // `no-transform` stops a proxy gzipping or buffering the body, which would hold frames back.
    response.setHeader('Cache-Control', 'no-cache, no-transform');
    response.setHeader('Connection', 'keep-alive');
    // Send the headers now, before any body, so the client sees the stream open.
    response.flushHeaders();

    const owned = connections.get(userId) ?? new Set<Response>();
    owned.add(response);
    connections.set(userId, owned);

    // A comment line (leading colon): keeps proxies from closing the connection, and an
    // `EventSource` ignores it, so a client handles no heartbeat event.
    const heartbeat = setInterval(() => {
        response.write(': keep-alive\n\n');
    }, HEARTBEAT_INTERVAL_MS);

    // Fails closed: a rejection is not "still allowed".
    const reverifyTimer = setInterval(() => {
        void reverify()
            .catch(() => false)
            .then((allowed) => {
                if (allowed) return;

                response.end();
                teardown();
            });
    }, REVERIFY_INTERVAL_MS);

    // Both timers and the map entry must go: a timer left running writes to a dead socket
    // forever, and a map entry left behind pins the whole response in memory.
    const teardown = () => {
        clearInterval(heartbeat);
        clearInterval(reverifyTimer);
        owned.delete(response);
        if (owned.size === 0) connections.delete(userId);
    };

    // 'close' fires on any disconnect — tab closed, navigation, network drop, proxy timeout.
    response.on('close', teardown);
};
