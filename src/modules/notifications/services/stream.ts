/**
 * @module
 * Live delivery over Server-Sent Events, one stream per open tab, routed by user: a frame reaches
 * only the connections of the user it is about. The same plain-HTTP choice and the same pattern
 * as the observability stream — see `../../observability/services/stream.ts` for the reasoning —
 * with a `Map` keyed by user where that one holds a flat `Set`.
 *
 * Across processes (copies, cluster workers, the cron container) the frame travels over Redis
 * pub/sub:
 *
 * Writer:    delivers to its own streams first, then publishes with its origin id.
 * Others:    every subscribed process delivers to its own streams and skips its own origin.
 * No Redis:  local only, as on one process; the next `GET /notifications` shows the rest.
 * Lost link: the local streams end with a `retry:` and the clients re-read their inbox.
 *
 * @see docs/modules/notifications.md#more-than-one-process
 */

import { randomUUID } from 'node:crypto';
import type { Response } from 'express';
import { z } from 'zod';
import { publishMessage, subscribeToChannel } from '@infrastructure/adapters/pubsub';
import { openSseStream } from '@infrastructure/http/sse';
import { NOTIFICATIONS_CHANNELS, type NotificationsChannel, type SseEventPayloadMap } from '@types';

/** One open stream of this process: where to write, and how to end it. */
interface OpenStream {
    /** The held response. */
    response: Response;
    /** Ends it with a reconnect delay for the client. */
    end: () => void;
}

/** User id → that user's open streams. A `Set` so a disconnect is O(1) and nothing is added twice. */
const connections = new Map<string, Set<OpenStream>>();

/** The pub/sub channel every process publishes to and listens on. */
const FANOUT_CHANNEL = 'notifications';

/** Who this process is on the channel, so it can skip its own messages coming back. */
const originId = randomUUID();

/**
 * What crosses the channel: whose streams, which event, and the payload exactly as the writer
 * sent it. The payload stays `unknown`: it is written out as JSON, never read here.
 */
const fanoutMessageSchema = z.object({
    origin: z.string(),
    userId: z.string(),
    event: z.enum(NOTIFICATIONS_CHANNELS),
    payload: z.unknown()
});

/** Keep-alive cadence; idle proxies commonly drop a connection after 30-60s of silence. */
const HEARTBEAT_INTERVAL_MS = 15_000;

/**
 * Write one SSE frame. `event:` names the channel, `data:` carries single-line JSON, and the
 * trailing blank line ends the frame — omit it and the client buffers indefinitely.
 */
const writeFrame = (response: Response, event: NotificationsChannel, payload: unknown): void => {
    response.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
};

/**
 * Write one frame to every open stream of `userId` in THIS process. A user with no open tab costs
 * one map lookup. A write to a socket the client already dropped is swallowed: its `close` handler
 * is about to remove it, and a throw here would fail the write that triggered the push.
 */
const deliverLocally = (userId: string, event: NotificationsChannel, payload: unknown): void => {
    for (const { response } of connections.get(userId) ?? [])
        // eslint-disable-next-line no-restricted-syntax -- a socket the client dropped must not fail the write that pushed to it
        try {
            writeFrame(response, event, payload);
        } catch {
            // The `close` handler removes it.
        }
};

/**
 * Push one frame to every open stream of `userId`, in this process and in every other one: the
 * local streams first (no round trip, and the only path without Redis), then the channel for the
 * rest. Publishing is fire-and-forget: a Redis outage costs the other processes this frame, never
 * the write that triggered it.
 */
export const publishToUser = <TChannel extends NotificationsChannel>(
    userId: string,
    event: TChannel,
    payload: SseEventPayloadMap[TChannel]
): void => {
    deliverLocally(userId, event, payload);
    publishMessage(FANOUT_CHANNEL, JSON.stringify({ origin: originId, userId, event, payload }));
};

/**
 * One message from the channel: deliver it to this process's streams unless this process wrote it.
 * Anything that is not a well-formed message is dropped; the channel is shared with nothing, so a
 * bad one is a bug on the sending side, not something to fail a subscriber over.
 *
 * @param text - the raw message
 */
const onFanoutMessage = (text: string): void => {
    let json: unknown;
    // eslint-disable-next-line no-restricted-syntax -- JSON.parse throws synchronously on a message that is not JSON
    try {
        json = JSON.parse(text);
    } catch {
        return;
    }
    const parsed = fanoutMessageSchema.safeParse(json);
    if (!parsed.success || parsed.data.origin === originId) return;
    deliverLocally(parsed.data.userId, parsed.data.event, parsed.data.payload);
};

/**
 * The link to the other processes is gone, and with it every frame published since: end the local
 * streams so each client reconnects (after its jittered `retry:`) and re-reads its inbox, the one
 * source that did not miss anything.
 */
const endEveryStream = (): void => {
    // Each end removes itself from its set; deleting the entry being iterated is defined for a Set and a Map.
    for (const owned of connections.values()) for (const { end } of owned) end();
};

/** How many streams are open across all users — for tests and gauges. */
export const openStreamCount = (): number =>
    [...connections.values()].reduce((total, set) => total + set.size, 0);

/**
 * Open a stream for `userId` on `response`: headers, then keep-alive and a periodic permission
 * recheck, all torn down when the client goes.
 *
 * @param reverify - re-answers "does this caller still hold the key that opened the stream",
 *   polled by `openSseStream`. A plain callback so this file stays agnostic of how
 *   a caller is authenticated; the controller wires it to the refresh cookie.
 */
export const streamNotifications = (
    response: Response,
    userId: string,
    reverify: () => Promise<boolean>
): void => {
    const stream = openSseStream(response, userId, reverify);
    // A cap refused the open and already answered; nothing to register.
    if (!stream) return;

    const open: OpenStream = { response, end: stream.end };
    const owned = connections.get(userId) ?? new Set<OpenStream>();
    owned.add(open);
    connections.set(userId, owned);

    // Listening for the other processes starts with the first stream and is retried by each later one; it never rejects (Redis off or down resolves `false`).
    subscribeToChannel(FANOUT_CHANNEL, onFanoutMessage, endEveryStream).catch(() => false);

    /**
     * A comment line (leading colon): keeps proxies from closing the connection, and an
     * `EventSource` ignores it, so a client handles no heartbeat event.
     */
    const heartbeat = setInterval(() => {
        response.write(': keep-alive\n\n');
    }, HEARTBEAT_INTERVAL_MS);

    /**
     * The timer and the map entry must go: a timer left running writes to a dead socket
     * forever, and a map entry left behind pins the whole response in memory.
     */
    stream.onClose(() => {
        clearInterval(heartbeat);
        owned.delete(open);
        if (owned.size === 0) connections.delete(userId);
    });
};
