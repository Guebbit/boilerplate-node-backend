/**
 * @module
 * The part of a Server-Sent Events stream every stream shares: the headers, the fail-closed
 * permission recheck and the teardown. What each stream writes (frames, heartbeat) and what it
 * tracks (its connection registry) stay with the module that owns the stream.
 *
 * See: docs/understand/defences/real-time.md
 */

import type { Response } from 'express';
import { sseConfig } from '@infrastructure/http/config';
import { rejectServiceUnavailable } from '@infrastructure/http/errors';
import { generateRateLimited, rejectResponse } from '@infrastructure/http/response';

/**
 * How often an open stream re-proves its caller still holds the key that opened it. Revocation
 * lands on the next request everywhere else; a stream has no next request until this closes it.
 */
const REVERIFY_INTERVAL_MS = 30_000;

/**
 * What a refused per-account open tells the client to wait, seconds. The FE client backs off to
 * 30 s on its own; this is the same ceiling.
 */
const PER_USER_RETRY_AFTER_SECONDS = 30;

/** User id to how many streams that user holds open in this process. */
const openPerUser = new Map<string, number>();

/** Streams open in this process, all users. */
let openTotal = 0;

/**
 * Take a slot for `userId`, or answer the refusal on `response`: 503 when the process is full
 * (the server's limit), 429 when this account holds its share.
 *
 * @returns whether a slot was taken
 */
const admit = (response: Response, userId: string): boolean => {
    const limits = sseConfig();
    if (openTotal >= limits.NODE_SSE_MAX_STREAMS) {
        rejectServiceUnavailable(response);
        return false;
    }
    const held = openPerUser.get(userId) ?? 0;
    if (held >= limits.NODE_SSE_MAX_STREAMS_PER_USER) {
        rejectResponse(response, 429, generateRateLimited(PER_USER_RETRY_AFTER_SECONDS).errors);
        return false;
    }
    openPerUser.set(userId, held + 1);
    openTotal += 1;
    return true;
};

/** Give back the slot `admit` took. */
const release = (userId: string): void => {
    const held = openPerUser.get(userId) ?? 0;
    if (held <= 1) openPerUser.delete(userId);
    else openPerUser.set(userId, held - 1);
    openTotal -= 1;
};

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
 * @param userId - whose stream it is, for the per-account cap
 * @param reverify - re-answers "does this caller still hold the key that opened the stream". A
 *   plain callback so this file stays agnostic of how a caller is authenticated. A rejection
 *   counts as "no": an error is not "still allowed".
 * @returns the handle to register cleanup on, or `undefined` when a cap refused the open: the
 *   429/503 is already sent, and the caller must return without registering anything
 */
export const openSseStream = (
    response: Response,
    userId: string,
    reverify: () => Promise<boolean>
): SseStream | undefined => {
    if (!admit(response, userId)) return undefined;
    response.status(200);
    // The MIME type that makes this an SSE stream for the browser's `EventSource`.
    response.setHeader('Content-Type', 'text/event-stream');
    // no-store:     one caller's live data, cookie-authenticated, which RFC 9111 §3.5 does not
    //               protect; the browser's own `EventSource` asks for `no-store` as well.
    // no-transform: stops a proxy gzipping or buffering the body, which would hold frames back.
    response.setHeader('Cache-Control', 'no-store, no-transform');
    response.setHeader('Connection', 'keep-alive');
    // Send the headers now, before any body, so the client sees the stream open.
    response.flushHeaders();

    const cleanups: (() => void)[] = [];
    let closed = false;

    // Idempotent, so the slot is freed once: a revoked stream ends itself, and its `close` event then fires teardown again.
    const teardown = () => {
        if (closed) return;
        closed = true;
        release(userId);
        clearInterval(reverifyTimer);
        for (const cleanup of cleanups) cleanup();
    };

    // Ends the stream from our side. A rejected re-check also lands here: it counts as "no longer allowed".
    const endStream = () => {
        response.end();
        teardown();
    };

    const reverifyTimer = setInterval(() => {
        reverify()
            .then((allowed) => {
                if (!allowed) endStream();
            })
            .catch(endStream);
    }, REVERIFY_INTERVAL_MS);

    // 'close' fires on any disconnect — tab closed, navigation, network drop, proxy timeout.
    response.on('close', teardown);

    return {
        onClose: (cleanup) => {
            cleanups.push(cleanup);
        }
    };
};
