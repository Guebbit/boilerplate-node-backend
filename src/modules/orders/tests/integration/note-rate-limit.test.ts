/**
 * The per-account staff-note budget (`POST /orders/{id}/timeline/notes`), over real HTTP against a
 * trivial handler: the property belongs to the limiter. `routes.test.ts` asserts the real route
 * mounts it after the permission check.
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

/** The status of one note attempt by `account`. */
const attempt = (app: express.Express, account: string): Promise<number> =>
    supertest(app)
        .post('/notes')
        .set('x-account', account)
        .then((response) => response.status);

/** A notes route behind a limiter built with a budget of `limit`. */
const notesApp = async (limit: number) => {
    const { ordersNoteLimiter } = await withReloadedRateLimits(
        () => import('@modules/orders/rate-limits'),
        { NODE_ORDER_NOTE_RATE_LIMIT_MAX: String(limit) },
        (module) => module
    );
    const app = express();
    app.use(asAccount);
    app.post('/notes', ordersNoteLimiter, (_request, response) => {
        response.status(201).json({});
    });
    return app;
};

describe('the staff-note budget', () => {
    afterEach(() => jest.resetModules());

    it('refuses with 429 once an account has spent it, and leaves another account its own', async () => {
        const app = await notesApp(2);

        const statuses: number[] = [];
        for (let count = 0; count < 3; count += 1) statuses.push(await attempt(app, 'a'));

        expect(statuses).toEqual([201, 201, 429]);
        expect(await attempt(app, 'b')).toBe(201);
    });
});
