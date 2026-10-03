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
import { setEnvironment } from '@tests/environment';

/** Just the three fields `applyServerTimeouts` writes, seeded with Node's own defaults. */
const serverStub = () =>
    ({ headersTimeout: 60_000, requestTimeout: 300_000, keepAliveTimeout: 5000 }) as Server;

describe('applyServerTimeouts', () => {
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
        setEnvironment({ NODE_HTTP_HEADERS_TIMEOUT_MS: '3000' });
        setEnvironment({ NODE_HTTP_REQUEST_TIMEOUT_MS: '9000' });
        setEnvironment({ NODE_HTTP_KEEP_ALIVE_TIMEOUT_MS: '72000' });
        const server = serverStub();

        applyServerTimeouts(server);

        expect(server.headersTimeout).toBe(3000);
        expect(server.requestTimeout).toBe(9000);
        // Raised above a proxy's idle timeout — the reason this one is configurable at all.
        expect(server.keepAliveTimeout).toBe(72_000);
    });

    it.each([
        ['0', 'NODE_HTTP_HEADERS_TIMEOUT_MS'],
        ['soon', 'NODE_HTTP_REQUEST_TIMEOUT_MS']
    ])('refuses %p rather than disabling the bound %s names', (value, variable) => {
        // `0` would mean "no timeout" if it were honoured — the one value that must not pass. It
        // is refused outright (at boot, by the gate), not quietly replaced by the default.
        setEnvironment({ [variable]: value });

        expect(() => applyServerTimeouts(serverStub())).toThrow(new RegExp(variable));
    });
});
