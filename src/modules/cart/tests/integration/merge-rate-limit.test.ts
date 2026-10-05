/**
 * @module
 * The merge budget: `POST /cart/merge` is up to a hundred catalogue reads and cart writes in one
 * request, so it spends its own per-ACCOUNT allowance instead of hiding behind the global
 * per-address brake that counts it once. Built against a trivial handler — the property belongs to
 * the limiter; `../unit/routes.test.ts` asserts the real route mounts it.
 */

import express from 'express';
import supertest from 'supertest';
import type { Request, RequestHandler } from 'express';
import { asStub } from '@tests/stub';
import { withReloadedRateLimits } from '@tests/rate-limit-harness';
import type { AuthContext } from '@types';

/** Stands in for `getAuth`: the account is named by a header, and only `.id` is read. */
const asAccount: RequestHandler = (request: Request, _response, next) => {
    request.authContext = asStub<AuthContext>({ id: request.header('x-account') ?? 'anonymous' });
    next();
};

/** A merge limiter built fresh with a small budget — `rateLimit()` reads its options once. */
const mergeAppWithBudget = async (limit: number) => {
    const { mergeLimiter } = await withReloadedRateLimits(
        () => import('@modules/cart/rate-limits'),
        { NODE_CART_MERGE_RATE_LIMIT_MAX: String(limit) },
        (module) => module
    );

    const app = express();
    app.use(asAccount);
    app.post('/merge', mergeLimiter, (_request, response) => {
        response.status(200).json({ success: true });
    });
    return app;
};

describe('the merge budget', () => {
    afterEach(() => jest.resetModules());

    it('refuses with 429 once an account has spent it, whatever the requests answered', async () => {
        const app = await mergeAppWithBudget(2);
        const merge = () => supertest(app).post('/merge').set('x-account', 'one');

        const statuses: number[] = [];
        for (let attempt = 0; attempt < 3; attempt++) {
            const response = await merge();
            statuses.push(response.status);
        }

        expect(statuses).toEqual([200, 200, 429]);
    });

    it('budgets one account apart from another, so a shared address cannot starve a neighbour', async () => {
        const app = await mergeAppWithBudget(1);
        const merge = (account: string) => supertest(app).post('/merge').set('x-account', account);

        await merge('one');
        const spent = await merge('one');
        const neighbour = await merge('two');

        expect(spent.status).toBe(429);
        expect(neighbour.status).toBe(200);
    });
});
