/**
 * The socket timeouts `src/app/security.ts` puts on the listening server.
 *
 * Slowloris and slow-POST are the one denial of service the rate limiter cannot see: it counts
 * REQUESTS, and these attacks send a fraction of one per connection. Node's defaults barely bound
 * them — 60s of headers, 300s of request — so the values here ARE the defence, and a regression to
 * "whatever Node ships" would be invisible in every other suite.
 */

import type { Server } from 'node:http';
import { applyServerTimeouts } from '@app/security';

/** Just the three fields `applyServerTimeouts` writes, seeded with Node's own defaults. */
const serverStub = () =>
    ({ headersTimeout: 60_000, requestTimeout: 300_000, keepAliveTimeout: 5000 }) as Server;

describe('applyServerTimeouts', () => {
    const overridden = [
        'NODE_HTTP_HEADERS_TIMEOUT_MS',
        'NODE_HTTP_REQUEST_TIMEOUT_MS',
        'NODE_HTTP_KEEP_ALIVE_TIMEOUT_MS'
    ] as const;

    afterEach(() => {
        for (const key of overridden) delete process.env[key];
    });

    it('bounds header receipt well below the 60s Node would otherwise allow', () => {
        const server = serverStub();

        applyServerTimeouts(server);

        expect(server.headersTimeout).toBe(15_000);
    });

    it('bounds the whole request well below the 300s Node would otherwise allow', () => {
        const server = serverStub();

        applyServerTimeouts(server);

        expect(server.requestTimeout).toBe(120_000);
    });

    it('leaves room for a slow upload rather than tightening the request to the header bound', () => {
        const server = serverStub();

        applyServerTimeouts(server);

        // `NODE_MAX_UPLOAD_BYTES` over a poor link needs most of this; a 408 mid-upload is worse
        // than the connection it costs.
        expect(server.requestTimeout).toBeGreaterThan(server.headersTimeout);
    });

    it('takes each bound from the environment when a deployment sets one', () => {
        process.env.NODE_HTTP_HEADERS_TIMEOUT_MS = '3000';
        process.env.NODE_HTTP_REQUEST_TIMEOUT_MS = '9000';
        process.env.NODE_HTTP_KEEP_ALIVE_TIMEOUT_MS = '72000';
        const server = serverStub();

        applyServerTimeouts(server);

        expect(server.headersTimeout).toBe(3000);
        expect(server.requestTimeout).toBe(9000);
        // Raised above a proxy's idle timeout — the reason this one is configurable at all.
        expect(server.keepAliveTimeout).toBe(72_000);
    });

    it('ignores an unusable value rather than disabling the bound it names', () => {
        // `0` would mean "no timeout" if it were honoured — the one value that must not pass.
        process.env.NODE_HTTP_HEADERS_TIMEOUT_MS = '0';
        process.env.NODE_HTTP_REQUEST_TIMEOUT_MS = 'soon';
        const server = serverStub();

        applyServerTimeouts(server);

        expect(server.headersTimeout).toBe(15_000);
        expect(server.requestTimeout).toBe(120_000);
    });
});
