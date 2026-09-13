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
import { createUser, createOwnerUser, PLAIN_PASSWORD } from '@modules/users/tests/factories';
import type { UserDocument } from '@modules/users';

export const api = () => request(app);

/** What every `authenticateAs*` helper resolves to — the account and its bearer token. */
interface AuthenticatedTestUser {
    user: UserDocument;
    token: string;
    bearer: `Bearer ${string}`;
}

/**
 * Creates a user and logs it in through the real `POST /account/login` route, returning the
 * access token. Going through the endpoint rather than signing a token by hand keeps these
 * tests honest: if login stops issuing usable tokens, every contract test fails.
 *
 * `verified: true` — this is the account most tests want: a logged-in caller free to use the
 * whole app, checkout and payment included. A test asserting UNVERIFIED behaviour builds its own
 * user with `createUser({ verified: false })` (`account`'s own suites do exactly that) rather than
 * fighting this default.
 */
export const authenticateAs = async (
    role: 'owner' | 'user' = 'user'
): Promise<AuthenticatedTestUser> => {
    const user = await (role === 'owner'
        ? createOwnerUser({ verified: true })
        : createUser({ verified: true }));

    return authenticateUser(user, role);
};

/**
 * Creates a user seeded with an arbitrary TENANT role name — `manager`, `warehouse`, `support`,
 * `editor`, `moderator`, `customer` — and logs it in the same way
 * {@link authenticateAs} does. Separate from it rather than a third accepted value there: those
 * two are the two accounts most tests reach for by NAME, while this one exists for the contract
 * sweep that has to drive every preset role through the HTTP surface — see `rolesOf`'s
 * column-fallback in `@kernel/access/store`, which is what makes a bare `role` column enough
 * without seeding a membership row too.
 */
export const authenticateAsRole = async (role: string): Promise<AuthenticatedTestUser> => {
    // Distinct per role, not `createUser`'s shared default: the contract sweep this exists for
    // authenticates several roles inside ONE test, and a second account at the same address is a
    // duplicate-key error, not a second caller.
    const user = await createUser({
        role,
        email: `${role}@example.com`,
        username: role,
        verified: true
    });

    return authenticateUser(user, role);
};

/** Shared by {@link authenticateAs} and {@link authenticateAsRole} — the login round trip itself. */
const authenticateUser = async (
    user: UserDocument,
    role: string
): Promise<AuthenticatedTestUser> => {
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
