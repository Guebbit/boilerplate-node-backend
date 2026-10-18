import express from 'express';
import supertest from 'supertest';
import cookieParser from 'cookie-parser';
import { api, loginCompleting } from '@tests/http';
import { setupTestDb } from '@tests/setup-test-db';
import { setEnvironment } from '@tests/environment';
import {
    requirePermissionViaCookie,
    stillHoldsRuleViaCookie
} from '@kernel/middlewares/authorizations';
import { createUser, createAdminUser, PLAIN_PASSWORD } from '@modules/users/tests/factories';
import { dropAllSessions } from '@modules/account/tests/factories';

/**
 * The event stream's session credential beyond what the contract file shows: a forged cookie and a
 * revoked session are refused, and an open stream follows its session family across a refresh.
 * `EventSource` cannot set request headers, so the stream authenticates with the session cookie.
 */

setupTestDb();

/** Logs in through the real route and returns the user plus the `jwt` refresh cookie it sets. */
const signIn = async (role: 'admin' | 'user') => {
    const user = await (role === 'admin' ? createAdminUser() : createUser());
    const response = await loginCompleting(user.email, PLAIN_PASSWORD);

    const cookies = response.get('Set-Cookie') ?? [];
    return { user, cookie: cookies.find((cookie) => cookie.startsWith('__Host-session='))! };
};

describe('GET /observability/events', () => {
    it('refuses a forged cookie', async () => {
        const response = await api()
            .get('/observability/events')
            .set('Cookie', '__Host-session=not-a-real-token');

        expect(response.status).toBe(401);
    });

    /**
     * Signature alone is not enough: `verifyRefreshToken` also requires the token to still be a
     * live session row, so logging out revokes the stream too.
     */
    it('refuses a validly-signed token that has been revoked', async () => {
        const { user, cookie } = await signIn('admin');

        // Revoked at the source rather than through `POST /account/logout-all`, which needs a
        // bearer token this test does not have. The point is that a still-signed token whose
        // record is gone must not open the stream.
        await dropAllSessions(String(user._id));

        const response = await api().get('/observability/events').set('Cookie', cookie);

        expect(response.status).toBe(401);
    });
});

/**
 * An open SSE stream outlives the cookie that opened it: a refresh rotates that token away, and
 * the 30-second recheck must follow the session's family, not the superseded value.
 */
describe('the recheck of an open stream', () => {
    const [ACTION, SUBJECT] = ['read', 'ObservabilitySnapshot'] as const;
    const FRONTEND = 'https://shop.example';

    beforeEach(() => {
        setEnvironment({ NODE_CORS_ORIGIN: FRONTEND });
    });

    /** Connects through the real guard, and answers the request the stream would recheck with. */
    const connect = async (cookie: string) => {
        let admitted: express.Request | undefined;
        const guarded = express();
        guarded.use(cookieParser());
        guarded.get('/stream', requirePermissionViaCookie(ACTION, SUBJECT), (request, response) => {
            admitted = request;
            response.end();
        });
        await supertest(guarded).get('/stream').set('Cookie', cookie).expect(200);
        return admitted!;
    };

    it('stays open across a refresh rotation', async () => {
        const { cookie } = await signIn('admin');
        const request = await connect(cookie);

        await api()
            .post('/account/refresh')
            .set('Origin', FRONTEND)
            .set('Cookie', cookie)
            .expect(200);

        await expect(stillHoldsRuleViaCookie(request, ACTION, SUBJECT)).resolves.toBe(true);
    });

    it('closes once its session family is revoked', async () => {
        const { user, cookie } = await signIn('admin');
        const request = await connect(cookie);

        await dropAllSessions(String(user._id));

        await expect(stillHoldsRuleViaCookie(request, ACTION, SUBJECT)).resolves.toBe(false);
    });
});
