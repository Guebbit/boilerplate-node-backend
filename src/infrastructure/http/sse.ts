/**
 * @module
 * The part of a Server-Sent Events stream every stream shares: the headers, the fail-closed
 * permission recheck and the teardown. What each stream writes (frames, heartbeat) and what it
 * tracks (its connection registry) stay with the module that owns the stream.
 *
 * See: docs/theory/defences/real-time.md
 */

import type { Response } from 'express';

/**
 * How often an open stream re-proves its caller still holds the key that opened it. Revocation
 * lands on the next request everywhere else; a stream has no next request until this closes it.
 */
const REVERIFY_INTERVAL_MS = 30_000;

/**
 * An opened stream, as its owner sees it.
 */
export interface SseStream {
    /**
     * Register cleanup to run once, when the stream ends: client gone or access revoked.
     * @param cleanup - clears the owner's timers and removes the response from its registry
     */
    onClose: (cleanup: () => void) => void;
}

/**
 * Open an SSE stream: headers, flush, and a recheck that ends the stream when access is lost.
 *
 * @param response - the response to hold open
 * @param reverify - re-answers "does this caller still hold the key that opened the stream". A
 *   plain callback so this file stays agnostic of how a caller is authenticated. A rejection
 *   counts as "no": an error is not "still allowed".
 * @returns the handle to register cleanup on
 */
export const openSseStream = (response: Response, reverify: () => Promise<boolean>): SseStream => {
    response.status(200);
    // The MIME type that makes this an SSE stream for the browser's `EventSource`.
    response.setHeader('Content-Type', 'text/event-stream');
    // `no-transform` stops a proxy gzipping or buffering the body, which would hold frames back.
    response.setHeader('Cache-Control', 'no-cache, no-transform');
    response.setHeader('Connection', 'keep-alive');
    // Send the headers now, before any body, so the client sees the stream open.
    response.flushHeaders();

    const cleanups: (() => void)[] = [];
    let closed = false;

    // Idempotent: a revoked stream ends itself, and its `close` event then fires teardown again.
    const teardown = () => {
        if (closed) return;
        closed = true;
        clearInterval(reverifyTimer);
        for (const cleanup of cleanups) cleanup();
    };

    const reverifyTimer = setInterval(() => {
        void reverify()
            .catch(() => false)
            .then((allowed) => {
                if (allowed) return;

                response.end();
                teardown();
            });
    }, REVERIFY_INTERVAL_MS);

    // 'close' fires on any disconnect — tab closed, navigation, network drop, proxy timeout.
    response.on('close', teardown);

    return {
        onClose: (cleanup) => {
            cleanups.push(cleanup);
        }
    };
};
