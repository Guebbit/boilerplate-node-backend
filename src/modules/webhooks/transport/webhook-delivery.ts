/**
 * @module
 * One outbound webhook delivery attempt: SSRF-check, sign, POST, time out — the one function a
 * worker calls to turn a queued delivery into an HTTP request and a recorded outcome.
 *
 * `deliverWebhook` never rejects. Every path — a refused URL, a DNS failure, a timeout, a network
 * error, a non-2xx response — resolves to a {@link WebhookDeliveryResult} with `success: false` and
 * a human-readable `.error`, so a worker can always write a delivery-log row, never crash on one.
 *
 * Built on `node:https` rather than a client library: the two properties this delivery cannot do
 * without — a custom `lookup` (DNS pinning, from `@infrastructure/adapters/ssrf-guard`) and no
 * automatic redirect following — are exactly the two it gives directly. A 3xx response is read as
 * a failed delivery below; it is never followed, which is what makes "refuse redirects entirely"
 * (`ssrf-guard.ts`'s documented split) actually true rather than aspirational.
 *
 * Always TLS: `ssrf-guard.ts` refuses every non-`https:` URL, the demo host included.
 */

import { pinnedHttpsRequest } from '@infrastructure/adapters/pinned-https';
import { SsrfRefusedError } from '@infrastructure/adapters/ssrf-guard';
import { logger } from '@infrastructure/adapters/logger';
import { signWebhookPayload } from './webhook-signing';

/** What a tenant reads when the SSRF guard refused its URL; the reason goes to the log only. */
const SSRF_REFUSED_TEXT = 'This URL cannot receive webhooks.';

/** Hard total budget for one attempt — DNS resolution through the last response byte. */
const DEFAULT_TIMEOUT_MS = 10_000;

/** One delivery a worker asks this module to make. */
export interface WebhookDeliveryAttempt {
    /** The subscription's endpoint. Validated and pinned by `ssrf-guard.ts` before any request. */
    url: string;
    /** The active secret ring, plaintext — already decrypted by the caller; this file signs only. */
    secrets: string[];
    /** The event/delivery id, sent as `webhook-id` and folded into the signature. */
    eventId: string;
    /** Serialized exactly once, here — the bytes signed are always the bytes sent. */
    payload: unknown;
    /** Overrides {@link DEFAULT_TIMEOUT_MS}. */
    timeoutMs?: number;
}

/** What happened, in the shape a delivery-log row is written from. */
export interface WebhookDeliveryResult {
    /** `true` only for a 2xx response. */
    success: boolean;
    /** The response status, when a response was received at all. */
    statusCode?: number;
    /** Wall-clock time for the whole attempt. */
    durationMs: number;
    /** Present when `success` is false — an SSRF refusal, a DNS failure, a timeout, or the status. */
    error?: string;
}

/** Whichever `.name` a rejection carries, read without requiring `instanceof Error` — see below. */
const errorName = (error: unknown): string | undefined =>
    typeof error === 'object' &&
    error !== null &&
    typeof (error as { name?: unknown }).name === 'string'
        ? (error as { name: string }).name
        : undefined;

/**
 * Turn whatever failed this attempt into the one line a delivery log reads.
 *
 * @param error - the chain's rejection: an {@link SsrfRefusedError}, an abort, or a network error
 */
const describeDeliveryError = (error: unknown): string => {
    // The delivery log is shown to the tenant: it gets a fixed line, never the reason or the
    // resolved address. Network errors below stay detailed — a tenant debugs its own endpoint.
    if (error instanceof SsrfRefusedError) {
        logger.warn({
            message: 'A webhook delivery was refused by the SSRF guard.',
            reason: error.reason,
            detail: error.message
        });
        return SSRF_REFUSED_TEXT;
    }
    // 'AbortError' is the POST phase (`pinnedHttpsRequest`'s `signal` option, Node's own naming);
    // 'TimeoutError' is the DNS phase (`ssrf-guard.ts`'s `rejectOnAbort`, `signal.reason` itself,
    // a `DOMException` — `AbortSignal.timeout`'s own name for its reason). Read via `errorName`,
    // not `error instanceof Error`: under Jest's VM sandboxing that `DOMException` fails
    // `instanceof` this file's own `Error` (a cross-realm mismatch) despite genuinely being one.
    const name = errorName(error);
    if (name === 'AbortError' || name === 'TimeoutError') return 'Delivery timed out';
    if (error instanceof Error) return error.message;
    return 'Unknown delivery error';
};

/**
 * Sign, SSRF-check, POST, and time out — one attempt, always resolved.
 *
 * Chained rather than `async`/`await`: every step here is a `.then` away from the last, and moving
 * `JSON.stringify` inside the first `.then` means even a circular payload's synchronous throw
 * becomes a rejection the trailing `.catch` already handles — no separate `try`/`catch` needed.
 */
export const deliverWebhook = (attempt: WebhookDeliveryAttempt): Promise<WebhookDeliveryResult> => {
    const startedAt = Date.now();
    const timeoutMs = attempt.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    // One signal for the whole attempt, DNS resolution included — see `ssrf-guard.ts`'s own
    // `signal` parameter docblock for why the resolver needs it too.
    const signal = AbortSignal.timeout(timeoutMs);

    return Promise.resolve()
        .then(() => {
            const body = JSON.stringify(attempt.payload);
            const { headers } = signWebhookPayload({
                id: attempt.eventId,
                body,
                secrets: attempt.secrets
            });
            return pinnedHttpsRequest(attempt.url, {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    'content-length': Buffer.byteLength(body),
                    ...headers
                },
                body,
                signal
            });
        })
        .then((response): WebhookDeliveryResult => {
            // Only the status is used — draining rather than reading keeps the socket from
            // backing up on an endpoint that sends a body nobody asked for.
            response.resume();
            const statusCode = response.statusCode ?? 0;
            const durationMs = Date.now() - startedAt;
            if (statusCode >= 200 && statusCode < 300)
                return { success: true, statusCode, durationMs };

            const isRedirect = statusCode >= 300 && statusCode < 400;
            return {
                success: false,
                statusCode,
                durationMs,
                error: isRedirect
                    ? `Endpoint answered ${statusCode}; redirects are never followed`
                    : `Endpoint answered ${statusCode}`
            };
        })
        .catch(
            (error: unknown): WebhookDeliveryResult => ({
                success: false,
                durationMs: Date.now() - startedAt,
                error: describeDeliveryError(error)
            })
        );
};
