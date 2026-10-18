import type { RequestHandler } from 'express';
import supertest from 'supertest';
import { appAnswering, statusOf, withReloadedRateLimits } from '@tests/rate-limit-harness';

/**
 * The global browsing brake refunds a request that carried a resolved api-key, so partners sharing
 * one exit address are bound by their own per-key budget instead of one shared 100. Built against a
 * trivial handler: the property belongs to the limiter, not to `getAuth`, so a stand-in sets
 * `request.credentialId` the way a resolved key does (a key named `sk_valid_…`).
 */

/** The two limiters this case drives, from a freshly loaded module with small budgets. */
const withSmallBudgets = () =>
    withReloadedRateLimits(
        () => import('@infrastructure/http/middlewares/rate-limit'),
        { NODE_RATE_LIMIT_MAX: '2', NODE_API_KEY_RATE_LIMIT_MAX: '3' },
        (module) => ({ rateLimiter: module.rateLimiter, apiKeyLimiter: module.apiKeyLimiter })
    );

/** Stands in for `getAuth`'s credential branch: only a key the "database" knows resolves. */
const resolveKey =
    (apiKeyLimiter: RequestHandler): RequestHandler =>
    (request, response, next) => {
        const header = request.header('x-test-key');
        if (!header?.startsWith('sk_valid_')) {
            next();
            return;
        }
        request.credentialId = header;
        apiKeyLimiter(request, response, next);
    };

describe('the global brake and a resolved api-key', () => {
    afterEach(() => jest.resetModules());

    it('lets a valid key past the global limit, up to its own limit', async () => {
        const { rateLimiter, apiKeyLimiter } = await withSmallBudgets();
        const app = appAnswering(200, true, rateLimiter, resolveKey(apiKeyLimiter));
        const call = () =>
            supertest(app)
                .post('/route')
                .set('X-Forwarded-For', '203.0.113.5')
                .set('x-test-key', 'sk_valid_a');

        // Global is 2, the key's own is 3: three pass, the fourth is the KEY's refusal.
        expect(await statusOf(call())).toBe(200);
        expect(await statusOf(call())).toBe(200);
        expect(await statusOf(call())).toBe(200);
        expect(await statusOf(call())).toBe(429);
    });

    it('caps a fake sk_ key like a request with no header at all', async () => {
        const { rateLimiter, apiKeyLimiter } = await withSmallBudgets();
        const app = appAnswering(200, true, rateLimiter, resolveKey(apiKeyLimiter));
        const call = (key?: string) => {
            const pending = supertest(app).post('/route').set('X-Forwarded-For', '203.0.113.5');
            return key ? pending.set('x-test-key', key) : pending;
        };

        expect(await statusOf(call('sk_fake_a'))).toBe(200);
        expect(await statusOf(call('sk_fake_b'))).toBe(200);
        expect(await statusOf(call('sk_fake_c'))).toBe(429);
        // The same address, now with no header: the fake keys spent the shared anonymous budget.
        expect(await statusOf(call())).toBe(429);
    });

    it('gives two keys behind one address a budget each', async () => {
        const { rateLimiter, apiKeyLimiter } = await withSmallBudgets();
        const app = appAnswering(200, true, rateLimiter, resolveKey(apiKeyLimiter));
        const call = (key: string) =>
            supertest(app)
                .post('/route')
                .set('X-Forwarded-For', '203.0.113.5')
                .set('x-test-key', key);

        for (let attempt = 0; attempt < 3; attempt += 1) {
            expect(await statusOf(call('sk_valid_a'))).toBe(200);
            expect(await statusOf(call('sk_valid_b'))).toBe(200);
        }
        expect(await statusOf(call('sk_valid_a'))).toBe(429);
        expect(await statusOf(call('sk_valid_b'))).toBe(429);
    });
});
