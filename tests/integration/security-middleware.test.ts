/**
 * Two properties of `src/app/security.ts` that nothing else asserts: helmet's headers reach an
 * ordinary API response, and a spoofed `X-Forwarded-For` buys no fresh rate-limit bucket when
 * `NODE_TRUST_PROXY_HOPS` is `0` (the deployment default).
 *
 * The trust-proxy case drives the real app, unlike `identity-rate-limit.test.ts`'s address-block
 * cases: those prove a limiter's own budget arithmetic against a trivial harness with
 * `appAnswering`'s `trustProxyHop` set by the test, which is a property of `express-rate-limit`,
 * not of this repo's code. This file's job is proving `src/app/security.ts` itself applied
 * `NODE_TRUST_PROXY_HOPS`, which only the real, fully-wired app can show.
 *
 * See: docs/tools/security.md
 */
import { api } from '@tests/http';

describe('helmet', () => {
    /*
     * One case on a plain API response, not a full-set assertion — that breaks on every helmet
     * upgrade and teaches nothing. `upload-security.test.ts` already covers the STATIC asset path,
     * which `src/app/static-assets.ts` configures deliberately differently (a relaxed
     * `Cross-Origin-Resource-Policy`); this is the gap, the ordinary JSON path.
     */
    it('sets its headers on an ordinary API response', async () => {
        const response = await api().get('/');

        expect(response.headers['x-content-type-options']).toBe('nosniff');
        expect(response.headers).toHaveProperty('x-frame-options');
        expect(response.headers).not.toHaveProperty('x-powered-by');
    });
});

describe('trust proxy', () => {
    /**
     * Drives the REAL app, not a narrower header — the property under test is what
     * `src/app/security.ts` does with `NODE_TRUST_PROXY_HOPS`, and a synthetic app built with
     * Express's own default (`trust proxy` unset) would pass whether or not that code ran at
     * all. The global `rateLimiter` (`src/app/security.ts:207`) is mounted ahead of every route
     * and keys its bucket on `request.ip` with no override, so its `RateLimit-Remaining` header
     * is a direct read on what Express resolved `request.ip` to.
     *
     * Two requests, two DIFFERENT forged `X-Forwarded-For` values, from the one real socket
     * address this test process holds: if `X-Forwarded-For` were consulted, each would open its
     * own fresh bucket and `remaining` would not move between them. It drops by exactly one
     * instead — both spent the same bucket, the real socket address, because
     * `NODE_TRUST_PROXY_HOPS=0` (this repo's test and production default) never reads the header.
     */
    it('does not let a forged X-Forwarded-For move the caller to a fresh rate-limit bucket', async () => {
        const first = await api().get('/').set('X-Forwarded-For', '203.0.113.5');
        const second = await api().get('/').set('X-Forwarded-For', '198.51.100.9');

        const remaining = (response: Awaited<typeof first>) =>
            Number(response.headers['ratelimit-remaining']);

        expect(remaining(second)).toBe(remaining(first) - 1);
    });
});
