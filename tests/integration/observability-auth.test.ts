import express from 'express';
import supertest from 'supertest';
import cookieParser from 'cookie-parser';
import { api } from '@tests/http';
import { setupTestDb } from '@tests/setup-test-db';
import { createUser, createAdminUser, PLAIN_PASSWORD } from '@modules/users/tests/fixtures';
import { userRepository } from '@modules/users';

/**
 * The two observability endpoints, and the credentials that reach them.
 *
 * Neither carries user data, but both are a map of how the service behaves: request volumes,
 * error rates, latency percentiles, login success and failure counters, uptime and heap. That is
 * reconnaissance worth having if you intend to attack it.
 *
 * They authenticate differently because their callers CAN authenticate differently, and the tests
 * are split the same way.
 */

setupTestDb();

/** Logs in through the real route and returns the user plus the `jwt` refresh cookie it sets. */
const signIn = async (role: 'admin' | 'user') => {
    const user = await (role === 'admin' ? createAdminUser() : createUser());
    const response = await api()
        .post('/account/login')
        .send({ email: user.email, password: PLAIN_PASSWORD });

    const cookies = response.get('Set-Cookie') ?? [];
    return { user, cookie: cookies.find((cookie) => cookie.startsWith('jwt='))! };
};

describe('GET /observability/events', () => {
    /**
     * `EventSource` cannot set request headers — a hard limitation of the browser API, not an
     * oversight — so a bearer token is not available to an SSE client at all. The cookie is,
     * given `withCredentials: true`, which is how the frontend already opens the stream.
     */
    it('refuses a request with no session cookie', async () => {
        const response = await api().get('/observability/events');

        expect(response.status).toBe(401);
    });

    it('refuses a signed-in non-admin', async () => {
        const { cookie } = await signIn('user');

        const response = await api().get('/observability/events').set('Cookie', cookie);

        expect(response.status).toBe(403);
    });

    it('refuses a forged cookie', async () => {
        const response = await api()
            .get('/observability/events')
            .set('Cookie', 'jwt=not-a-real-token');

        expect(response.status).toBe(401);
    });

    /**
     * Signature alone is not enough: `verifyRefreshToken` also requires the token to still be on
     * the user document, so logging out revokes the stream too.
     */
    it('refuses a validly-signed token that has been revoked', async () => {
        const { user, cookie } = await signIn('admin');

        // Revoked at the source rather than through `POST /account/logout-all`, which needs a
        // bearer token this test does not have. The point is that a still-signed token whose
        // record is gone must not open the stream.
        const stored = await userRepository.findByIdWithCredentials(String(user._id));
        stored!.tokens = [];
        await userRepository.save(stored!);

        const response = await api().get('/observability/events').set('Cookie', cookie);

        expect(response.status).toBe(401);
    });
});

describe('GET /observability/metrics', () => {
    const withToken = async (
        token: string | undefined,
        run: (app: express.Express) => Promise<void>
    ) => {
        const original = process.env.NODE_METRICS_TOKEN;
        if (token === undefined) delete process.env.NODE_METRICS_TOKEN;
        else process.env.NODE_METRICS_TOKEN = token;

        const { isMetricsScraper } = await import('@infrastructure/http/middlewares/rate-limit');
        const guarded = express();
        guarded.use(cookieParser());
        guarded.get('/metrics', isMetricsScraper, (_request, response) => {
            response.send('# HELP up\n');
        });

        try {
            await run(guarded);
        } finally {
            if (original === undefined) delete process.env.NODE_METRICS_TOKEN;
            else process.env.NODE_METRICS_TOKEN = original;
        }
    };

    it('accepts the configured scrape token', async () => {
        await withToken('secret-token', async (guarded) => {
            const response = await supertest(guarded)
                .get('/metrics')
                .set('Authorization', 'Bearer secret-token');

            expect(response.status).toBe(200);
        });
    });

    it.each([
        ['no credentials', undefined],
        ['the wrong token', 'Bearer wrong-token'],
        ['a token of a different length', 'Bearer secret-token-but-longer'],
        ['a malformed header', 'secret-token']
    ])('refuses %s', async (_label, header) => {
        await withToken('secret-token', async (guarded) => {
            const request = supertest(guarded).get('/metrics');
            const response = await (header ? request.set('Authorization', header) : request);

            expect(response.status).toBe(401);
        });
    });

    /**
     * Deny by default. An unauthenticated metrics endpoint is not a state to arrive at by
     * forgetting an environment variable, so an unset token closes the endpoint rather than
     * opening it — and says so, loudly, in the log.
     */
    it('refuses every request when no token is configured', async () => {
        await withToken(undefined, async (guarded) => {
            const response = await supertest(guarded)
                .get('/metrics')
                .set('Authorization', 'Bearer anything');

            expect(response.status).toBe(503);
        });
    });
});
