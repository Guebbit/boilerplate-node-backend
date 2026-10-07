/**
 * @module
 * The one outbound path for a URL a user or a provider supplied: SSRF-checked, DNS-pinned, never
 * redirected. Webhook delivery and the avatar download both go through it.
 *
 * Why its own file: `ssrf-guard.ts` is mocked whole by `remote-image.test.ts`, and keeping the
 * request here keeps that seam.
 *
 * See: docs/theory/defences/ssrf.md
 */

import type { IncomingMessage, OutgoingHttpHeaders } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { resolveSafeOutboundTarget } from '@infrastructure/adapters/ssrf-guard';

/** What one pinned request sends. */
export interface PinnedHttpsRequestOptions {
    /** HTTP method, e.g. `GET` or `POST`. */
    method: string;
    /** Request headers, when the call needs any. */
    headers?: OutgoingHttpHeaders;
    /** Request body, written as given; its `content-length` is the caller's to set. */
    body?: string;
    /** The caller's total budget: aborts DNS resolution, the connection and the response wait. */
    signal: AbortSignal;
}

/**
 * Send one HTTPS request to a user-supplied URL.
 *
 * Order:    the guard resolves and validates the host FIRST, then the socket is pinned to that
 *           address, so a second DNS answer can never reach a private range.
 * Redirect: never followed; a 3xx comes back as an ordinary response for the caller to refuse.
 * Body:     the response is NOT read here; the caller drains or caps it.
 *
 * @param rawUrl - the url as supplied; only `https:` passes the guard
 * @param options - method, headers, body and the caller's abort signal
 * @returns the response, once its headers have arrived
 * @throws {SsrfRefusedError} (as a rejection) when the guard refuses the url
 */
export const pinnedHttpsRequest = (
    rawUrl: string,
    { method, headers, body, signal }: PinnedHttpsRequestOptions
): Promise<IncomingMessage> =>
    resolveSafeOutboundTarget(rawUrl, signal).then(
        (target) =>
            new Promise<IncomingMessage>((resolve, reject) => {
                const url = new URL(rawUrl);
                /*
                 * node:https request(options, callback)
                 * https://nodejs.org/api/https.html#httpsrequestoptions-callback
                 *  - `hostname`: the ORIGINAL host, not the pinned IP, so TLS SNI and certificate
                 *    verification check the name; only the socket's address is pinned.
                 *  - `lookup`: the guard's pin, always answering the one validated address.
                 *  - `signal`: the caller's budget; abort destroys the request ('AbortError').
                 */
                const outgoing = httpsRequest(
                    {
                        hostname: target.hostname,
                        port: url.port ? Number(url.port) : 443,
                        path: `${url.pathname}${url.search}`,
                        method,
                        headers,
                        lookup: target.lookup,
                        signal
                    },
                    resolve
                );
                outgoing.on('error', reject);
                outgoing.end(body);
            })
    );
