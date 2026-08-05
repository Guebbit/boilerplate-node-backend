/**
 * HTTP-level test harness.
 *
 * The unit suites call services and repositories directly. These helpers drive the app the way
 * a client does — through routing, middleware, auth, serialization and the error handler — which
 * is the only layer where a response can be compared to `openapi.yaml`.
 *
 * `src/app.ts` exports the fully mounted express app and skips its auto-start when
 * `NODE_ENV === 'test'` (see the guard at the bottom of that file), so importing it here starts
 * no server, no Mongo connection, no Redis and no queue. The database comes from
 * `setupTestDb()` (in-memory Mongo); Redis is genuinely optional, because `getCacheValue`
 * resolves `undefined` on any failure and the request is treated as a cache miss.
 */
import request from 'supertest';
import { app } from '../../src/app';
import { createUser, createAdminUser, PLAIN_PASSWORD } from './factories/users';

export const api = () => request(app);

/**
 * Creates a user and logs it in through the real `POST /account/login` route, returning the
 * access token. Going through the endpoint rather than signing a token by hand keeps these
 * tests honest: if login stops issuing usable tokens, every contract test fails.
 */
export const authenticateAs = async (role: 'admin' | 'user' = 'user') => {
    const user = await (role === 'admin' ? createAdminUser() : createUser());

    const response = await api()
        .post('/account/login')
        .send({ email: user.email, password: PLAIN_PASSWORD });

    if (response.status !== 200)
        throw new Error(
            `authenticateAs('${role}') failed: POST /account/login returned ${response.status} ` +
                `— ${JSON.stringify(response.body)}`
        );

    const token = response.body?.data?.token;
    if (!token)
        throw new Error(
            `authenticateAs('${role}'): no token in login response — ${JSON.stringify(response.body)}`
        );

    return { user, token, bearer: `Bearer ${token}` as const };
};
