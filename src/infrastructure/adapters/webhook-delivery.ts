/**
 * @module
 * One outbound webhook delivery attempt: SSRF-check, sign, POST, time out — the one function a
 * worker calls to turn a queued delivery into an HTTP request and a recorded outcome.
 *
 * `deliverWebhook` never rejects. Every path — a refused URL, a DNS failure, a timeout, a network
 * error, a non-2xx response — resolves to a {@link WebhookDeliveryResult} with `success: false` and
 * a human-readable `.error`, so a worker can always write a delivery-log row, never crash on one.
 *
 * Built on `node:http`/`node:https` rather than a client library: the two properties this delivery
 * cannot do without — a custom `lookup` (DNS pinning, from `./ssrf-guard.ts`) and no automatic
 * redirect following — are exactly the two both give directly. A 3xx response is read as a failed
 * delivery below; it is never followed, which is what makes "refuse redirects entirely"
 * (`./ssrf-guard.ts`'s documented split) actually true rather than aspirational.
 *
 * `node:http` only ever runs for `./ssrf-guard.ts`'s one exempted development/test demo host —
 * every other target already failed the `https:` check before a request module is even chosen.
 */

import { request as httpsRequest } from 'node:https';
import { request as httpRequest, type IncomingMessage } from 'node:http';
import {
    resolveSafeWebhookTarget,
    SsrfRefusedError,
    type SafeWebhookTarget
} from '@infrastructure/adapters/ssrf-guard';
import {
    signWebhookPayload,
    type WebhookSignatureHeaders
} from '@infrastructure/adapters/webhook-signing';

/** Hard total budget for one attempt — DNS resolution through the last response byte. */
const DEFAULT_TIMEOUT_MS = 10_000;

/** One delivery a worker asks this module to make. */
export interface WebhookDeliveryAttempt {
    /** The subscription's endpoint. Validated and pinned by `./ssrf-guard.ts` before any request. */
    url: string;
    /** The active secret ring, plaintext — already decrypted by the caller; this file signs only. */
    secrets: string[];
    /** The event/delivery id, sent as `webhook-id` and folded into the signature. */
    eventId: string;
    /** Serialized exactly once, here — the bytes signed are always the bytes sent. */
    payload: unknown;
    /** Overrides {@link DEFAULT_TIMEOUT_MS}. */
    timeoutMs?: number;
    /** Passed straight through to `./ssrf-guard.ts`'s `resolveSafeWebhookTarget`. */
    allowedInsecureHost?: string;
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

/** The bare status this module reads off a response; the body is drained, never parsed. */
interface RawResponse {
    statusCode: number;
}

/**
 * POST the signed body to a pinned target.
 *
 * node:https — https.request(options, callback): https://nodejs.org/api/https.html#httpsrequestoptions-callback
 * (node:http's `request` takes the identical options shape for everything used here)
 *  - `lookup`: DNS pinning from `./ssrf-guard.ts` — the connection is made to the address that was
 *    already validated, not to whatever a second resolution would answer.
 *  - `hostname` stays the ORIGINAL host (not the pinned IP): TLS SNI and certificate hostname
 *    verification must check against the name the operator configured, only the IP the socket
 *    connects to is pinned. Irrelevant to a plain `http:` request, but harmless to still pass.
 *  - `signal`: the hard total timeout — `request.destroy()` fires on abort, surfaced below as the
 *    request's `error` event with `err.name === 'AbortError'`.
 *  - No redirect handling: this call answers with whatever status the endpoint sent, 3xx included,
 *    and `deliverWebhook` below treats 3xx as a failure rather than a location to chase.
 *
 * `url.protocol` decides `node:http` vs `node:https` — `./ssrf-guard.ts` has already refused
 * every `http:` target except its one exempted demo host, so this never opens a plaintext
 * connection anywhere else.
 *
 * @param target - the pinned, already-validated destination from `resolveSafeWebhookTarget`
 * @param url - the parsed subscription URL, for the scheme/path/query/port `lookup` cannot supply
 * @param headers - the three `webhook-*` headers from `signWebhookPayload`
 * @param body - the exact signed bytes
 * @param timeoutMs - hard total budget for connect + request + response headers
 */
const postSignedPayload = (
    target: SafeWebhookTarget,
    url: URL,
    headers: WebhookSignatureHeaders,
    body: string,
    timeoutMs: number
): Promise<RawResponse> =>
    new Promise((resolve, reject) => {
        const isPlainHttp = url.protocol === 'http:';
        const request = isPlainHttp ? httpRequest : httpsRequest;
        const outgoingRequest = request(
            {
                hostname: target.hostname,
                port: url.port ? Number(url.port) : isPlainHttp ? 80 : 443,
                path: `${url.pathname}${url.search}`,
                method: 'POST',
                lookup: target.lookup,
                headers: {
                    'content-type': 'application/json',
                    'content-length': Buffer.byteLength(body),
                    ...headers
                },
                signal: AbortSignal.timeout(timeoutMs)
            },
            (incomingResponse: IncomingMessage) => {
                // Only the status is used — draining rather than reading keeps the socket from
                // backing up on an endpoint that sends a body nobody asked for.
                incomingResponse.resume();
                resolve({ statusCode: incomingResponse.statusCode ?? 0 });
            }
        );

        outgoingRequest.on('error', reject);
        outgoingRequest.end(body);
    });

/**
 * Turn whatever failed this attempt into the one line a delivery log reads.
 *
 * @param error - the chain's rejection: an {@link SsrfRefusedError}, an abort, or a network error
 */
const describeDeliveryError = (error: unknown): string => {
    if (error instanceof SsrfRefusedError) return `Refused (${error.reason}): ${error.message}`;
    if (error instanceof Error && error.name === 'AbortError') return 'Delivery timed out';
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

    return resolveSafeWebhookTarget(attempt.url, attempt.allowedInsecureHost)
        .then((target) => {
            const body = JSON.stringify(attempt.payload);
            const { headers } = signWebhookPayload({
                id: attempt.eventId,
                body,
                secrets: attempt.secrets
            });
            return postSignedPayload(target, new URL(attempt.url), headers, body, timeoutMs);
        })
        .then((response): WebhookDeliveryResult => {
            const durationMs = Date.now() - startedAt;
            if (response.statusCode >= 200 && response.statusCode < 300)
                return { success: true, statusCode: response.statusCode, durationMs };

            const isRedirect = response.statusCode >= 300 && response.statusCode < 400;
            return {
                success: false,
                statusCode: response.statusCode,
                durationMs,
                error: isRedirect
                    ? `Endpoint answered ${response.statusCode}; redirects are never followed`
                    : `Endpoint answered ${response.statusCode}`
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
