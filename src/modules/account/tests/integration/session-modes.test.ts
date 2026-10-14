/**
 * @module
 * The two ways to stay signed in, driven through the real routes. The first block runs under BOTH
 * `NODE_SESSION_MODE` values and says the same thing in each: that is the strategy port's promise.
 *
 * Both modes: login and its "remember me" tiers, logout, logout everywhere, revoking one, a
 *             password change or reset, a step-up, a 2FA login, arming a factor, a provider login.
 * `cookie`:   the origin check, `ses_…` bearers end to end, id renewal, the use stamp.
 * `jwt`:      the access/refresh pair.
 * Switching:  a session belongs to the mode that issued it; neither half crosses over.
 *
 * See: docs/theory/sessions.md
 */

import { api } from '@tests/http';
import { setupTestDb } from '@tests/setup-test-db';
import { setEnvironment } from '@tests/environment';
import { advanceDate, freezeDate } from '@tests/clock';
import { cookieHeader, cookieValue, setCookie } from '@tests/cookies';
import { asStub } from '@tests/stub';
import { codeFor } from '@tests/totp';
import { fakeOAuthProvider } from '@scenarios/support/doubles/oauth-fake';
import {
    createUser,
    userRepository,
    PLAIN_PASSWORD,
    REPLACEMENT_PASSWORD
} from '@modules/users/tests/factories';
import { hashToken } from '@infrastructure/security/hash-token';
import { decodeJwt } from 'jose';
import type { Response } from 'express';
import { plantToken, sessionRowFor, sessionRowsOf } from '../factories';
import { sessionRepository } from '../../repository';
import { activeStrategy, type SessionRequest } from '../../session/strategy';
import { SecondFactorRequiredError } from '../../session/mint-guard';
import { registerOAuthProvider } from '../../oauth/providers';

setupTestDb();

// The provider round trip below needs the `fake` provider, which production never registers.
beforeAll(() => {
    registerOAuthProvider('fake', () => fakeOAuthProvider);
});

/** The one allowed frontend origin of this file. */
const FRONTEND = 'https://shop.example';

beforeEach(() => {
    setEnvironment({ NODE_CORS_ORIGIN: FRONTEND, NODE_MAIL_TRANSPORT: 'outbox' });
});

/** The two session modes a deployment may run. */
const MODES = ['jwt', 'cookie'] as const;

/** What a login hands back, and the headers that carry the session on the next request. */
interface SignedIn {
    response: Awaited<ReturnType<typeof logIn>>;
    /** The credential(s) a client presents, in the shape the mode gives them. */
    headers: Record<string, string>;
    /** The session cookie as a `Cookie` header — `jwt` mode's refresh cookie, `cookie` mode's id. */
    cookie: string;
}

/** `POST /account/login` as a browser sends it — no transport, so `cookie` mode answers with a cookie. */
const logIn = (email: string, body: Record<string, unknown> = {}) =>
    api()
        .post('/account/login')
        .set('Origin', FRONTEND)
        .send({ email, password: PLAIN_PASSWORD, ...body });

/**
 * Sign an account in and collect what its client would keep: in `jwt` mode the access token as a
 * bearer AND the refresh cookie (the pair the browser holds), in `cookie` mode the cookie alone.
 */
const signIn = async (email: string, mode: (typeof MODES)[number]): Promise<SignedIn> => {
    const response = await logIn(email);
    expect(response.status).toBe(200);
    const cookie = cookieHeader(response, '__Host-session');
    const headers: Record<string, string> =
        mode === 'jwt'
            ? { Authorization: `Bearer ${response.body.data.token as string}`, Cookie: cookie }
            : { Cookie: cookie };
    return { response, headers, cookie };
};

/** A fresh account and its sign-in. */
const account = async (mode: (typeof MODES)[number], email = 'person@example.com') => {
    const user = await createUser({ email, verifiedAt: new Date() }, 'customer');
    return { user, session: await signIn(email, mode) };
};

/**
 * What a session answers to its own credential, in the way each mode keeps one alive: a `GET
 * /account` in `cookie` mode, a refresh in `jwt` mode. Not the access token: it is stateless, so
 * for up to ten minutes (and, within the second a revocation lands in, past the epoch) it outlives
 * the session it came from — what a revocation ends is the way to get a NEXT one.
 */
const statusOfSession = (session: SignedIn, mode: (typeof MODES)[number]): Promise<number> =>
    statusOfCredential(session.cookie, mode);

/**
 * {@link statusOfSession} for a bare session cookie — one a re-mint or a provider round trip set,
 * with no sign-in of this file's own behind it.
 */
const statusOfCredential = async (cookie: string, mode: (typeof MODES)[number]): Promise<number> =>
    (mode === 'cookie'
        ? await api().get('/account').set('Cookie', cookie)
        : await api().post('/account/refresh').set('Origin', FRONTEND).set('Cookie', cookie)
    ).status;

/** The id of the session `headers` belong to — the one `GET /account/sessions` marks `current`. */
const ownSessionId = (headers: Record<string, string>): Promise<string> =>
    sessionsOf(headers).then((sessions) => {
        const own = sessions.find((entry) => entry.current);
        if (!own) throw new Error('the caller has no current session');
        return own.id;
    });

/** The status `GET /account` answers a `ses_…` id sent as a bearer with. */
const statusOfBearer = (id: string): Promise<number> =>
    api()
        .get('/account')
        .set('Authorization', `Bearer ${id}`)
        .then((response) => response.status);

/** The status `GET /account` answers a bare cookie with. */
const statusOfCookie = (cookie: string): Promise<number> =>
    api()
        .get('/account')
        .set('Cookie', cookie)
        .then((response) => response.status);

/** Poll `read` until it answers something, for a write that lands after the response. */
const eventually = async <T>(read: () => Promise<T | undefined>): Promise<T> => {
    for (let attempt = 0; attempt < 40; attempt += 1) {
        const value = await read();
        if (value !== undefined) return value;
        await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error('the write never landed');
};

/** `GET /account/sessions` as the caller, resolving the list. */
const sessionsOf = async (headers: Record<string, string>) => {
    const response = await api().get('/account/sessions').set(headers);
    expect(response.status).toBe(200);
    return response.body.data.sessions as { id: string; current: boolean; createdAt: string }[];
};

/** Use the session the way each mode keeps one alive; answers the headers to use after. */
const keepAlive = async (
    session: SignedIn,
    mode: (typeof MODES)[number]
): Promise<Record<string, string>> => {
    if (mode === 'cookie') {
        await api().get('/account').set(session.headers);
        return session.headers;
    }
    // jwt: the access token has expired by now — the client refreshes, copying auth_time.
    const refreshed = await api()
        .post('/account/refresh')
        .set('Origin', FRONTEND)
        .set('Cookie', session.cookie);
    expect(refreshed.status).toBe(200);
    return {
        Authorization: `Bearer ${refreshed.body.data.token as string}`,
        Cookie: cookieHeader(refreshed, '__Host-session')
    };
};

/** The three "remember me" tiers and the seconds each one's default keeps a session for. */
const TIERS = [
    ['short', 604_800],
    ['medium', 2_592_000],
    ['long', 31_536_000]
] as const;

/** The `Max-Age` a `Set-Cookie` line carries, in seconds — `undefined` for a browser-session one. */
const maxAgeOf = (line: string | undefined): number | undefined => {
    const match = /max-age=(\d+)/i.exec(line ?? '')?.[1];
    return match === undefined ? undefined : Number(match);
};

/** Whether a `Set-Cookie` line clears its cookie: an expiry in the past, as `res.clearCookie` writes. */
const clears = (line: string | undefined): boolean => /expires=thu, 01 jan 1970/i.test(line ?? '');

/**
 * Arm a TOTP factor on the account `headers` signs in, the way the settings page does: setup, then
 * confirm with a current code. `Origin` rides along because a `cookie`-mode write checks it.
 *
 * @returns the confirm response (it re-mints the caller's session) and the factor's secret
 */
const armTotp = async (headers: Record<string, string>) => {
    const setup = await api()
        .post('/account/2fa/methods/totp/setup')
        .set(headers)
        .set('Origin', FRONTEND)
        .send();
    expect(setup.status).toBe(200);
    const { secret } = setup.body.data as { secret: string };
    const confirm = await api()
        .post('/account/2fa/methods/totp/confirm')
        .set(headers)
        .set('Origin', FRONTEND)
        .send({ code: await codeFor(secret, 0) });
    expect(confirm.status).toBe(200);
    return { confirm, secret };
};

/**
 * What the session a cookie names says its holder proved: the refresh token's own `amr` claim in
 * `jwt` mode, the row's field in `cookie` mode, where the id is opaque and the claim lives only in
 * the database.
 */
const claimedBy = async (cookie: string): Promise<unknown> => {
    const credential = cookieValue(cookie);
    // jose: the payload, unverified — the test only reads back what the app itself signed.
    // https://github.com/panva/jose/blob/main/docs/util/decode_jwt/functions/decodeJwt.md
    if (!credential.startsWith('ses_')) return decodeJwt(credential).amr;
    const row = await sessionRowFor(credential);
    return row?.amr;
};

/** One full start → callback round trip through the `fake` OAuth provider. */
const oauthLogin = async () => {
    const start = await api().get('/account/oauth/fake');
    const callback = new URL(start.headers.location);
    return api()
        .get(callback.pathname + callback.search)
        .set('Cookie', cookieHeader(start, 'oauth_state', 'oauth_verifier'));
};

describe.each(MODES)('sessions in %s mode', (mode) => {
    beforeEach(() => {
        setEnvironment({ NODE_SESSION_MODE: mode });
    });

    it('answers what mode it is, with no credential at all', async () => {
        const response = await api().get('/account/session-config');

        expect(response.status).toBe(200);
        expect(response.body.data).toEqual({ mode });
    });

    it('starts a session the next request is authenticated by', async () => {
        const { session } = await account(mode);

        const response = await api().get('/account').set(session.headers);

        expect(response.status).toBe(200);
    });

    it('lists the session, once, marked as the caller’s own', async () => {
        const { session } = await account(mode);

        const sessions = await sessionsOf(session.headers);

        expect(sessions).toHaveLength(1);
        expect(sessions[0]?.current).toBe(true);
    });

    it('says when the sign-in happened', async () => {
        const { user, session } = await account(mode);
        const [listed] = await sessionsOf(session.headers);
        const [row] = await sessionRowsOf(user.id);

        expect(listed).toHaveProperty('createdAt', row?.startedAt.toISOString());
    });

    it('never puts the credential in the list, or in the database', async () => {
        const { user, session } = await account(mode);
        const credential = decodeURIComponent(session.cookie.split('=', 2)[1] ?? '');

        const listed = await api().get('/account/sessions').set(session.headers);
        const body = JSON.stringify(listed.body);
        const rows = await sessionRowsOf(user.id);

        expect(body).not.toContain(credential);
        expect(JSON.stringify(rows)).not.toContain(credential);
        expect(rows.map((row) => row.tokenHash)).toContain(hashToken(credential));
    });

    it('logs out THIS session only, leaving the other device signed in', async () => {
        const { user, session } = await account(mode);
        const other = await signIn(user.email, mode);

        const out = await api()
            .post('/account/logout')
            .set('Origin', FRONTEND)
            .set('Cookie', session.cookie);

        expect(out.status).toBe(200);
        expect(await sessionsOf(other.headers)).toHaveLength(1);
        expect(await sessionRowsOf(user.id)).toHaveLength(1);
        expect(await statusOfSession(session, mode)).toBe(401);
        expect(await statusOfSession(other, mode)).toBe(200);
    });

    it('logs out everywhere, the caller included', async () => {
        const { user, session } = await account(mode);
        const other = await signIn(user.email, mode);

        const out = await api().post('/account/logout-all').set(session.headers);

        expect(out.status).toBe(200);
        expect(await sessionRowsOf(user.id)).toEqual([]);
        expect(await statusOfSession(session, mode)).toBe(401);
        expect(await statusOfSession(other, mode)).toBe(401);
    });

    it('revokes one session by its id, and that session stops working', async () => {
        const { user, session } = await account(mode);
        const other = await signIn(user.email, mode);
        const otherId = await ownSessionId(other.headers);

        const revoked = await api().delete(`/account/sessions/${otherId}`).set(session.headers);

        expect(revoked.status).toBe(200);
        const remaining = await sessionsOf(session.headers);
        expect(remaining.map((entry) => entry.id)).not.toContain(otherId);
        expect(remaining).toHaveLength(1);
        expect(await statusOfSession(other, mode)).toBe(401);
        expect(await statusOfSession(session, mode)).toBe(200);
    });

    it('answers 404 for an id that is not one of the caller’s sessions', async () => {
        const { session } = await account(mode);
        const stranger = await createUser({ email: 'stranger@example.com' });
        const strangerSession = await signIn(stranger.email, mode);
        const strangerId = await ownSessionId(strangerSession.headers);

        const response = await api().delete(`/account/sessions/${strangerId}`).set(session.headers);

        expect(response.status).toBe(404);
        expect(await sessionsOf(strangerSession.headers)).toHaveLength(1);
    });

    it('keeps the caller signed in through a password change, and ends every other session', async () => {
        const { user, session } = await account(mode);
        await signIn(user.email, mode);

        const changed = await api()
            .post('/account/password')
            .set(session.headers)
            .set('Origin', FRONTEND)
            .send({
                currentPassword: PLAIN_PASSWORD,
                password: REPLACEMENT_PASSWORD,
                passwordConfirm: REPLACEMENT_PASSWORD
            });

        expect(changed.status).toBe(200);
        const renewed = cookieHeader(changed, '__Host-session');
        expect(await sessionRowsOf(user.id)).toHaveLength(1);
        // jwt mode: a bearer-only `GET /account` needs the new access token the body carries.
        const stillIn =
            mode === 'jwt'
                ? await api()
                      .get('/account')
                      .set('Authorization', `Bearer ${changed.body.data.token as string}`)
                : await api().get('/account').set('Cookie', renewed);
        expect(stillIn.status).toBe(200);
        expect(await statusOfSession(session, mode)).toBe(401);
    });

    it('keeps the "remember me" choice through a password change', async () => {
        const user = await createUser(
            { email: 'remembered@example.com', verifiedAt: new Date() },
            'customer'
        );
        const login = await logIn(user.email, { remember: 'medium' });
        const cookie = cookieHeader(login, '__Host-session');
        const headers =
            mode === 'jwt'
                ? { Authorization: `Bearer ${login.body.data.token as string}`, Cookie: cookie }
                : { Cookie: cookie };

        const changed = await api()
            .post('/account/password')
            .set(headers)
            .set('Origin', FRONTEND)
            .send({
                currentPassword: PLAIN_PASSWORD,
                password: REPLACEMENT_PASSWORD,
                passwordConfirm: REPLACEMENT_PASSWORD
            });

        expect(setCookie(changed, '__Host-session')).toMatch(/max-age=\d+/i);
    });

    it('sets a browser-session cookie when the box is unticked, and a persistent one when ticked', async () => {
        const user = await createUser({ email: 'tiers@example.com', verifiedAt: new Date() });

        const unticked = await logIn(user.email);
        const ticked = await logIn(user.email, { remember: 'long' });

        expect(setCookie(unticked, '__Host-session')).not.toMatch(/max-age|expires/i);
        expect(setCookie(ticked, '__Host-session')).toMatch(/max-age=\d+/i);
    });

    describe('step-up: a session kept alive is not a fresh login', () => {
        afterEach(() => jest.useRealTimers());

        it('asks for the password again past the window, whatever it did in between', async () => {
            const { session } = await account(mode);
            freezeDate();
            advanceDate(16 * 60 * 1000);

            const headers = await keepAlive(session, mode);
            const sensitive = await api().post('/account/logout-all').set(headers);

            expect(sensitive.status).toBe(401);
            expect(sensitive.body.errors[0].code).toBe('REAUTH_REQUIRED');
        });

        it('is satisfied by POST /account/reauth, which renews the proof', async () => {
            const { session } = await account(mode);
            freezeDate();
            advanceDate(16 * 60 * 1000);
            const headers = await keepAlive(session, mode);

            const reauth = await api()
                .post('/account/reauth')
                .set(headers)
                .set('Origin', FRONTEND)
                .send({ method: 'password', password: PLAIN_PASSWORD });
            expect(reauth.status).toBe(200);
            const renewed =
                mode === 'jwt'
                    ? { Authorization: `Bearer ${reauth.body.data.token as string}` }
                    : { Cookie: cookieHeader(reauth, '__Host-session') };
            const sensitive = await api().post('/account/logout-all').set(renewed);

            expect(sensitive.status).toBe(200);
        });
    });

    it('refuses a first session for an account with a second factor armed, and stores nothing', async () => {
        const user = await createUser({
            twoFactorEnabledAt: new Date().toISOString(),
            twoFactorMethods: [{ method: 'totp', enrolledAt: new Date(), secret: 'ciphertext' }]
        });
        const request = asStub<SessionRequest & { get: () => undefined }>({
            cookies: {},
            headers: {},
            get: () => undefined
        });
        const response = asStub<Response>({ cookie: jest.fn(), clearCookie: jest.fn() });

        await expect(
            activeStrategy().issue(request, response, user.id, { amr: ['pwd'] })
        ).rejects.toBeInstanceOf(SecondFactorRequiredError);
        expect(await sessionRowsOf(user.id)).toEqual([]);

        await expect(
            activeStrategy().issue(request, response, user.id, { amr: ['pwd', 'otp'] })
        ).resolves.toBeDefined();
        expect(await sessionRowsOf(user.id)).toHaveLength(1);
    });

    it('opens the SSE streams by cookie: a signed-in non-admin is refused 403, a stranger 401', async () => {
        const { session } = await account(mode);

        const signedIn = await api().get('/observability/events').set('Cookie', session.cookie);
        const stranger = await api()
            .get('/observability/events')
            .set('Cookie', '__Host-session=not-a-real-credential');

        expect(signedIn.status).toBe(403);
        expect(stranger.status).toBe(401);
    });

    it('stops a deactivated account’s session on its very next request', async () => {
        const { user, session } = await account(mode);

        await userRepository.updateMany({ _id: user.id }, { $set: { active: false } });
        const response = await api().get('/account').set(session.headers);

        expect(response.status).toBe(401);
    });

    it.each(TIERS)(
        'keeps a session ticked "%s" for that tier, in its cookie, its hint and its row',
        async (tier, seconds) => {
            const user = await createUser({ email: `${tier}@example.com`, verifiedAt: new Date() });
            const before = Date.now();

            const login = await logIn(user.email, { remember: tier });

            const credential = maxAgeOf(setCookie(login, '__Host-session'));
            // `cookie` mode counts down from the row's own expiry, so a second can tick away.
            expect(credential).toBeGreaterThanOrEqual(seconds - 2);
            expect(credential).toBeLessThanOrEqual(seconds);
            expect(maxAgeOf(setCookie(login, 'isAuth'))).toBe(credential);
            const [row] = await sessionRowsOf(user.id);
            expect(row?.expiresAt.getTime()).toBeGreaterThanOrEqual(before + seconds * 1000);
            expect(row?.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + seconds * 1000);
        }
    );

    it('bounds an unticked browser-session login by the short tier on the server', async () => {
        const user = await createUser({ email: 'unticked@example.com', verifiedAt: new Date() });
        const before = Date.now();

        const login = await logIn(user.email);

        expect(maxAgeOf(setCookie(login, 'isAuth'))).toBeUndefined();
        const [row] = await sessionRowsOf(user.id);
        expect(row?.expiresAt.getTime()).toBeGreaterThanOrEqual(before + TIERS[0][1] * 1000);
    });

    it('sets a script-readable `isAuth` hint beside the credential, and logout clears both', async () => {
        const { session } = await account(mode);
        const hint = setCookie(session.response, 'isAuth') ?? '';

        const out = await api()
            .post('/account/logout')
            .set('Origin', FRONTEND)
            .set('Cookie', session.cookie);

        expect(hint).toMatch(/^isAuth=true;/);
        expect(hint).not.toMatch(/;\s*HttpOnly/i);
        expect(hint).toMatch(/;\s*SameSite=Lax/i);
        expect(clears(setCookie(out, '__Host-session'))).toBe(true);
        expect(clears(setCookie(out, 'isAuth'))).toBe(true);
    });

    it('ends every session when a mailed password reset completes', async () => {
        const { user, session } = await account(mode);
        const other = await signIn(user.email, mode);
        await plantToken(user.id, 'password', 'reset-link');

        const reset = await api().post('/account/reset-confirm').send({
            token: 'reset-link',
            password: REPLACEMENT_PASSWORD,
            passwordConfirm: REPLACEMENT_PASSWORD
        });

        expect(reset.status).toBe(200);
        expect(clears(setCookie(reset, '__Host-session'))).toBe(true);
        expect(await sessionRowsOf(user.id)).toEqual([]);
        expect(await statusOfSession(session, mode)).toBe(401);
        expect(await statusOfSession(other, mode)).toBe(401);
    });

    it('completes a 2FA login on the right code, with a session that claims the factor', async () => {
        const { user, session } = await account(mode);
        const { secret } = await armTotp(session.headers);

        const challenge = await logIn(user.email);
        expect(setCookie(challenge, '__Host-session')).toBeUndefined();
        const finished = await api()
            .post('/account/login/2fa')
            .set('Origin', FRONTEND)
            .send({ challenge: challenge.body.data.challenge, code: await codeFor(secret, 1) });

        expect(finished.status).toBe(200);
        const cookie = cookieHeader(finished, '__Host-session');
        expect(await claimedBy(cookie)).toEqual(['pwd', 'otp']);
        expect(await statusOfCredential(cookie, mode)).toBe(200);
    });

    it('keeps the acting browser signed in when it arms a second factor, and ends every other session', async () => {
        const { user, session } = await account(mode);
        const other = await signIn(user.email, mode);

        const { confirm } = await armTotp(session.headers);

        const reminted = cookieHeader(confirm, '__Host-session');
        expect(reminted).not.toBe(session.cookie);
        // Read before anything is presented: a `jwt` refresh below writes a row of its own.
        expect(await sessionRowsOf(user.id)).toEqual([expect.objectContaining({ mode })]);
        expect(await claimedBy(reminted)).toEqual(['pwd', 'otp']);
        expect(await statusOfCredential(reminted, mode)).toBe(200);
        expect(await statusOfSession(other, mode)).toBe(401);
    });

    it('signs a provider login in with a session of this mode', async () => {
        const callback = await oauthLogin();

        expect(callback.status).toBe(302);
        const cookie = cookieHeader(callback, '__Host-session');
        const created = await userRepository.findOne({ email: 'oauth.demo@example.com' });
        const rows = await sessionRowsOf(String(created?._id));
        expect(rows.map((row) => row.mode)).toEqual([mode]);
        expect(await statusOfCredential(cookie, mode)).toBe(200);
    });
});

describe('cookie mode only', () => {
    beforeEach(() => {
        setEnvironment({ NODE_SESSION_MODE: 'cookie' });
    });

    it('sets one cookie and puts no credential in the body', async () => {
        await createUser({ email: 'browser@example.com' });

        const response = await logIn('browser@example.com');

        expect(response.status).toBe(200);
        expect(response.body.data).toEqual({});
        const header = setCookie(response, '__Host-session') ?? '';
        expect(header).toMatch(/;\s*HttpOnly/i);
        expect(header).toMatch(/;\s*Secure/i);
        expect(header).toMatch(/;\s*SameSite=Lax/i);
        expect(header).toMatch(/;\s*Path=\//i);
        expect(header).not.toMatch(/;\s*Domain=/i);
        expect(header.split(';', 1)[0]).toMatch(/^__Host-session=ses_[\w-]{43}$/);
    });

    it('hands a client with no cookie jar a `ses_` id instead, and sets no cookie', async () => {
        await createUser({ email: 'script@example.com' });

        const response = await logIn('script@example.com', { transport: 'bearer' });

        expect(setCookie(response, '__Host-session')).toBeUndefined();
        expect(response.body.data.sessionToken).toMatch(/^ses_[\w-]{43}$/);
        const authed = await api()
            .get('/account/sessions')
            .set('Authorization', `Bearer ${response.body.data.sessionToken as string}`);
        expect(authed.status).toBe(200);
        expect(
            authed.body.data.sessions.map((entry: { current: boolean }) => entry.current)
        ).toEqual([true]);
    });

    it('names the device from the User-Agent at sign-in, and keeps it through a re-proof', async () => {
        const user = await createUser({ email: 'device@example.com', verifiedAt: new Date() });
        const login = await logIn(user.email).set(
            'User-Agent',
            'Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0'
        );
        const headers = { Cookie: cookieHeader(login, '__Host-session') };

        const [listed] = await sessionsOf(headers);
        const reauth = await api()
            .post('/account/reauth')
            .set(headers)
            .set('Origin', FRONTEND)
            .send({ method: 'password', password: PLAIN_PASSWORD });
        const [after] = await sessionsOf({ Cookie: cookieHeader(reauth, '__Host-session') });

        expect(listed).toHaveProperty('device', 'Firefox on Linux');
        expect(after).toHaveProperty('device', 'Firefox on Linux');
    });

    it('keeps the sign-in moment and the public id through a re-proof', async () => {
        const user = await createUser({ email: 'moment@example.com', verifiedAt: new Date() });
        const login = await logIn(user.email);
        const headers = { Cookie: cookieHeader(login, '__Host-session') };
        const [listed] = await sessionsOf(headers);

        const reauth = await api()
            .post('/account/reauth')
            .set(headers)
            .set('Origin', FRONTEND)
            .send({ method: 'password', password: PLAIN_PASSWORD });
        const [after] = await sessionsOf({ Cookie: cookieHeader(reauth, '__Host-session') });

        expect(after).toHaveProperty('createdAt', listed?.createdAt);
        expect(after?.id).toBe(listed?.id);
    });

    it('leaves the device off for a client that names neither a browser nor a system', async () => {
        const user = await createUser({ email: 'script-device@example.com' });
        const login = await logIn(user.email, { transport: 'bearer' }).set(
            'User-Agent',
            'curl/8.5.0'
        );

        const [listed] = await sessionsOf({
            Authorization: `Bearer ${login.body.data.sessionToken as string}`
        });

        expect(listed).not.toHaveProperty('device');
    });

    it('stores a `cookie` row for the sign-in, with its proof', async () => {
        const user = await createUser({ email: 'proof@example.com' });
        const before = Math.floor(Date.now() / 1000);

        await logIn(user.email);

        const [row] = await sessionRowsOf(user.id);
        expect(row).toMatchObject({ mode: 'cookie', amr: ['pwd'] });
        expect(row?.authTime).toBeGreaterThanOrEqual(before);
    });

    it('refuses a state-changing request from a foreign origin, valid cookie or not', async () => {
        const { user, session } = await account('cookie');

        const response = await api()
            .post('/account/logout-all')
            .set('Cookie', session.cookie)
            .set('Origin', 'https://evil.example');

        expect(response.status).toBe(403);
        expect(await sessionRowsOf(user.id)).toHaveLength(1);
    });

    it('lets the same request through from the frontend, and from no Origin at all', async () => {
        const { session } = await account('cookie');
        const second = await signIn('person@example.com', 'cookie');

        const fromFrontend = await api()
            .post('/account/logout-all')
            .set('Cookie', session.cookie)
            .set('Origin', FRONTEND);
        const noOrigin = await api().post('/account/logout-all').set('Cookie', second.cookie);

        expect(fromFrontend.status).toBe(200);
        // The first call ended every session, the second signed-in one included.
        expect(noOrigin.status).toBe(401);
    });

    it('does not ask a bearer-authenticated write for an origin: nothing rides along ambiently', async () => {
        const user = await createUser({ email: 'header@example.com', verifiedAt: new Date() });
        const login = await logIn(user.email, { transport: 'bearer' });

        const response = await api()
            .post('/account/logout-all')
            .set('Authorization', `Bearer ${login.body.data.sessionToken as string}`)
            .set('Origin', 'https://evil.example');

        expect(response.status).toBe(200);
    });

    it('hands a bearer client its re-proof and its password change in the body, never as a cookie', async () => {
        const user = await createUser({
            email: 'bearer-proof@example.com',
            verifiedAt: new Date()
        });
        const login = await logIn(user.email, { transport: 'bearer' });
        const first = login.body.data.sessionToken as string;

        const reauth = await api()
            .post('/account/reauth')
            .set('Authorization', `Bearer ${first}`)
            .send({ method: 'password', password: PLAIN_PASSWORD });
        const second = reauth.body.data.sessionToken as string;
        const changed = await api()
            .post('/account/password')
            .set('Authorization', `Bearer ${second}`)
            .send({
                currentPassword: PLAIN_PASSWORD,
                password: REPLACEMENT_PASSWORD,
                passwordConfirm: REPLACEMENT_PASSWORD
            });
        const third = changed.body.data.sessionToken as string;

        expect(reauth.status).toBe(200);
        expect(changed.status).toBe(200);
        expect(setCookie(reauth, '__Host-session')).toBeUndefined();
        expect(setCookie(changed, '__Host-session')).toBeUndefined();
        expect(new Set([first, second, third]).size).toBe(3);
        expect(await statusOfBearer(first)).toBe(401);
        expect(await statusOfBearer(second)).toBe(401);
        expect(await statusOfBearer(third)).toBe(200);
        expect(await sessionRowsOf(user.id)).toHaveLength(1);
    });

    it('logs a bearer client out by its header, leaving the browser beside it signed in', async () => {
        const { user, session } = await account('cookie', 'two-clients@example.com');
        const script = await logIn(user.email, { transport: 'bearer' });
        const id = script.body.data.sessionToken as string;

        const out = await api().post('/account/logout').set('Authorization', `Bearer ${id}`);

        expect(out.status).toBe(200);
        expect(await statusOfBearer(id)).toBe(401);
        expect(await statusOfCookie(session.cookie)).toBe(200);
        expect(await sessionRowsOf(user.id)).toHaveLength(1);
    });

    it('completes a 2FA login on the bearer transport with the id in the body', async () => {
        const { user, session } = await account('cookie', 'bearer-2fa@example.com');
        const { secret } = await armTotp(session.headers);
        const challenge = await logIn(user.email);

        const finished = await api()
            .post('/account/login/2fa')
            .send({
                challenge: challenge.body.data.challenge,
                code: await codeFor(secret, 1),
                transport: 'bearer'
            });

        expect(finished.status).toBe(200);
        expect(setCookie(finished, '__Host-session')).toBeUndefined();
        expect(finished.body.data.sessionToken).toMatch(/^ses_[\w-]{43}$/);
        const authed = await api()
            .get('/account')
            .set('Authorization', `Bearer ${finished.body.data.sessionToken as string}`);
        expect(authed.status).toBe(200);
    });

    it('answers 404 to POST /account/refresh: there is no refresh token to rotate', async () => {
        const { session } = await account('cookie');

        const response = await api()
            .post('/account/refresh')
            .set('Origin', FRONTEND)
            .set('Cookie', session.cookie);

        expect(response.status).toBe(404);
    });

    it('renews the id on a re-proof, keeping the session’s public id and expiry', async () => {
        const { user, session } = await account('cookie');
        const [before] = await sessionRowsOf(user.id);
        const publicId = await ownSessionId(session.headers);

        const reauth = await api()
            .post('/account/reauth')
            .set('Cookie', session.cookie)
            .set('Origin', FRONTEND)
            .send({ method: 'password', password: PLAIN_PASSWORD });

        const renewed = cookieHeader(reauth, '__Host-session');
        expect(renewed).not.toBe(session.cookie);
        // The old id is dead; the new one is the same session, and one row remains.
        expect(await statusOfCookie(session.cookie)).toBe(401);
        expect(await statusOfCookie(renewed)).toBe(200);
        const rows = await sessionRowsOf(user.id);
        expect(rows).toHaveLength(1);
        expect(String(rows[0]?.familyId)).toBe(publicId);
        expect(rows[0]?.startedAt).toEqual(before?.startedAt);
        expect(rows[0]?.expiresAt).toEqual(before?.expiresAt);
        expect(rows[0]?.authTime).toBeGreaterThanOrEqual(
            before?.authTime ?? Number.MAX_SAFE_INTEGER
        );
    });

    it('treats an id that expired as gone, even before the database has deleted the row', async () => {
        const { user, session } = await account('cookie');
        freezeDate();
        advanceDate(8 * 24 * 60 * 60 * 1000);

        const response = await api().get('/account').set(session.headers);
        jest.useRealTimers();

        expect(response.status).toBe(401);
        expect(await sessionRowsOf(user.id)).toHaveLength(1);
    });

    it('stamps the use of a session at most once a minute', async () => {
        const { user, session } = await account('cookie');

        await api().get('/account').set(session.headers);
        // The stamp is written off the request's path, so wait for it rather than for the response.
        const first = await eventually(async () => {
            const [row] = await sessionRowsOf(user.id);
            return row?.lastUsedAt ? row : undefined;
        });
        await api().get('/account').set(session.headers);
        await new Promise((resolve) => setTimeout(resolve, 150));
        const [second] = await sessionRowsOf(user.id);

        expect(first?.lastUsedAt).toBeInstanceOf(Date);
        expect(second?.lastUsedAt).toEqual(first?.lastUsedAt);
    });

    it('keeps an account in daily use from looking inactive to the reaper', async () => {
        const { user, session } = await account('cookie');
        const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
        await userRepository.updateMany({ _id: user.id }, { $set: { lastActiveAt: twoDaysAgo } });

        await api().get('/account').set(session.headers);

        // Stamped off the request's path, like the session's own `lastUsedAt`.
        const stamped = await eventually(async () => {
            const doc = await userRepository.findByIdWithCredentials(user.id);
            return doc?.lastActiveAt && doc.lastActiveAt > twoDaysAgo
                ? doc.lastActiveAt
                : undefined;
        });
        expect(stamped).toBeInstanceOf(Date);
    });
});

describe('jwt mode only', () => {
    beforeEach(() => {
        setEnvironment({ NODE_SESSION_MODE: 'jwt' });
    });

    it('returns an access token and a refresh cookie, with no session id in the body', async () => {
        await createUser({ email: 'classic@example.com' });

        const response = await logIn('classic@example.com');

        expect(response.body.data.token).toEqual(expect.any(String));
        expect(response.body.data.sessionToken).toBeUndefined();
        expect(setCookie(response, '__Host-session')).toBeDefined();
    });

    it('ignores the bearer transport: it always sets its cookie and returns its access token', async () => {
        await createUser({ email: 'ignore@example.com' });

        const response = await logIn('ignore@example.com', { transport: 'bearer' });

        expect(response.body.data.token).toEqual(expect.any(String));
        expect(setCookie(response, '__Host-session')).toBeDefined();
    });

    it('keeps no device label: that is `cookie` mode’s, and the list carries none', async () => {
        const user = await createUser({ email: 'nodevice@example.com' });
        const login = await logIn(user.email).set(
            'User-Agent',
            'Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0'
        );

        const [listed] = await sessionsOf({
            Authorization: `Bearer ${login.body.data.token as string}`,
            Cookie: cookieHeader(login, '__Host-session')
        });

        expect(listed).not.toHaveProperty('device');
    });

    it('does not authenticate an ordinary route by cookie alone', async () => {
        const { session } = await account('jwt');

        const response = await api().get('/account').set('Cookie', session.cookie);

        expect(response.status).toBe(401);
    });

    it('does not accept a `ses_` bearer', async () => {
        const response = await api().get('/account').set('Authorization', 'Bearer ses_nothing');

        expect(response.status).toBe(401);
    });
});

describe('switching mode', () => {
    it('signs everyone out: a jwt login is nothing in cookie mode, and the reverse', async () => {
        const user = await createUser({ email: 'switch@example.com', verifiedAt: new Date() });
        setEnvironment({ NODE_SESSION_MODE: 'jwt' });
        const asJwt = await signIn(user.email, 'jwt');
        setEnvironment({ NODE_SESSION_MODE: 'cookie' });
        const asCookie = await signIn(user.email, 'cookie');

        const jwtInCookieMode = await api().get('/account').set(asJwt.headers);
        setEnvironment({ NODE_SESSION_MODE: 'jwt' });
        const cookieInJwtMode = await api().get('/account').set(asCookie.headers);

        expect(jwtInCookieMode.status).toBe(401);
        expect(cookieInJwtMode.status).toBe(401);
    });

    it('refuses each half of a jwt sign-in on its own in cookie mode: the access token, the refresh cookie', async () => {
        const user = await createUser({ email: 'halves@example.com', verifiedAt: new Date() });
        setEnvironment({ NODE_SESSION_MODE: 'jwt' });
        const asJwt = await signIn(user.email, 'jwt');
        setEnvironment({ NODE_SESSION_MODE: 'cookie' });

        const byAccessToken = await api()
            .get('/account')
            .set('Authorization', asJwt.headers.Authorization ?? '');
        const byRefreshCookie = await api().get('/account').set('Cookie', asJwt.cookie);

        expect(byAccessToken.status).toBe(401);
        expect(byRefreshCookie.status).toBe(401);
    });

    it('refuses a cookie-mode id at the refresh door and on the SSE cookie path in jwt mode', async () => {
        const user = await createUser({ email: 'ses-in-jwt@example.com', verifiedAt: new Date() });
        setEnvironment({ NODE_SESSION_MODE: 'cookie' });
        const asCookie = await signIn(user.email, 'cookie');
        setEnvironment({ NODE_SESSION_MODE: 'jwt' });

        const refresh = await api()
            .post('/account/refresh')
            .set('Origin', FRONTEND)
            .set('Cookie', asCookie.cookie);
        const stream = await api().get('/observability/events').set('Cookie', asCookie.cookie);

        expect(cookieValue(asCookie.cookie)).toMatch(/^ses_/);
        expect(refresh.status).toBe(401);
        expect(stream.status).toBe(401);
    });

    it('lists only the active mode’s sessions', async () => {
        const user = await createUser({ email: 'listing@example.com', verifiedAt: new Date() });
        setEnvironment({ NODE_SESSION_MODE: 'jwt' });
        await signIn(user.email, 'jwt');
        setEnvironment({ NODE_SESSION_MODE: 'cookie' });
        const asCookie = await signIn(user.email, 'cookie');

        expect(await sessionsOf(asCookie.headers)).toHaveLength(1);
    });
});

describe.each(MODES)('ending a session on purpose in %s mode', (mode) => {
    beforeEach(() => {
        setEnvironment({ NODE_SESSION_MODE: mode });
    });

    it('clears the caller’s own cookies when it revokes its own session, as POST /account/logout does', async () => {
        const { session } = await account(mode);
        const own = await ownSessionId(session.headers);

        const revoked = await api().delete(`/account/sessions/${own}`).set(session.headers);

        expect(revoked.status).toBe(200);
        expect(clears(setCookie(revoked, '__Host-session'))).toBe(true);
        expect(clears(setCookie(revoked, 'isAuth'))).toBe(true);
    });

    it('sends no cookie clear when it revokes another device’s session', async () => {
        const { user, session } = await account(mode);
        const other = await signIn(user.email, mode);
        const otherId = await ownSessionId(other.headers);

        const revoked = await api().delete(`/account/sessions/${otherId}`).set(session.headers);

        expect(revoked.status).toBe(200);
        expect(setCookie(revoked, '__Host-session')).toBeUndefined();
        expect(await statusOfSession(session, mode)).toBe(200);
    });

    it('ends the session a new sign-in replaces, so one browser holds one session', async () => {
        const { user, session } = await account(mode);

        const second = await logIn(user.email).set('Cookie', session.cookie);

        expect(second.status).toBe(200);
        expect(await statusOfSession(session, mode)).toBe(401);
        expect(await sessionRowsOf(user.id)).toHaveLength(1);
    });
});

describe('POST /account/refresh during a datastore outage', () => {
    beforeEach(() => {
        setEnvironment({ NODE_SESSION_MODE: 'jwt' });
    });

    it('answers a retryable 503 and leaves the cookie alone, where a refusal would sign the client out', async () => {
        const { session } = await account('jwt');
        jest.spyOn(sessionRepository, 'supersede').mockRejectedValueOnce(
            Object.assign(new Error('unreachable'), { name: 'MongoNetworkError' })
        );

        const refreshed = await api()
            .post('/account/refresh')
            .set('Origin', FRONTEND)
            .set('Cookie', session.cookie);

        expect(refreshed.status).toBe(503);
        expect(refreshed.headers['retry-after']).toBeDefined();
        expect(setCookie(refreshed, '__Host-session')).toBeUndefined();
    });
});

/** `GET /account` with a bearer: 200 while the token and its session live. */
const statusWithBearer = (headers: Record<string, string>): Promise<number> =>
    api()
        .get('/account')
        .set('Authorization', headers.Authorization ?? '')
        .then((response) => response.status);

describe('an access token and the session it belongs to (jwt mode)', () => {
    beforeEach(() => {
        setEnvironment({ NODE_SESSION_MODE: 'jwt' });
    });

    it('dies at once when its session is revoked by id, while another device’s token lives', async () => {
        const { user, session } = await account('jwt');
        const other = await signIn(user.email, 'jwt');
        const otherId = await ownSessionId(other.headers);

        await api().delete(`/account/sessions/${otherId}`).set(session.headers).expect(200);

        expect(await statusWithBearer(other.headers)).toBe(401);
        expect(await statusWithBearer(session.headers)).toBe(200);
    });

    it('dies at once on a plain logout', async () => {
        const { session } = await account('jwt');

        await api()
            .post('/account/logout')
            .set('Origin', FRONTEND)
            .set('Cookie', session.cookie)
            .expect(200);

        expect(await statusWithBearer(session.headers)).toBe(401);
    });

    it('survives a rotation of its own session’s refresh token', async () => {
        const { session } = await account('jwt');

        const refreshed = await api()
            .post('/account/refresh')
            .set('Origin', FRONTEND)
            .set('Cookie', session.cookie);

        expect(refreshed.status).toBe(200);
        expect(await statusWithBearer(session.headers)).toBe(200);
    });

    it('survives a re-proof, which continues the session under a new refresh token', async () => {
        const { session } = await account('jwt');

        const reauth = await api()
            .post('/account/reauth')
            .set(session.headers)
            .set('Origin', FRONTEND)
            .send({ method: 'password', password: PLAIN_PASSWORD });

        expect(reauth.status).toBe(200);
        expect(await statusWithBearer(session.headers)).toBe(200);
    });
});

describe.each(MODES)('a re-proof in %s mode continues the session', (mode) => {
    beforeEach(() => {
        setEnvironment({ NODE_SESSION_MODE: mode });
    });

    it('keeps the session id the owner sees, and its absolute expiry', async () => {
        const { user, session } = await account(mode);
        const [before] = await sessionRowsOf(user.id);
        const publicId = await ownSessionId(session.headers);

        const reauth = await api()
            .post('/account/reauth')
            .set(session.headers)
            .set('Origin', FRONTEND)
            .send({ method: 'password', password: PLAIN_PASSWORD });

        expect(reauth.status).toBe(200);
        const rows = await sessionRowsOf(user.id);
        expect(rows).toHaveLength(1);
        expect(String(rows[0]?.familyId)).toBe(publicId);
        expect(rows[0]?.startedAt).toEqual(before?.startedAt);
        expect(rows[0]?.expiresAt).toEqual(before?.expiresAt);
    });
});
