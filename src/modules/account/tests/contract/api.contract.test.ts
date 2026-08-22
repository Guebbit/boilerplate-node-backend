/**
 * Contract tests for the self-service /account surface: profile update, password change,
 * single-session logout, the sessions listing and email verification.
 *
 * The older account flows (login, signup, reset, delete) are covered by the unit suites and the
 * contract-derived request sweep; these endpoints get scenario tests because their contract
 * branches hang on state no generated payload can set up — a second account holding the email, a
 * revoked cookie, a spent token, a session belonging to someone else.
 *
 * Where a listing is asserted, it is asserted on IDS, not lengths alone — a wrong-but-nonempty
 * answer must not pass.
 */
import '@tests/contract';
import { setupTestDb } from '@tests/setup-test-db';
import { api, authenticateAs } from '@tests/http';
import { createUser, PLAIN_PASSWORD } from '@modules/users/tests/factory';
import { createProduct } from '@modules/products/tests/factory';
import { userRepository } from '@modules/users';
import { EMAIL_VERIFY_TOKEN_TYPE } from '@modules/account/services';

setupTestDb();

/** A valid ObjectId that is guaranteed not to exist — the 404 branch, not the 422 one. */
const MISSING_ID = '65dc8a99604c307b702b5ccc';

/**
 * Log a user in keeping BOTH credentials: the bearer token and the refresh cookie. The cookie is
 * what `current`, logout and refresh hang on, and `authenticateAs` deliberately drops it.
 */
const loginWithCookie = async (overrides: Parameters<typeof createUser>[0] = {}) => {
    const user = await createUser(overrides);
    const response = await api()
        .post('/account/login')
        .send({ email: user.email, password: PLAIN_PASSWORD });

    if (response.status !== 200)
        throw new Error(
            `login setup failed: ${response.status} — ${JSON.stringify(response.body)}`
        );

    // supertest types every header as `string`; `set-cookie` is the one that is really a list.
    const setCookie = response.headers['set-cookie'] ?? [];
    const cookies = Array.isArray(setCookie) ? setCookie : [setCookie];
    const jwtCookie = cookies.find((cookie) => cookie.startsWith('jwt='));
    if (!jwtCookie) throw new Error('login set no jwt cookie');

    return {
        user,
        bearer: `Bearer ${response.body.data.token as string}` as const,
        jwtCookie
    };
};

/** The stored verify-token value for a user — what the emailed link would carry. */
const readVerifyToken = async (userId: string) => {
    const stored = await userRepository.findByIdWithCredentials(userId);
    return stored?.tokens.find(({ type }) => type === EMAIL_VERIFY_TOKEN_TYPE)?.token;
};

/** `Max-Age` of the named cookie on a response, in seconds. */
const cookieMaxAge = (response: { headers: Record<string, unknown> }, name: string) => {
    const setCookie = response.headers['set-cookie'] ?? [];
    const cookies = Array.isArray(setCookie) ? setCookie : [setCookie];
    const match = (cookies as string[])
        .find((cookie) => cookie.startsWith(`${name}=`))
        ?.match(/max-age=(\d+)/i);
    return match ? Number(match[1]) : undefined;
};

describe('POST /account/login — remember me', () => {
    it('sizes the refresh cookie by the requested tier', async () => {
        const user = await createUser();
        const response = await api()
            .post('/account/login')
            .send({ email: user.email, password: PLAIN_PASSWORD, remember: 'medium' });

        expect(response.status).toBe(200);
        expect(response).toSatisfyApiSpec();
        const expected = Number(process.env.NODE_TOKEN_REFRESH_TIME_MEDIUM);
        expect(cookieMaxAge(response, 'jwt')).toBe(expected);
        // The UI hint expires in step with the credential it describes.
        expect(cookieMaxAge(response, 'isAuth')).toBe(expected);
    });

    it('keeps the access-token window when no tier is asked for', async () => {
        const user = await createUser();
        const response = await api()
            .post('/account/login')
            .send({ email: user.email, password: PLAIN_PASSWORD });

        expect(response.status).toBe(200);
        expect(cookieMaxAge(response, 'jwt')).toBe(Number(process.env.NODE_TOKEN_ACCESS_TIME));
    });

    it('answers 422 for a tier the contract does not declare, before checking credentials', async () => {
        const response = await api()
            .post('/account/login')
            .send({ email: 'nobody@example.com', password: 'whatever-it-is', remember: 'forever' });

        expect(response.status).toBe(422);
        expect(response).toSatisfyApiSpec();
    });
});

describe('PUT /account', () => {
    it('matches the contract when a plain user updates their own profile', async () => {
        const { bearer } = await authenticateAs('user');

        const response = await api()
            .put('/account')
            .set('Authorization', bearer)
            .send({ username: 'self-renamed' });

        expect(response.status).toBe(200);
        expect(response.body.data.username).toBe('self-renamed');
        expect(response).toSatisfyApiSpec();
    });

    it('unverifies the account and reports it when the email changes', async () => {
        const { bearer } = await authenticateAs('user');

        const response = await api()
            .put('/account')
            .set('Authorization', bearer)
            .send({ email: 'fresh-address@example.com' });

        expect(response.status).toBe(200);
        expect(response.body.data.email).toBe('fresh-address@example.com');
        expect(response.body.data.verified).toBe(false);
        expect(response).toSatisfyApiSpec();
    });

    it('matches the error contract for an email another account holds', async () => {
        await createUser({ email: 'taken@example.com', username: 'first' });
        const { bearer } = await loginWithCookie({
            email: 'second@example.com',
            username: 'second'
        });

        const response = await api()
            .put('/account')
            .set('Authorization', bearer)
            .send({ email: 'taken@example.com' });

        expect(response.status).toBe(409);
        expect(response).toSatisfyApiSpec();
    });

    it('matches the error contract for an invalid body', async () => {
        const { bearer } = await authenticateAs('user');

        const response = await api()
            .put('/account')
            .set('Authorization', bearer)
            .send({ email: 'not-an-email' });

        expect(response.status).toBe(422);
        expect(response).toSatisfyApiSpec();
    });

    it('matches the error contract when unauthenticated', async () => {
        const response = await api().put('/account').send({ username: 'nobody' });

        expect(response.status).toBe(401);
        expect(response).toSatisfyApiSpec();
    });
});

describe('POST /account/password', () => {
    it('matches the contract and the new credential works', async () => {
        const { user, bearer } = await loginWithCookie();

        const response = await api().post('/account/password').set('Authorization', bearer).send({
            currentPassword: PLAIN_PASSWORD,
            password: 'brand-new-secret',
            passwordConfirm: 'brand-new-secret'
        });

        expect(response.status).toBe(200);
        expect(response).toSatisfyApiSpec();

        const relogin = await api()
            .post('/account/login')
            .send({ email: user.email, password: 'brand-new-secret' });
        expect(relogin.status).toBe(200);
    });

    it('matches the error contract for a wrong current password — 422, never 401', async () => {
        const { bearer } = await loginWithCookie();

        const response = await api().post('/account/password').set('Authorization', bearer).send({
            currentPassword: 'wrong-guess',
            password: 'brand-new-secret',
            passwordConfirm: 'brand-new-secret'
        });

        expect(response.status).toBe(422);
        expect(response).toSatisfyApiSpec();
    });

    it('matches the error contract when unauthenticated', async () => {
        const response = await api().post('/account/password').send({
            currentPassword: PLAIN_PASSWORD,
            password: 'brand-new-secret',
            passwordConfirm: 'brand-new-secret'
        });

        expect(response.status).toBe(401);
        expect(response).toSatisfyApiSpec();
    });
});

describe('POST /account/logout', () => {
    it('revokes exactly the cookie session', async () => {
        const { jwtCookie } = await loginWithCookie();

        const response = await api().post('/account/logout').set('Cookie', jwtCookie);

        expect(response.status).toBe(200);
        expect(response).toSatisfyApiSpec();

        // The revoked cookie can no longer mint access tokens — the session is dead server-side,
        // not merely cleared client-side.
        const refresh = await api().get('/account/refresh').set('Cookie', jwtCookie);
        expect(refresh.status).toBe(401);
    });

    it('answers 200 with no cookie at all — the caller already has what they asked for', async () => {
        const response = await api().post('/account/logout');

        expect(response.status).toBe(200);
        expect(response).toSatisfyApiSpec();
    });
});

describe('GET /account/sessions', () => {
    it('lists the one session a fresh login has, flagged current via the cookie', async () => {
        const { bearer, jwtCookie } = await loginWithCookie();

        const response = await api()
            .get('/account/sessions')
            .set('Authorization', bearer)
            .set('Cookie', jwtCookie);

        expect(response.status).toBe(200);
        expect(response.body.data.sessions).toHaveLength(1);
        expect(response.body.data.sessions[0].current).toBe(true);
        expect(response).toSatisfyApiSpec();
    });

    it('flags nothing current for a bearer-only caller', async () => {
        const { bearer } = await loginWithCookie();

        const response = await api().get('/account/sessions').set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response.body.data.sessions).toHaveLength(1);
        expect(response.body.data.sessions[0].current).toBe(false);
        expect(response).toSatisfyApiSpec();
    });

    /**
     * `lastUsedAt` is what separates an idle device from an active one in the list, and it is only
     * meaningful if it is ABSENT until the session is actually used — a field that appeared at
     * issue time would read as "used just now" for a session nobody has touched since login.
     *
     * Both halves are asserted in one case on purpose: absent-then-present is the property, and
     * splitting it into two tests would leave either half passing on its own while the field never
     * changed at all.
     */
    it('reports lastUsedAt only once the session has been used', async () => {
        const { bearer, jwtCookie } = await loginWithCookie();

        const before = await api()
            .get('/account/sessions')
            .set('Authorization', bearer)
            .set('Cookie', jwtCookie);

        expect(before.body.data.sessions[0].lastUsedAt).toBeUndefined();

        // Exchanging the refresh cookie for an access token IS the session making a request.
        const refreshed = await api().get('/account/refresh').set('Cookie', jwtCookie);
        expect(refreshed.status).toBe(200);

        const after = await api()
            .get('/account/sessions')
            .set('Authorization', bearer)
            .set('Cookie', jwtCookie);

        expect(after.status).toBe(200);
        expect(typeof after.body.data.sessions[0].lastUsedAt).toBe('string');
        expect(after).toSatisfyApiSpec();
    });

    it('matches the error contract when unauthenticated', async () => {
        const response = await api().get('/account/sessions');

        expect(response.status).toBe(401);
        expect(response).toSatisfyApiSpec();
    });
});

describe('DELETE /account/sessions/{sessionId}', () => {
    it('revokes the named session and the listing agrees', async () => {
        const { user, bearer, jwtCookie } = await loginWithCookie();
        // A second session, so the test can prove WHICH one died.
        const second = await api()
            .post('/account/login')
            .send({ email: user.email, password: PLAIN_PASSWORD });
        expect(second.status).toBe(200);

        const listing = await api()
            .get('/account/sessions')
            .set('Authorization', bearer)
            .set('Cookie', jwtCookie);
        const sessions: { id: string; current: boolean }[] = listing.body.data.sessions;
        expect(sessions).toHaveLength(2);
        const other = sessions.find(({ current }) => !current);

        const response = await api()
            .delete(`/account/sessions/${other!.id}`)
            .set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response).toSatisfyApiSpec();

        const after = await api()
            .get('/account/sessions')
            .set('Authorization', bearer)
            .set('Cookie', jwtCookie);
        expect(after.body.data.sessions.map(({ id }: { id: string }) => id)).toEqual(
            sessions.filter(({ current }) => current).map(({ id }) => id)
        );
    });

    it("matches the error contract for another user's session id", async () => {
        const owner = await loginWithCookie({ email: 'owner@example.com', username: 'owner' });
        const ownerListing = await api()
            .get('/account/sessions')
            .set('Authorization', owner.bearer);
        const ownerSessionId = ownerListing.body.data.sessions[0].id as string;

        const attacker = await loginWithCookie({
            email: 'attacker@example.com',
            username: 'attacker'
        });
        const response = await api()
            .delete(`/account/sessions/${ownerSessionId}`)
            .set('Authorization', attacker.bearer);

        expect(response.status).toBe(404);
        expect(response).toSatisfyApiSpec();

        // And the owner's session is untouched.
        const after = await api().get('/account/sessions').set('Authorization', owner.bearer);
        expect(after.body.data.sessions.map(({ id }: { id: string }) => id)).toEqual([
            ownerSessionId
        ]);
    });

    it('matches the error contract for a well-formed id that matches nothing', async () => {
        const { bearer } = await loginWithCookie();

        const response = await api()
            .delete(`/account/sessions/${MISSING_ID}`)
            .set('Authorization', bearer);

        expect(response.status).toBe(404);
        expect(response).toSatisfyApiSpec();
    });

    it('matches the error contract for a malformed id', async () => {
        const { bearer } = await loginWithCookie();

        const response = await api()
            .delete('/account/sessions/not-an-id')
            .set('Authorization', bearer);

        expect(response.status).toBe(422);
        expect(response).toSatisfyApiSpec();
    });

    it('matches the error contract when unauthenticated', async () => {
        const response = await api().delete(`/account/sessions/${MISSING_ID}`);

        expect(response.status).toBe(401);
        expect(response).toSatisfyApiSpec();
    });
});

describe('POST /account/verify-request and /account/verify-confirm', () => {
    it('signup starts unverified and holding a verification token', async () => {
        const response = await api().post('/account/signup').send({
            email: 'joiner@example.com',
            username: 'joiner',
            password: PLAIN_PASSWORD,
            passwordConfirm: PLAIN_PASSWORD
        });

        expect(response.status).toBe(201);
        expect(response.body.data.verified).toBe(false);
        expect(response).toSatisfyApiSpec();

        expect(await readVerifyToken(response.body.data.id)).toBeDefined();
    });

    it('re-sends for an unverified account and the emailed token then verifies it', async () => {
        const { user, bearer } = await loginWithCookie();

        const request = await api().post('/account/verify-request').set('Authorization', bearer);
        expect(request.status).toBe(200);
        expect(request).toSatisfyApiSpec();

        const token = await readVerifyToken(user.id);
        const confirm = await api().post('/account/verify-confirm').send({ token });
        expect(confirm.status).toBe(200);
        expect(confirm).toSatisfyApiSpec();

        const stored = await userRepository.findById(user.id);
        expect(stored?.verified).toBe(true);
    });

    it('matches the error contract when the account is already verified', async () => {
        const { bearer } = await loginWithCookie({ verified: true });

        const response = await api().post('/account/verify-request').set('Authorization', bearer);

        expect(response.status).toBe(409);
        expect(response).toSatisfyApiSpec();
    });

    it('matches the error contract for an invented token', async () => {
        const response = await api()
            .post('/account/verify-confirm')
            .send({ token: 'not-a-real-token' });

        expect(response.status).toBe(422);
        expect(response).toSatisfyApiSpec();
    });

    it('a token spends exactly once', async () => {
        const { user, bearer } = await loginWithCookie();
        await api().post('/account/verify-request').set('Authorization', bearer);
        const token = await readVerifyToken(user.id);

        const first = await api().post('/account/verify-confirm').send({ token });
        const second = await api().post('/account/verify-confirm').send({ token });

        expect(first.status).toBe(200);
        expect(second.status).toBe(422);
        expect(second).toSatisfyApiSpec();
    });

    it('matches the error contract when verify-request is unauthenticated', async () => {
        const response = await api().post('/account/verify-request');

        expect(response.status).toBe(401);
        expect(response).toSatisfyApiSpec();
    });
});

describe('the address book: /account/addresses', () => {
    const HOME = {
        label: 'home',
        fullName: 'Ada Lovelace',
        street: 'Via Roma 1',
        city: 'Modena',
        zip: '41121',
        country: 'IT'
    };

    it('walks the whole book: add, list, update, remove — one default throughout', async () => {
        const { bearer } = await authenticateAs('user');

        const added = await api()
            .post('/account/addresses')
            .set('Authorization', bearer)
            .send(HOME);
        expect(added.status).toBe(200);
        expect(added.body.data.addresses[0].default).toBe(true);
        expect(added).toSatisfyApiSpec();

        const second = await api()
            .post('/account/addresses')
            .set('Authorization', bearer)
            .send({ ...HOME, label: 'office', street: 'Via Milano 2', default: true });
        expect(second.status).toBe(200);
        const defaults = second.body.data.addresses.filter(
            ({ default: d }: { default: boolean }) => d
        );
        expect(defaults.map(({ label }: { label: string }) => label)).toEqual(['office']);
        expect(second).toSatisfyApiSpec();

        const listed = await api().get('/account/addresses').set('Authorization', bearer);
        expect(listed.status).toBe(200);
        expect(listed.body.data.addresses).toHaveLength(2);
        expect(listed).toSatisfyApiSpec();

        const officeId = defaults[0].id as string;
        const updated = await api()
            .put(`/account/addresses/${officeId}`)
            .set('Authorization', bearer)
            .send({ city: 'Bologna' });
        expect(updated.status).toBe(200);
        expect(updated).toSatisfyApiSpec();

        const removed = await api()
            .delete(`/account/addresses/${officeId}`)
            .set('Authorization', bearer);
        expect(removed.status).toBe(200);
        // The promoted survivor keeps the book at exactly one default.
        expect(
            removed.body.data.addresses.map(({ default: d }: { default: boolean }) => d)
        ).toEqual([true]);
        expect(removed).toSatisfyApiSpec();
    });

    it('matches the error contract for an invalid body', async () => {
        const { bearer } = await authenticateAs('user');
        const response = await api()
            .post('/account/addresses')
            .set('Authorization', bearer)
            .send({ label: 'incomplete' });

        expect(response.status).toBe(422);
        expect(response).toSatisfyApiSpec();
    });

    it('matches the error contract for an entry the caller does not hold', async () => {
        const { bearer } = await authenticateAs('user');
        const response = await api()
            .put(`/account/addresses/${MISSING_ID}`)
            .set('Authorization', bearer)
            .send({ city: 'Nowhere' });

        expect(response.status).toBe(404);
        expect(response).toSatisfyApiSpec();
    });

    it('answers the same 404 when REMOVING an entry the caller does not hold', async () => {
        /*
         * The same ownership path as the edit above, and it was the one method never asserted
         * against the contract. Worth its own case rather than trusting the symmetry: delete is
         * the method where "not found" and "not yours" are most tempting to answer differently,
         * and a distinguishable answer would confirm the id belongs to somebody.
         */
        const { bearer } = await authenticateAs('user');
        const response = await api()
            .delete(`/account/addresses/${MISSING_ID}`)
            .set('Authorization', bearer);

        expect(response.status).toBe(404);
        expect(response).toSatisfyApiSpec();
    });

    it('matches the error contract when unauthenticated', async () => {
        const response = await api().get('/account/addresses');

        expect(response.status).toBe(401);
        expect(response).toSatisfyApiSpec();
    });

    it('checkout carries the snapshot the contract declares', async () => {
        const { bearer } = await authenticateAs('user');
        await api().post('/account/addresses').set('Authorization', bearer).send(HOME);
        const product = await createProduct({ onHand: 5 });
        await api()
            .post('/cart')
            .set('Authorization', bearer)
            .send({ productId: String(product._id), quantity: 1 });

        const response = await api().post('/cart/checkout').set('Authorization', bearer);

        expect(response.status).toBe(201);
        expect(response.body.data.order.shippingAddress).toMatchObject({
            fullName: 'Ada Lovelace',
            street: 'Via Roma 1'
        });
        expect(response).toSatisfyApiSpec();
    });
});
