/**
 * HTTP-level test harness.
 *
 * The unit suites call services and repositories directly. These helpers drive the app the way
 * a client does — through routing, middleware, auth, serialization and the error handler — which
 * is the only layer where a response can be compared to `openapi.yaml`.
 *
 * `src/app.ts`'s `createApp()` builds the fully mounted express app synchronously and
 * starts no server, no Mongo connection, no Redis and no queue — only calling its own `boot`/
 * `start` would. The database comes from `setupTestDb()` (in-memory Mongo); Redis is genuinely
 * optional, because `getCacheValue` resolves `undefined` on any failure and the request is
 * treated as a cache miss.
 */
import request from 'supertest';
import { createApp } from '../../src/app';
import { cookieValue, setCookie } from './cookies';
import { freezeDate, advanceDate } from './clock';
import { reauthWindowSeconds } from '@kernel/config';
import { createUser, createAdminUser, PLAIN_PASSWORD } from '@modules/users/tests/factories';
import type { UserDocument } from '@modules/users';

/** The one instance every test in this process shares — see this file's own docblock. */
const { app } = createApp();

/** A fresh supertest agent against the app, for one request. */
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
 * `customer` membership, `verifiedAt: new Date()` — this is the account most tests want: a
 * logged-in caller free to use the whole app, checkout and payment included. A test asserting
 * UNVERIFIED behaviour builds its own user with `createUser({}, 'unverified')` (`account`'s own
 * suites do exactly that) rather than fighting this default.
 */
export const authenticateAs = async (
    role: 'admin' | 'user' = 'user'
): Promise<AuthenticatedTestUser> => {
    const user = await (role === 'admin'
        ? createAdminUser({ verifiedAt: new Date() })
        : createUser({ verifiedAt: new Date() }, 'customer'));

    return authenticateUser(user);
};

/**
 * Creates a user seeded with an arbitrary TENANT role name — `manager`, `warehouse`, `support`,
 * `editor`, `moderator`, `customer` — and logs it in the same way
 * {@link authenticateAs} does. Separate from it rather than a third accepted value there: those
 * two are the two accounts most tests reach for by NAME, while this one exists for the contract
 * sweep that has to drive every preset role through the HTTP surface — granted through
 * `createUser`'s own `role` parameter, which writes the membership `rolesOf` actually reads.
 */
export const authenticateAsRole = async (role: string): Promise<AuthenticatedTestUser> => {
    // Distinct per role, not `createUser`'s shared default: the contract sweep this exists for
    // authenticates several roles inside ONE test, and a second account at the same address is a
    // duplicate-key error, not a second caller.
    const user = await createUser(
        {
            email: `${role}@example.com`,
            username: role,
            // `unverified` is the one persona whose address is not proven.
            verifiedAt: role === 'unverified' ? undefined : new Date()
        },
        role
    );

    return authenticateUser(user);
};

/**
 * Log an existing account in through `POST /account/login` and answer the bearer a client sends
 * next. Mode-agnostic: `transport: 'bearer'` is ignored in `jwt` mode (the access token comes
 * back) and in `cookie` mode makes the login hand back a `ses_…` id to send as a bearer instead of
 * a cookie a test would have to carry.
 *
 * @param email - the account's address
 * @param password - its password; the factories' shared one by default
 * @param body - more of the login body (`remember`)
 * @throws {Error} when the login is refused or answers no credential
 */
export const loginBearer = async (
    email: string,
    password: string = PLAIN_PASSWORD,
    body: Record<string, unknown> = {}
): Promise<`Bearer ${string}`> => {
    const response = await api()
        .post('/account/login')
        .send({ email, password, transport: 'bearer', ...body });

    if (response.status !== 200)
        throw new Error(
            `loginBearer('${email}') failed: POST /account/login returned ${response.status} ` +
                `— ${JSON.stringify(response.body)}`
        );

    const token = response.body?.data?.token ?? response.body?.data?.sessionToken;
    if (!token)
        throw new Error(
            `loginBearer('${email}'): no token in login response — ${JSON.stringify(response.body)}`
        );

    return `Bearer ${token}`;
};

/**
 * A bearer for the session a cookie names. A `cookie`-mode cookie carries a `ses_…` id, which is
 * itself a valid bearer; a `jwt`-mode cookie is a refresh token, exchanged for a fresh access
 * token (which is also what a lapsed one needs). Told apart by the credential's own prefix, so a
 * suite does not have to know which mode it runs in.
 *
 * @param cookie - the session cookie, as a `Cookie` header or a `Set-Cookie` line
 */
export const bearerForCookie = async (cookie: string): Promise<`Bearer ${string}`> => {
    const value = cookieValue(cookie);
    if (value.startsWith('ses_')) return `Bearer ${value}`;

    const refreshed = await api().post('/account/refresh').set('Cookie', cookie);
    return `Bearer ${refreshed.body.data.token as string}`;
};

/**
 * A bearer that is past a step-up tier's window yet still usable: what a stolen-but-stale session
 * looks like. Logs the account in on a frozen clock, moves the clock one second beyond the tier,
 * and refreshes the access token — `auth_time` is copied forward on a refresh, never re-stamped,
 * so the token keeps its original age. `remember: 'short'` so the refresh cookie outlives the
 * advance.
 *
 * Freezes the clock: the caller restores it with `jest.useRealTimers()` in an `afterEach`.
 *
 * @param user - the account to log in
 * @param tier - the step-up tier whose window is exceeded
 * @throws {Error} when the login sets no session cookie
 */
export const staleBearerFor = async (
    user: Pick<UserDocument, 'email'>,
    tier: 'sensitive' | 'critical'
): Promise<`Bearer ${string}`> => {
    freezeDate();
    const response = await api()
        .post('/account/login')
        .send({ email: user.email, password: PLAIN_PASSWORD, remember: 'short' });
    const cookie = setCookie(response, '__Host-session');
    if (!cookie) throw new Error('staleBearerFor: the login set no session cookie');

    advanceDate((reauthWindowSeconds(tier) + 1) * 1000);
    return bearerForCookie(cookie);
};

/** Shared by {@link authenticateAs} and {@link authenticateAsRole} — the login round trip itself. */
const authenticateUser = async (user: UserDocument): Promise<AuthenticatedTestUser> => {
    const bearer = await loginBearer(user.email);
    return { user, token: bearer.slice('Bearer '.length), bearer };
};
