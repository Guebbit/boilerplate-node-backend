import express from 'express';
import supertest from 'supertest';
import { handleUncaughtError } from '@app/error-handling';
import { registerAuthResolver } from '@kernel/authentication';
import { getAuth, isAuth } from '@kernel/middlewares/authorizations';

/**
 * A failure resolving a session is a fault, not a guest — over real HTTP, through `getAuth`,
 * `isAuth` and the global error handler, with only the resolver faked.
 *
 * Before: a resolver that rejected with anything but an infrastructure error went to `next()`,
 * anonymous and logged nowhere, so a protected route answered 401 and the client showed "session
 * expired". Now only a MISS is anonymous; every rejection reaches the handler (500, or 503 for an
 * outage).
 */

/** What the faked resolver does with a bearer token. */
const fromBearer = jest.fn<Promise<unknown>, [string]>();

registerAuthResolver({
    fromBearer: (token) => fromBearer(token) as never,
    fromCookie: () => Promise.resolve({ miss: 'malformed' }),
    watchCookie: () => Promise.resolve({ miss: 'malformed' }),
    cookieAuthenticates: () => false,
    clearDeadCookie: jest.fn()
});

/** A public route and a protected one behind the same `getAuth`, with the real error handler last. */
const app = express();
app.get('/public', getAuth, (_request, response) => {
    response.status(200).json({ ok: true });
});
app.get('/protected', getAuth, isAuth, (_request, response) => {
    response.status(200).json({ ok: true });
});
app.use(handleUncaughtError);

describe('a session that cannot be resolved', () => {
    beforeEach(() => {
        fromBearer.mockReset();
    });

    it('answers 500 on a protected route when the resolver throws something unexpected', async () => {
        fromBearer.mockRejectedValue(new Error('something nobody anticipated'));

        const response = await supertest(app)
            .get('/protected')
            .set('Authorization', 'Bearer some.token');

        expect(response.status).toBe(500);
    });

    it('answers 500 on a public route too, instead of quietly browsing as a guest', async () => {
        fromBearer.mockRejectedValue(new Error('something nobody anticipated'));

        const response = await supertest(app)
            .get('/public')
            .set('Authorization', 'Bearer some.token');

        expect(response.status).toBe(500);
    });

    it('answers 503 when the resolver reports an outage', async () => {
        fromBearer.mockRejectedValue(
            Object.assign(new Error('server selection timed out'), {
                name: 'MongooseServerSelectionError'
            })
        );

        const response = await supertest(app)
            .get('/protected')
            .set('Authorization', 'Bearer some.token');

        expect(response.status).toBe(503);
    });

    it('still answers 401 for a refused token on a protected route', async () => {
        fromBearer.mockResolvedValue({ miss: 'expired' });

        const response = await supertest(app)
            .get('/protected')
            .set('Authorization', 'Bearer some.token');

        expect(response.status).toBe(401);
    });

    it('still lets a refused token browse a public route as a guest', async () => {
        fromBearer.mockResolvedValue({ miss: 'malformed' });

        const response = await supertest(app)
            .get('/public')
            .set('Authorization', 'Bearer some.token');

        expect(response.status).toBe(200);
    });
});
