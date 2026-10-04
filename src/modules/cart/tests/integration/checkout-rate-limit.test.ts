/**
 * The per-account checkout budget (`POST /cart/checkout`), over real HTTP against a trivial
 * handler: the property belongs to the limiter, and routing it through a real checkout would only
 * add a database round trip to every attempt. `routes.test.ts` asserts the real route mounts it.
 */
import express from 'express';
import supertest from 'supertest';
import type { Request, RequestHandler } from 'express';
import { asStub } from '@tests/stub';
import { withReloadedRateLimits } from '@tests/rate-limit-harness';
import type { AuthContext } from '@types';

/** Stands in for `getAuth`: the account named by the `x-account` header. */
const asAccount: RequestHandler = (request: Request, _response, next) => {
    request.authContext = asStub<AuthContext>({ id: request.header('x-account') ?? 'anonymous' });
    next();
};

/** The status of one checkout attempt by `account`. */
const attempt = (app: express.Express, account: string): Promise<number> =>
    supertest(app)
        .post('/checkout')
        .set('x-account', account)
        .then((response) => response.status);

/** A checkout route answering `status`, behind a limiter built with a budget of `limit`. */
const checkoutApp = async (limit: number, status: number) => {
    const { checkoutLimiter } = await withReloadedRateLimits(
        () => import('@modules/cart/rate-limits'),
        { NODE_CHECKOUT_RATE_LIMIT_MAX: String(limit) },
        (module) => module
    );
    const app = express();
    app.use(asAccount);
    app.post('/checkout', checkoutLimiter, (_request, response) => {
        response.status(status).json({});
    });
    return app;
};

describe('the checkout budget', () => {
    afterEach(() => jest.resetModules());

    it('refuses with 429 once an account has spent it', async () => {
        const app = await checkoutApp(3, 201);

        const statuses: number[] = [];
        for (let count = 0; count < 5; count += 1) statuses.push(await attempt(app, 'a'));

        expect(statuses).toEqual([201, 201, 201, 429, 429]);
    });

    // A refused checkout still read the basket and the stock, so failures spend it as well.
    it('counts a refused checkout the same as a placed one', async () => {
        const app = await checkoutApp(2, 409);

        const statuses: number[] = [];
        for (let count = 0; count < 3; count += 1) statuses.push(await attempt(app, 'a'));

        expect(statuses).toEqual([409, 409, 429]);
    });

    it('budgets one account apart from another', async () => {
        const app = await checkoutApp(1, 201);
        await attempt(app, 'one');

        expect([await attempt(app, 'one'), await attempt(app, 'two')]).toEqual([429, 201]);
    });
});
