/**
 * Two properties of `src/app/security.ts` that nothing else asserts: helmet's headers reach an
 * ordinary API response, and a spoofed `X-Forwarded-For` buys no rate-limit budget when
 * `NODE_TRUST_PROXY_HOPS` is `0` (the deployment default).
 *
 * The trust-proxy case does not restate `identity-rate-limit.test.ts`'s address-block cases —
 * those prove the OPPOSITE property on purpose, with `appAnswering`'s `trustProxyHop` set to
 * `true`. This is the same harness with it left `false`, which is what `app.set('trust proxy', 0)`
 * means to Express: `request.ip` is the socket address, and `X-Forwarded-For` is never read.
 *
 * See: docs/tools/security.md
 */
import supertest from 'supertest';
import { api } from '@tests/http';
import { appAnswering, statusOf, withReloadedRateLimits } from '@tests/rate-limit-harness';

/** {@link withReloadedRateLimits} bound to this file's one module. */
const withAccountRateLimits = <T>(
    overrides: Record<string, string>,
    pick: (rateLimitsModule: typeof import('@modules/account/rate-limits')) => T
): Promise<T> =>
    withReloadedRateLimits(() => import('@modules/account/rate-limits'), overrides, pick);

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
    afterEach(() => jest.resetModules());

    it('does not let a forged X-Forwarded-For buy a fresh address-block budget', async () => {
        const signupLimiters = await withAccountRateLimits(
            {
                NODE_SIGNUP_RATE_LIMIT_MAX: '50',
                NODE_SIGNUP_RATE_LIMIT_ADDRESS_MAX: '50',
                NODE_SIGNUP_RATE_LIMIT_BLOCK_MAX: '2'
            },
            (module) => module.signupLimiters
        );

        // `trustProxyHop: false` — Express's own default, and what `NODE_TRUST_PROXY_HOPS=0`
        // means in the real app: `X-Forwarded-For` is never consulted for `request.ip`.
        const app = appAnswering(201, false, ...signupLimiters);
        const attempt = (forgedIp: string, email: string) =>
            supertest(app).post('/route').set('X-Forwarded-For', forgedIp).send({ email });

        expect(await statusOf(attempt('203.0.113.5', 'one@example.com'))).toBe(201);
        expect(await statusOf(attempt('203.0.113.5', 'two@example.com'))).toBe(201);
        // A DIFFERENT forged address, spent against the SAME real socket address — untrusted, so
        // it lands in the same block bucket rather than opening a fresh one.
        expect(await statusOf(attempt('198.51.100.9', 'three@example.com'))).toBe(429);
    });
});
