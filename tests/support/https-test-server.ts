/**
 * A real, local HTTPS listener a test starts and stops itself — what
 * `docs/modules/webhooks.md`'s integration suite needs to prove a delivery arrived signed, without
 * ever pointing at the compose `webhook-tester` service.
 *
 * The certificate (`fixtures/localhost-test-{cert,key}.pem`) is a throwaway, self-signed pair for
 * `CN=localhost` / `127.0.0.1`, committed so no suite depends on `openssl` being on the machine
 * that runs it. It is not trusted by any real client — `NODE_TLS_REJECT_UNAUTHORIZED=0` does NOT
 * fix this: Node reads it at process bootstrap, before a test file's own top-level code runs, so
 * setting it from inside a suite has no effect (verified against this exact fixture). The fix that
 * actually works is per-request: a caller mocks `node:https` to inject `{ ca: [TEST_CA_CERT] }`
 * into every real request, e.g.
 *
 * ```ts
 * jest.mock('node:https', () => {
 *     const actual = jest.requireActual('node:https');
 *     return { ...actual, request: (options, callback) => actual.request({ ...options, ca: [TEST_CA_CERT] }, callback) };
 * });
 * ```
 *
 * — see `modules/webhooks/tests/integration/delivery.test.ts` for the full pairing, ssrf-guard
 * mock included (a real local listener is inherently on loopback, which the real guard correctly
 * always refuses — that mock is unrelated to TLS and stays separate).
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createServer, type Server } from 'node:https';

/** This fixture's own cert, as the `ca` array entry a caller's `node:https` mock injects. */
export const TEST_CA_CERT: Buffer = readFileSync(
    path.join(__dirname, 'fixtures', 'localhost-test-cert.pem')
);

/** One captured request the test server received, headers and raw body both. */
export interface CapturedRequest {
    headers: Record<string, string | string[] | undefined>;
    body: string;
}

/** A running test server and the means to stop it and read what it captured. */
export interface HttpsTestServer {
    /** `https://127.0.0.1:<port>` — pass a path-appended form of this as a subscription's `url`. */
    url: string;
    /** Every request received so far, oldest first. */
    requests: () => CapturedRequest[];
    /** Stop listening and free the port. */
    close: () => Promise<void>;
}

/** Read the whole request body before handing the request to the caller's responder. */
const readBody = (request: IncomingMessage): Promise<string> =>
    new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        request.on('data', (chunk: Buffer) => chunks.push(chunk));
        request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        request.on('error', reject);
    });

/**
 * Start a local HTTPS server on an OS-assigned port, capturing every request and answering each
 * with `respond`.
 *
 * @param respond - given the response object, decide the status/body for the NEXT request — e.g.
 *   `(res) => res.writeHead(200).end()`, or a closure that answers differently attempt to attempt
 *   for a retry test.
 */
export const startHttpsTestServer = (
    respond: (response: ServerResponse) => void
): Promise<HttpsTestServer> => {
    const captured: CapturedRequest[] = [];

    // node:https.createServer: https://nodejs.org/api/https.html#httpscreateserveroptions-requestlistener
    // `key`/`cert` are this file's throwaway localhost pair — see the module docblock.
    const server: Server = createServer(
        {
            key: readFileSync(path.join(__dirname, 'fixtures', 'localhost-test-key.pem')),
            cert: readFileSync(path.join(__dirname, 'fixtures', 'localhost-test-cert.pem'))
        },
        (request, response) => {
            void readBody(request).then((body) => {
                captured.push({ headers: request.headers, body });
                respond(response);
            });
        }
    );

    return new Promise((resolve, reject) => {
        server.on('error', reject);
        // Port 0: ask the OS for a free one, read it back off `.address()` once bound.
        server.listen(0, '127.0.0.1', () => {
            const address = server.address();
            if (!address || typeof address === 'string') {
                reject(new Error('https test server did not bind to a TCP port'));
                return;
            }

            resolve({
                url: `https://127.0.0.1:${address.port}`,
                requests: () => [...captured],
                close: () => new Promise((res) => server.close(() => res()))
            });
        });
    });
};
