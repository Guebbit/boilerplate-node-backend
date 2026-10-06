/**
 * A request the global rate limiter refuses still carries `x-request-id`. The id middleware is
 * mounted by `createApp` before `installSecurity` for exactly this: the access log sits after the
 * limiter, so the header is the only thing a refused caller (and a support ticket) has to quote.
 *
 * Drives the real limiter and the real id middleware in a minimal app, because the global budget
 * is fixed when its module loads — see `withReloadedRateLimits`.
 */
import express from 'express';
import supertest from 'supertest';
import { withReloadedRateLimits } from '@tests/rate-limit-harness';

/** The real id middleware and the real global limiter, the limiter allowing one request. */
const appWithGlobalLimit = () =>
    withReloadedRateLimits(
        () => import('@infrastructure/http/middlewares/rate-limit'),
        { NODE_RATE_LIMIT_MAX: '1' },
        (module) => module.rateLimiter
    ).then(async (rateLimiter) => {
        const { requestIdMiddleware } = await import('@app/request-context');
        const app = express();
        app.use(requestIdMiddleware);
        app.use(rateLimiter);
        app.get('/anything', (_request, response) => {
            response.status(200).json({});
        });
        return app;
    });

describe('a rate-limited request', () => {
    afterEach(() => jest.resetModules());

    it('answers 429 with an x-request-id', async () => {
        const app = await appWithGlobalLimit();

        await supertest(app).get('/anything');
        const refused = await supertest(app).get('/anything');

        expect(refused.status).toBe(429);
        expect(refused.headers['x-request-id']).toMatch(
            /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i
        );
    });
});
