/**
 * @module
 * Contract tests for the self-service /account surface: profile update, password change,
 * single-session logout, sessions listing and email verification. These get scenario coverage,
 * unlike the unit suites' generated-payload sweep, because their contract branches hinge on state
 * no random payload can set up — a second account holding the email, a revoked cookie, a spent
 * token, someone else's session. Listing assertions check IDs, never just lengths.
 */

import '@tests/contract';
import { setupTestDb } from '@tests/setup-test-db';
import { api, authenticateAs, bearerForCookie, loginBearer } from '@tests/http';
import { requestAndDownloadExport } from '@tests/account-export';
import { setCookie, cookieHeader } from '@tests/cookies';
import { setEnvironment } from '@tests/environment';
import { createUser, PLAIN_PASSWORD, REPLACEMENT_PASSWORD } from '@modules/users/tests/factories';
import { userRepository } from '@modules/users/tests/factories';
import { EMAIL_VERIFY_TOKEN_TYPE } from '@modules/account/services';
import { userService } from '@modules/users';
import { decodeJwt } from 'jose';
import { logger } from '@infrastructure/adapters/logger';
import * as mailerPort from '@infrastructure/adapters/mailer';
import { translator } from '@infrastructure/i18n';
import {
    changePasswordBodyPasswordMin,
    confirmPasswordResetBodyPasswordMin
} from '@api/schemas.zod';
import { WEAK_PASSWORD } from '@modules/users/tests/factories';
import { loginWithCookie } from './support';
import { getSessionMode } from '../../session/config';
import {
    getExpiryTime,
    getAccessExpiryTime,
    RefreshTokenExpiryTime
} from '@modules/account/session/config';
import { MISSING_ID } from '@tests/ids';
import { freezeDate, advanceDate } from '@tests/clock';
import { reauthWindowSeconds } from '@kernel/config';
import { plantToken, tokenRowOf } from '../factories';
import { sessionRepository } from '../../repository';
import { emptyFileSandbox } from '@tests/file-sandbox';
import { settleInlineExports } from '../../services/export';

setupTestDb();

// A requested export is built in the background and written to the sandbox: wait, then sweep.
afterEach(() => settleInlineExports().then(emptyFileSandbox));

/*
 * The mailer is REPLACED, not spied on — same reasoning as the audit/analytics ports elsewhere
 * (`jest.spyOn` cannot redefine the non-configurable getter a CommonJS namespace import exposes
 * under swc). Needed here because a token is a digest at rest: the plaintext verify
 * token this suite submits to `/account/verify-confirm` only ever exists in the emailed link,
 * never in storage — see `verifyTokenFromMail` below.
 */
jest.mock('@infrastructure/adapters/mailer', () => ({
    __esModule: true,
    ...jest.requireActual('@infrastructure/adapters/mailer'),
    enqueueEmail: jest.fn().mockResolvedValue(undefined)
}));

/** Whether the account holds a verify token — a digest at rest, so only presence is checkable. */
const readVerifyToken = (userId: string) =>
    tokenRowOf(userId, EMAIL_VERIFY_TOKEN_TYPE).then((row) => row?.tokenHash);

/**
 * The PLAINTEXT verify token from the most recently queued mail — what the link in the email
 * actually carries. `verificationtokens.tokenHash` is a `hashToken` digest at rest, so this suite cannot read
 * the usable token back from storage; it has to observe it the same way the account holder
 * would, via `verifyRequestEmail`'s `linkUrl`'s own `#token=` fragment.
 *
 * Reads `mailerPort.enqueueEmail` directly rather than through `observePort` (`@tests/ports`):
 * that helper CLEARS the mock's history on hand-out, which would erase the very call this reads.
 */
const verifyTokenFromMail = (): string => {
    const enqueueEmail = mailerPort.enqueueEmail as jest.MockedFunction<
        typeof mailerPort.enqueueEmail
    >;
    const lastCall = enqueueEmail.mock.calls.at(-1);
    const data = lastCall?.[2] as { linkUrl?: string } | undefined;
    const token = /#token=([^&]+)/.exec(data?.linkUrl ?? '')?.[1];
    if (!token) throw new Error('no verify token found in the queued mail');
    return decodeURIComponent(token);
};

/**
 * The queued mail addressed to `to` — a SEARCH, not "the last one": a genuine `PATCH /account`
 * email change queues two mails per request (the notice to the OLD address, the link to the
 * NEW one), so reading only the last call would miss the notice.
 */
const mailTo = (to: string) => {
    const enqueueEmail = mailerPort.enqueueEmail as jest.MockedFunction<
        typeof mailerPort.enqueueEmail
    >;
    return enqueueEmail.mock.calls.find(([envelope]) => envelope.to === to);
};

/** `Max-Age` of the named cookie on a response, in seconds. */
const cookieMaxAge = (response: { headers: Record<string, unknown> }, name: string) => {
    const match = setCookie(response, name)?.match(/max-age=(\d+)/i);
    return match ? Number(match[1]) : undefined;
};

/**
 * Pins `NODE_SESSION_MODE=jwt` for a case about the access/refresh pair itself: rotation, the
 * access token's own window, the refresh cookie a bearer call sets. Every other case in this file
 * runs in whichever mode the suite runs in, and `npm run test:contract:cookie` runs them all.
 */
const inJwtMode = (): void => setEnvironment({ NODE_SESSION_MODE: 'jwt' });

/**
 * Whether the session a cookie names is still alive: `POST /account/refresh` in `jwt` mode, which
 * answers 200 for a live refresh token and 401 for a dead one, and `GET /account` in `cookie` mode,
 * which has no refresh and where the cookie alone authenticates.
 *
 * @param cookie - the session cookie as a `Cookie` header
 * @returns the status the probe answered
 */
const statusOfSession = async (cookie: string): Promise<number> =>
    (getSessionMode() === 'cookie'
        ? await api().get('/account').set('Cookie', cookie)
        : await api().post('/account/refresh').set('Cookie', cookie)
    ).status;

describe('POST /account/login — remember me', () => {
    it('sizes the refresh cookie by the requested tier', async () => {
        const user = await createUser();
        const response = await api()
            .post('/account/login')
            .send({ email: user.email, password: PLAIN_PASSWORD, remember: 'medium' });

        expect(response.status).toBe(200);
        // Read through the same accessor the app signs with, not the raw variable: the tiers carry
        // code-side defaults, so an environment that never sets them still has a right answer.
        const expected = getExpiryTime(RefreshTokenExpiryTime.MEDIUM);
        // `jwt` counts the tier exactly; `cookie` counts what is left of the row, which a second
        // may already have eaten into.
        expect(cookieMaxAge(response, '__Host-session')).toBeGreaterThan(expected - 5);
        expect(cookieMaxAge(response, '__Host-session')).toBeLessThanOrEqual(expected);
        // The UI hint expires in step with the credential it describes.
        expect(cookieMaxAge(response, 'isAuth')).toBe(cookieMaxAge(response, '__Host-session'));
    });

    it('sets browser-session cookies (no Max-Age, no Expires) when no tier is asked for', async () => {
        const user = await createUser();
        const response = await api()
            .post('/account/login')
            .send({ email: user.email, password: PLAIN_PASSWORD });

        expect(response.status).toBe(200);
        for (const name of ['__Host-session', 'isAuth']) {
            expect(setCookie(response, name)).toBeDefined();
            expect(cookieMaxAge(response, name)).toBeUndefined();
            expect(setCookie(response, name)).not.toMatch(/expires=/i);
        }
    });

    it('still gives the access token the short window, not the refresh fallback', async () => {
        inJwtMode();
        const user = await createUser();
        const response = await api()
            .post('/account/login')
            .send({ email: user.email, password: PLAIN_PASSWORD });

        const { iat, exp } = decodeJwt(response.body.data.token) as { iat: number; exp: number };
        expect(exp - iat).toBe(getAccessExpiryTime());
        expect(getAccessExpiryTime()).toBeLessThan(getExpiryTime());
    });

    it('answers 422 for a tier the contract does not declare, before checking credentials', async () => {
        const response = await api()
            .post('/account/login')
            .send({ email: 'nobody@example.com', password: 'whatever-it-is', remember: 'forever' });

        expect(response.status).toBe(422);
    });
});

/**
 * Log in choosing (or not) the "remember me" tier, keeping the bearer and the refresh cookie.
 *
 * @param remember - the tier to tick, omitted for a browser-session login
 * @param email - the account's address, only when a case needs two accounts
 */
const loginRemembering = async (remember?: 'short' | 'medium' | 'long', email?: string) => {
    const user = await createUser(email ? { email } : {});
    const response = await api()
        .post('/account/login')
        .send({ email: user.email, password: PLAIN_PASSWORD, ...(remember && { remember }) });
    const jwtCookie = setCookie(response, '__Host-session');
    if (!jwtCookie) throw new Error('login set no jwt cookie');
    return {
        user,
        bearer: `Bearer ${response.body.data.token as string}` as const,
        jwtCookie,
        // What the browser sends next: `jwt` mode needs the access token beside the refresh
        // cookie, `cookie` mode the cookie alone (a bearer would make the reply a bearer's: no cookie).
        headers: (getSessionMode() === 'cookie'
            ? { Cookie: jwtCookie }
            : {
                  Authorization: `Bearer ${response.body.data.token as string}`,
                  Cookie: jwtCookie
              }) as Record<string, string>
    };
};

/** Asserts the response sets BOTH session cookies with no `Max-Age` and no `Expires`. */
const expectSessionCookies = (response: { headers: Record<string, unknown> }) => {
    for (const name of ['__Host-session', 'isAuth']) {
        expect(setCookie(response, name)).toBeDefined();
        expect(cookieMaxAge(response, name)).toBeUndefined();
        expect(setCookie(response, name)).not.toMatch(/expires=/i);
    }
};

describe('the username ceiling', () => {
    // The name prints in greetings, lists and mail, so its length is bounded at the edge (50).
    it('refuses a signup whose username is past 50 characters', async () => {
        const response = await api()
            .post('/account/signup')
            .send({
                email: 'long-name@example.com',
                username: 'x'.repeat(51),
                password: PLAIN_PASSWORD,
                passwordConfirm: PLAIN_PASSWORD,
                termsAccepted: true
            });

        expect(response.status).toBe(422);
    });

    it('accepts one of exactly 50', async () => {
        const response = await api()
            .post('/account/signup')
            .send({
                email: 'name-at-limit@example.com',
                username: 'x'.repeat(50),
                password: PLAIN_PASSWORD,
                passwordConfirm: PLAIN_PASSWORD,
                termsAccepted: true
            });

        expect(response.status).toBe(201);
    });
});

describe('the "remember me" choice survives every re-mint', () => {
    const MEDIUM = getExpiryTime(RefreshTokenExpiryTime.MEDIUM);

    it('signup gets browser-session cookies', async () => {
        const response = await api().post('/account/signup').send({
            email: 'session-signup@example.com',
            username: 'sessionsignup',
            password: PLAIN_PASSWORD,
            passwordConfirm: PLAIN_PASSWORD,
            termsAccepted: true
        });

        expect(response.status).toBe(201);
        expectSessionCookies(response);
    });

    it('refresh rotation keeps a browser-session login a session cookie', async () => {
        inJwtMode();
        const { jwtCookie } = await loginRemembering();

        const rotated = await api().post('/account/refresh').set('Cookie', jwtCookie);
        expect(rotated.status).toBe(200);
        expectSessionCookies(rotated);

        // A second rotation, off the rotated cookie: the flag must survive being copied twice.
        const again = await api()
            .post('/account/refresh')
            .set('Cookie', setCookie(rotated, '__Host-session')!);
        expect(again.status).toBe(200);
        expectSessionCookies(again);
    });

    it('refresh rotation keeps a remembered login persistent, for what is left of its window', async () => {
        inJwtMode();
        const { jwtCookie } = await loginRemembering('medium');

        const rotated = await api().post('/account/refresh').set('Cookie', jwtCookie);

        expect(rotated.status).toBe(200);
        // Rotation carries the REMAINING lifetime, so a whole second may have elapsed.
        expect(cookieMaxAge(rotated, '__Host-session')).toBeGreaterThan(MEDIUM - 5);
        expect(cookieMaxAge(rotated, '__Host-session')).toBeLessThanOrEqual(MEDIUM);
        expect(cookieMaxAge(rotated, 'isAuth')).toBe(cookieMaxAge(rotated, '__Host-session'));
    });

    it('refresh rotation keeps the access token on its own short window', async () => {
        inJwtMode();
        const { jwtCookie } = await loginRemembering();

        const rotated = await api().post('/account/refresh').set('Cookie', jwtCookie);

        const { iat, exp } = decodeJwt(rotated.body.data.token as string) as {
            iat: number;
            exp: number;
        };
        expect(exp - iat).toBe(getAccessExpiryTime());
    });

    it('gives a browser-session login a server-side limit of the short tier', async () => {
        inJwtMode();
        const { jwtCookie } = await loginRemembering();

        const value = /__Host-session=([^;]+)/.exec(jwtCookie)![1];
        const { iat, exp } = decodeJwt(value) as { iat: number; exp: number };
        expect(exp - iat).toBe(getExpiryTime(RefreshTokenExpiryTime.SHORT));
    });

    it('reauth keeps a remembered login at its tier', async () => {
        const { headers } = await loginRemembering('medium');

        const response = await api()
            .post('/account/reauth')
            .set(headers)
            .send({ method: 'password', password: PLAIN_PASSWORD });

        expect(response.status).toBe(200);
        // Exact in `jwt` mode; `cookie` mode carries what is left of the row.
        expect(cookieMaxAge(response, '__Host-session')).toBeGreaterThan(MEDIUM - 5);
        expect(cookieMaxAge(response, '__Host-session')).toBeLessThanOrEqual(MEDIUM);
        expect(cookieMaxAge(response, 'isAuth')).toBe(cookieMaxAge(response, '__Host-session'));
    });

    it('reauth keeps a browser-session login a session cookie', async () => {
        const { headers } = await loginRemembering();

        const response = await api()
            .post('/account/reauth')
            .set(headers)
            .send({ method: 'password', password: PLAIN_PASSWORD });

        expect(response.status).toBe(200);
        expectSessionCookies(response);
    });

    it('a password change keeps a remembered login at its tier', async () => {
        const { headers } = await loginRemembering('medium');

        const response = await api().post('/account/password').set(headers).send({
            currentPassword: PLAIN_PASSWORD,
            password: REPLACEMENT_PASSWORD,
            passwordConfirm: REPLACEMENT_PASSWORD
        });

        expect(response.status).toBe(200);
        expect(cookieMaxAge(response, '__Host-session')).toBeGreaterThan(MEDIUM - 5);
        expect(cookieMaxAge(response, '__Host-session')).toBeLessThanOrEqual(MEDIUM);
    });

    it('a password change keeps a browser-session login a session cookie', async () => {
        const { headers } = await loginRemembering();

        const response = await api().post('/account/password').set(headers).send({
            currentPassword: PLAIN_PASSWORD,
            password: REPLACEMENT_PASSWORD,
            passwordConfirm: REPLACEMENT_PASSWORD
        });

        expect(response.status).toBe(200);
        expectSessionCookies(response);
    });

    it("reauth ignores another user's refresh cookie rather than adopting its tier", async () => {
        // A refresh cookie riding beside a bearer is a `jwt` mode shape: in `cookie` mode the
        // bearer IS the session and the cookie is never consulted.
        inJwtMode();
        const remembered = await loginRemembering('long', 'other@example.com');
        const { bearer } = await loginRemembering();

        const response = await api()
            .post('/account/reauth')
            .set('Authorization', bearer)
            .set('Cookie', remembered.jwtCookie)
            .send({ method: 'password', password: PLAIN_PASSWORD });

        expect(response.status).toBe(200);
        expectSessionCookies(response);
    });
});

describe('PUT /account', () => {
    // A PUT body IS the new resource (RFC 9110 §9.3.4) — `email`/`username` are
    // the Replace schema's `required` set, and an omitted optional field (`locale`, `phone`, …)
    // is cleared rather than left alone.
    it('replaces the profile, requiring email, username and analyticsConsent', async () => {
        const { user, bearer } = await authenticateAs('user');

        const response = await api()
            .put('/account')
            .set('Authorization', bearer)
            .send({ email: user.email, username: 'replaced-self', analyticsConsent: false });

        expect(response.status).toBe(200);
        expect(response.body.data.username).toBe('replaced-self');
    });

    // Consent has no cleared state, so a PUT that forgets it is refused, never read as "no".
    it('refuses a body missing analyticsConsent, leaving the stored consent alone', async () => {
        const { user, bearer } = await authenticateAs('user');

        const response = await api()
            .put('/account')
            .set('Authorization', bearer)
            .send({ email: user.email, username: user.username });

        expect(response.status).toBe(422);
    });

    it('refuses a body missing the required username', async () => {
        const { user, bearer } = await authenticateAs('user');

        const response = await api()
            .put('/account')
            .set('Authorization', bearer)
            .send({ email: user.email });

        expect(response.status).toBe(422);
    });
});

/**
 * `remember: 'short'` so the login is a persistent one, the shape a real "remember me" client
 * has; the clock advance {@link staleButRefreshedBearer} makes fits inside it either way.
 */
const loginRemembered = async () => {
    const user = await createUser();
    const response = await api()
        .post('/account/login')
        .send({ email: user.email, password: PLAIN_PASSWORD, remember: 'short' });
    const jwtCookie = setCookie(response, '__Host-session');
    if (!jwtCookie) throw new Error('login set no jwt cookie');
    return { user, jwtCookie };
};

/**
 * Beyond the sensitive window, but still holding a USABLE access token: `auth_time` is
 * copied forward on every refresh, never re-stamped (`session/jwt.ts`), so a refreshed token
 * is exactly what a long-lived-but-stale session looks like.
 */
const staleButRefreshedBearer = async (jwtCookie: string): Promise<`Bearer ${string}`> => {
    advanceDate((reauthWindowSeconds('sensitive') + 1) * 1000);
    return bearerForCookie(jwtCookie);
};

describe("PUT /account's step-up depends on whether the email actually changes", () => {
    afterEach(() => jest.useRealTimers());

    it('does not demand a fresh session for a re-cased resend of the current address', async () => {
        freezeDate();
        const { user, jwtCookie } = await loginRemembered();
        const bearer = await staleButRefreshedBearer(jwtCookie);

        const response = await api().put('/account').set('Authorization', bearer).send({
            email: user.email.toUpperCase(),
            username: user.username,
            analyticsConsent: false
        });

        expect(response.status).toBe(200);
    });

    it('demands a fresh session for a genuine email change', async () => {
        freezeDate();
        const { user, jwtCookie } = await loginRemembered();
        const bearer = await staleButRefreshedBearer(jwtCookie);

        const response = await api().put('/account').set('Authorization', bearer).send({
            email: 'brand-new@example.com',
            username: user.username,
            analyticsConsent: false
        });

        expect(response.status).toBe(401);
    });
});

describe("PATCH /account's step-up for an account with no second factor", () => {
    afterEach(() => jest.useRealTimers());

    it('demands a fresh session for an email change, and writes nothing', async () => {
        freezeDate();
        const { user, jwtCookie } = await loginRemembered();
        const bearer = await staleButRefreshedBearer(jwtCookie);

        const response = await api()
            .patch('/account')
            .set('Authorization', bearer)
            .send({ email: 'brand-new@example.com' });

        expect(response.status).toBe(401);
        const stored = await userRepository.findById(user.id);
        expect(stored?.email).toBe(user.email);
    });
});

describe('PATCH /account', () => {
    it('matches the contract when a plain user updates their own profile', async () => {
        const { bearer } = await authenticateAs('user');

        const response = await api()
            .patch('/account')
            .set('Authorization', bearer)
            .send({ username: 'self-renamed' });

        expect(response.status).toBe(200);
        expect(response.body.data.username).toBe('self-renamed');
    });

    it('holds a new address as pending rather than changing email immediately', async () => {
        const { user, bearer } = await authenticateAs('user');

        const response = await api()
            .patch('/account')
            .set('Authorization', bearer)
            .send({ email: 'fresh-address@example.com' });

        expect(response.status).toBe(200);
        // The account keeps its current, proven address until the new one is confirmed.
        expect(response.body.data.email).toBe(user.email);
        expect(response.body.data.pendingEmail).toBe('fresh-address@example.com');
        // Still verified, at the same instant: an unconfirmed new address must not unverify the
        // proven one it has not yet replaced.
        expect(response.body.data.verifiedAt).toBe(user.verifiedAt!.toISOString());
    });

    it('restating the CURRENT address is a no-op — a pending change survives it', async () => {
        const { user, bearer } = await loginWithCookie({ verifiedAt: new Date() });
        await api()
            .patch('/account')
            .set('Authorization', bearer)
            .send({ email: 'someone-else-typed-this@example.com' });

        const response = await api()
            .patch('/account')
            .set('Authorization', bearer)
            .send({ email: user.email });

        expect(response.status).toBe(200);
        expect(response.body.data.pendingEmail).toBe('someone-else-typed-this@example.com');
    });

    it('matches the error contract for an email another account holds', async () => {
        await createUser({ email: 'taken@example.com', username: 'first' });
        const { bearer } = await loginWithCookie({
            email: 'second@example.com',
            username: 'second'
        });

        const response = await api()
            .patch('/account')
            .set('Authorization', bearer)
            .send({ email: 'taken@example.com' });

        expect(response.status).toBe(409);
    });

    it('matches the error contract for an invalid body', async () => {
        const { bearer } = await authenticateAs('user');

        const response = await api()
            .patch('/account')
            .set('Authorization', bearer)
            .send({ email: 'not-an-email' });

        expect(response.status).toBe(422);
    });
});

describe('PATCH /account refuses what a profile edit may not carry', () => {
    it('cannot escalate: role, active and password are refused whole, and nothing changes', async () => {
        const { bearer, user } = await authenticateAs('user');

        // The contract body is strict — `role`/`active`/`password` are not fields it accepts, so
        // the whole body is refused rather than applying `username` and silently dropping the rest.
        const response = await api().patch('/account').set('Authorization', bearer).send({
            username: 'still-plain',
            role: 'admin',
            active: false,
            password: 'injected-password'
        });

        expect(response.status).toBe(422);
        const stored = await userRepository.findByIdWithCredentials(user.id);
        expect(stored?.username).not.toBe('still-plain');
        expect(stored?.active).toBe(true);
        // The password is untouched — the fixture's original still logs in.
        await loginBearer(user.email, PLAIN_PASSWORD);
    });
});

describe('DELETE /account/pending-email', () => {
    it('cancels a pending change explicitly', async () => {
        const { bearer } = await authenticateAs('user');
        await api()
            .patch('/account')
            .set('Authorization', bearer)
            .send({ email: 'someone-else-typed-this@example.com' });

        const response = await api().delete('/account/pending-email').set('Authorization', bearer);

        expect(response.status).toBe(200);

        const after = await api().get('/account').set('Authorization', bearer);
        expect(after.body.data.pendingEmail).toBeUndefined();
    });

    it('is a no-op when nothing is pending', async () => {
        const { bearer } = await authenticateAs('user');

        const response = await api().delete('/account/pending-email').set('Authorization', bearer);

        expect(response.status).toBe(200);
    });
});

/** Parks a change and steps past the cooldown its own mail started. */
const requestChangeAndWait = async (address: string) => {
    freezeDate();
    const session = await loginWithCookie({ verifiedAt: new Date() });
    await api().patch('/account').set('Authorization', session.bearer).send({ email: address });
    advanceDate(61_000);
    return session;
};

/*
 * The resend is the only way to ask for the pending address's link again: restating it on `PATCH
 * /account` is a no-op. The cooldown is stepped over with a frozen clock rather than a wait.
 */
describe('POST /account/pending-email/resend', () => {
    afterEach(() => jest.useRealTimers());

    it('mails the NEW address a fresh link and nobody else, answering resendAfter', async () => {
        const { user, bearer } = await requestChangeAndWait('new-address@example.com');
        const enqueueEmail = mailerPort.enqueueEmail as jest.MockedFunction<
            typeof mailerPort.enqueueEmail
        >;
        enqueueEmail.mockClear();

        const response = await api()
            .post('/account/pending-email/resend')
            .set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response.body.data).toEqual({ resendAfter: 60 });
        expect(enqueueEmail).toHaveBeenCalledTimes(1);
        expect(mailTo('new-address@example.com')?.[1]).toBe('account.verify-request');
        // The old address was told once, when the change was requested — not again.
        expect(mailTo(user.email)).toBeUndefined();
    });

    it('kills the first link and confirms with the second', async () => {
        const { user, bearer } = await requestChangeAndWait('new-address@example.com');
        const firstToken = verifyTokenFromMail();

        await api().post('/account/pending-email/resend').set('Authorization', bearer);
        const secondToken = verifyTokenFromMail();

        expect(secondToken).not.toBe(firstToken);
        const stale = await api().post('/account/email-change-confirm').send({ token: firstToken });
        expect(stale.status).toBe(422);
        const confirm = await api()
            .post('/account/email-change-confirm')
            .send({ token: secondToken });
        expect(confirm.status).toBe(200);
        const stored = await userRepository.findById(user.id);
        expect(stored?.email).toBe('new-address@example.com');
    });

    it('answers 429 with the seconds to wait inside the cooldown', async () => {
        const { bearer } = await requestChangeAndWait('new-address@example.com');
        await api().post('/account/pending-email/resend').set('Authorization', bearer);

        const response = await api()
            .post('/account/pending-email/resend')
            .set('Authorization', bearer);

        expect(response.status).toBe(429);
        expect(response.body.errors[0]).toMatchObject({
            code: 'EMAIL_VERIFY_RESEND_TOO_SOON',
            details: { retryAfter: expect.any(Number) as number }
        });
    });

    it('is a no-op, answering resendAfter 0, when nothing is pending', async () => {
        const { bearer } = await authenticateAs('user');
        const enqueueEmail = mailerPort.enqueueEmail as jest.MockedFunction<
            typeof mailerPort.enqueueEmail
        >;
        enqueueEmail.mockClear();

        const response = await api()
            .post('/account/pending-email/resend')
            .set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response.body.data).toEqual({ resendAfter: 0 });
        expect(enqueueEmail).not.toHaveBeenCalled();
    });
});

/** The Italian "password too short" sentence for a given contract floor, rendered by the same `t`. */
const tooShortPasswordInItalian = (minimum: number): string => {
    const italian = translator('it');
    return italian('validation.too-small-string', {
        attribute: italian('validation.attributes.password'),
        minimum: String(minimum)
    });
};

/**
 * `POST /account/reset-confirm`, its own describe because the flow needs a live one-time token
 * rather than a session.
 */
describe('POST /account/reset-confirm', () => {
    it("answers a weak password with the password named, in the caller's language", async () => {
        const user = await createUser({ email: 'reset-copy@example.com' });
        await plantToken(user.id, 'password', 'a-live-reset-token', { ttlMs: 60 * 60 * 1000 });

        const response = await api()
            .post('/account/reset-confirm')
            .set('Accept-Language', 'it')
            .send({
                token: 'a-live-reset-token',
                password: WEAK_PASSWORD,
                passwordConfirm: WEAK_PASSWORD
            });

        const messages = (response.body.errors ?? []).map(
            ({ message }: { message: string }) => message
        );

        expect(response.status).toBe(422);
        expect(messages).toContain(tooShortPasswordInItalian(confirmPasswordResetBodyPasswordMin));
    });

    /**
     * The new password is checked BEFORE the token is spent — a typo must not burn the link. A
     * weak-password attempt followed by a valid one on the SAME token proves the first attempt
     * never touched it: if it had, the second attempt would see the token gone.
     */
    it('does not consume the reset token when the new password fails validation', async () => {
        const user = await createUser({ email: 'reset-typo@example.com' });
        await plantToken(user.id, 'password', 'a-fresh-reset-token', { ttlMs: 60 * 60 * 1000 });

        const weakAttempt = await api().post('/account/reset-confirm').send({
            token: 'a-fresh-reset-token',
            password: WEAK_PASSWORD,
            passwordConfirm: WEAK_PASSWORD
        });
        expect(weakAttempt.status).toBe(422);

        const validAttempt = await api().post('/account/reset-confirm').send({
            token: 'a-fresh-reset-token',
            password: REPLACEMENT_PASSWORD,
            passwordConfirm: REPLACEMENT_PASSWORD
        });
        expect(validAttempt.status).toBe(200);
    });
});

describe('POST /account/password', () => {
    it('matches the contract and the new credential works', async () => {
        const { user, bearer } = await loginWithCookie();

        const response = await api().post('/account/password').set('Authorization', bearer).send({
            currentPassword: PLAIN_PASSWORD,
            password: REPLACEMENT_PASSWORD,
            passwordConfirm: REPLACEMENT_PASSWORD
        });

        expect(response.status).toBe(200);

        const relogin = await api()
            .post('/account/login')
            .send({ email: user.email, password: REPLACEMENT_PASSWORD });
        expect(relogin.status).toBe(200);
    });

    /**
     * The contract's own body parses first, so the sentence is the shared size template with the
     * password named, not a copy of its own.
     */
    it("answers a weak password with the password named, in the caller's language", async () => {
        const { bearer } = await loginWithCookie();

        const response = await api()
            .post('/account/password')
            .set('Authorization', bearer)
            .set('Accept-Language', 'it')
            .send({
                currentPassword: PLAIN_PASSWORD,
                password: WEAK_PASSWORD,
                passwordConfirm: WEAK_PASSWORD
            });

        const messages = (response.body.errors ?? []).map(
            ({ message }: { message: string }) => message
        );

        expect(response.status).toBe(422);
        expect(messages).toContain(tooShortPasswordInItalian(changePasswordBodyPasswordMin));
    });

    it('matches the error contract for a wrong current password — 422, never 401', async () => {
        const { bearer } = await loginWithCookie();

        const response = await api().post('/account/password').set('Authorization', bearer).send({
            currentPassword: 'wrong-guess',
            password: REPLACEMENT_PASSWORD,
            passwordConfirm: REPLACEMENT_PASSWORD
        });

        expect(response.status).toBe(422);
    });

    /*
     * Unlike reauth, the password write and the session revoke have already happened
     * by the time the re-mint runs — a 500 here would misreport a change that DID succeed. The
     * degrade to 200-without-a-token is correct; what was missing is any trail at all for it.
     */
    it('still answers 200 with no token, logged, when the re-mint fails', async () => {
        const { bearer } = await loginWithCookie();
        const loggedWarn = jest.spyOn(logger, 'warn').mockImplementation(() => logger);
        jest.spyOn(sessionRepository, 'insert').mockRejectedValueOnce(new Error('write conflict'));

        const response = await api().post('/account/password').set('Authorization', bearer).send({
            currentPassword: PLAIN_PASSWORD,
            password: REPLACEMENT_PASSWORD,
            passwordConfirm: REPLACEMENT_PASSWORD
        });

        expect(response.status).toBe(200);
        expect(response.body.data).toBeUndefined();
        expect(loggedWarn).toHaveBeenCalledWith(
            expect.objectContaining({
                message: 'Password changed, but the session re-mint failed.',
                userId: expect.any(String)
            })
        );
        jest.restoreAllMocks();
    });
});

describe('POST /account/reauth', () => {
    it('re-mints the session with a fresh access token', async () => {
        inJwtMode();
        const { bearer } = await loginWithCookie();

        const response = await api()
            .post('/account/reauth')
            .set('Authorization', bearer)
            .send({ method: 'password', password: PLAIN_PASSWORD });

        expect(response.status).toBe(200);
        expect(typeof response.body.data.token).toBe('string');
    });

    it('matches the error contract for a wrong password — 422, never 401', async () => {
        // Same reasoning POST /account/password already established: a 401 here reads as
        // "session expired" to a client interceptor and would log out a session that is, in
        // fact, still perfectly valid — the opposite of what re-authentication exists to do.
        const { bearer } = await loginWithCookie();

        const response = await api()
            .post('/account/reauth')
            .set('Authorization', bearer)
            .send({ method: 'password', password: 'wrong-guess' });

        expect(response.status).toBe(422);
    });

    it('sets a fresh refresh cookie too, same as POST /account/password', async () => {
        inJwtMode();
        const { bearer } = await loginWithCookie();

        const response = await api()
            .post('/account/reauth')
            .set('Authorization', bearer)
            .send({ method: 'password', password: PLAIN_PASSWORD });

        expect(setCookie(response, '__Host-session')).toBeDefined();
    });

    /*
     * Unlike `POST /account/password`, `accountService.reauth` writes nothing and revokes no
     * session — it only compares the password. A failed re-mint here means the whole point of the
     * endpoint (a fresh session, to clear a step-up challenge) did not happen, so it must answer
     * 500, not the false 200-with-no-token the code used to degrade to.
     */
    it('answers 500 with no jwt cookie when the re-mint fails, rather than a false 200', async () => {
        const { bearer } = await loginWithCookie();
        jest.spyOn(sessionRepository, 'insert').mockRejectedValueOnce(new Error('write conflict'));

        const response = await api()
            .post('/account/reauth')
            .set('Authorization', bearer)
            .send({ method: 'password', password: PLAIN_PASSWORD });

        expect(response.status).toBe(500);
        expect(setCookie(response, '__Host-session')).toBeUndefined();
        jest.restoreAllMocks();
    });
});

describe('POST /account/export', () => {
    it('answers 202 with the export id, and the finished file holds the caller’s profile and sessions', async () => {
        const { user, bearer } = await loginWithCookie();

        const { request, status, data } = await requestAndDownloadExport(bearer);

        expect(request.status).toBe(202);
        expect(status).toBe(200);
        const { profile, sessions } = data as {
            profile: { email: string };
            sessions: { id: string; createdAt: string; expiration: string }[];
        };
        expect(profile.email).toBe(user.email);
        // The caller's own login, as metadata only: its handle and when it ends, never a credential.
        expect(sessions).toHaveLength(1);
        // `lastUsedAt` and `device` are metadata too; they appear once the session was used / in `cookie` mode.
        expect(
            Object.keys(sessions[0])
                .filter((key) => !['lastUsedAt', 'device'].includes(key))
                .toSorted()
        ).toEqual(['createdAt', 'expiration', 'id']);
    });
});

describe('POST /account/export for an account that is gone', () => {
    // A valid session whose account vanished (deleted between the session check and the export) is
    // unauthenticated, as it is on every other self-service route; the contract declares no 404.
    it('answers 401', async () => {
        const { bearer } = await loginWithCookie();
        jest.spyOn(userService, 'getById').mockResolvedValueOnce(undefined);

        const response = await api().post('/account/export').set('Authorization', bearer).send();

        expect(response.status).toBe(401);
        jest.restoreAllMocks();
    });
});

describe('POST /account/export without a session', () => {});

describe('GET /account/export/{id}', () => {
    it('streams the export as a JSON attachment, never cached', async () => {
        const { bearer } = await loginWithCookie();
        const { request } = await requestAndDownloadExport(bearer);

        const response = await api()
            .get(`/account/export/${request.id}`)
            .set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response.headers['content-type']).toContain('application/json');
        expect(response.headers['content-disposition']).toBe(
            'attachment; filename="account-export.json"'
        );
        expect(response.headers['cache-control']).toBe('private, no-store');
    });

    it('answers 404 for an export that does not exist', async () => {
        const { bearer } = await loginWithCookie();

        const response = await api()
            .get(`/account/export/${MISSING_ID}`)
            .set('Authorization', bearer);

        expect(response.status).toBe(404);
    });

    it('answers 404 for a malformed id, the same as an unknown one', async () => {
        const { bearer } = await loginWithCookie();

        const response = await api().get('/account/export/not-an-id').set('Authorization', bearer);

        expect(response.status).toBe(404);
    });

    it('answers 404 for another account’s export, not 403', async () => {
        const owner = await loginWithCookie({ email: 'owner-export@example.com' });
        const { request } = await requestAndDownloadExport(owner.bearer);
        const stranger = await loginWithCookie({ email: 'stranger-export@example.com' });

        const response = await api()
            .get(`/account/export/${request.id}`)
            .set('Authorization', stranger.bearer);

        expect(response.status).toBe(404);
    });
});

describe('POST /account/logout', () => {
    it('revokes exactly the cookie session', async () => {
        const { jwtCookie } = await loginWithCookie();

        const response = await api().post('/account/logout').set('Cookie', jwtCookie);

        expect(response.status).toBe(200);

        // The revoked cookie names nothing any more (it can no longer mint access tokens in `jwt`
        // mode, no longer authenticates in `cookie` mode): the session is dead server-side, not
        // merely cleared client-side.
        expect(await statusOfSession(jwtCookie)).toBe(401);
    });

    it('answers 200 with no cookie at all — the caller already has what they asked for', async () => {
        const response = await api().post('/account/logout');

        expect(response.status).toBe(200);
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
    });

    it('flags nothing current for a bearer-only caller', async () => {
        // An access token does not identify a session; a `cookie`-mode `ses_…` bearer does.
        inJwtMode();
        const { bearer } = await loginWithCookie();

        const response = await api().get('/account/sessions').set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response.body.data.sessions).toHaveLength(1);
        expect(response.body.data.sessions[0].current).toBe(false);
    });

    /**
     * `lastUsedAt` must stay ABSENT until the session is actually used, not present from issue
     * time (which would misread as "just used"). Both halves are asserted in one case on purpose
     * — splitting them would let either regress alone while the field never actually changed.
     */
    it('reports lastUsedAt only once the session has been used', async () => {
        // A request that is not the person acting leaves the session unused; an ordinary one is a
        // use. (A refresh is neither: it renews a token and carries the clock over.)
        inJwtMode();
        const { bearer, jwtCookie } = await loginWithCookie();
        const listed = () =>
            api()
                .get('/account/sessions')
                .set('Authorization', bearer)
                .set('Cookie', jwtCookie)
                .set('X-Session-Passive', 'true');

        const before = await listed();
        expect(before.body.data.sessions[0].lastUsedAt).toBeUndefined();

        const used = await api().get('/account').set('Authorization', bearer);
        expect(used.status).toBe(200);
        // The stamp is written off the request's path.
        await new Promise((resolve) => setTimeout(resolve, 100));

        const after = await listed();
        expect(after.status).toBe(200);
        expect(typeof after.body.data.sessions[0].lastUsedAt).toBe('string');
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

        const after = await api()
            .get('/account/sessions')
            .set('Authorization', bearer)
            .set('Cookie', jwtCookie);
        expect(after.body.data.sessions.map(({ id }: { id: string }) => id)).toEqual(
            sessions.filter(({ current }) => current).map(({ id }) => id)
        );
    });

    it("matches the error contract for another user's session id", async () => {
        const owner = await loginWithCookie({ email: 'owner@example.com', username: 'admin' });
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
    });

    it('matches the error contract for a malformed id', async () => {
        const { bearer } = await loginWithCookie();

        const response = await api()
            .delete('/account/sessions/not-an-id')
            .set('Authorization', bearer);

        expect(response.status).toBe(404);
    });
});

describe('POST /account/verify-request and /account/verify-confirm', () => {
    it('signup starts unverified and holding a verification token', async () => {
        const response = await api().post('/account/signup').send({
            email: 'joiner@example.com',
            username: 'joiner',
            password: PLAIN_PASSWORD,
            passwordConfirm: PLAIN_PASSWORD,
            termsAccepted: true
        });

        expect(response.status).toBe(201);
        expect(response.body.data.verifiedAt).toBeUndefined();

        expect(await readVerifyToken(response.body.data.id)).toBeDefined();
    });

    /*
     * Unverified is a role, not a waiting room: the new account is signed in from here and is
     * stopped at `checkout:Cart` alone. The BODY stays a bare profile so rung 2's refusal — which
     * `post-signup.ts` answers before it ever reaches the session — is still indistinguishable in
     * everything a script can read from one response.
     */
    it('signup signs the new account in, through the cookie rather than the body', async () => {
        const response = await api().post('/account/signup').send({
            email: 'signed-in@example.com',
            username: 'signedin',
            password: PLAIN_PASSWORD,
            passwordConfirm: PLAIN_PASSWORD,
            termsAccepted: true
        });

        expect(response.status).toBe(201);
        expect(response.body.data.token).toBeUndefined();

        expect(setCookie(response, '__Host-session')).toBeDefined();

        // The session is the cookie: `jwt` mode turns it into an access token through the
        // bootstrap the frontend already runs after OAuth, `cookie` mode authenticates by it.
        expect(await statusOfSession(cookieHeader(response, '__Host-session'))).toBe(200);
    });

    /*
     * The mongoose `email` schema's own `match` — the backstop behind the Zod-validated
     * route, see `users/model.ts` — must accept a plus-tag and an 8+ character TLD, both real
     * shapes an inbox can hold. Signup is the first place either would ever reach it.
     */
    it('accepts a plus-tag address with a long TLD', async () => {
        const response = await api().post('/account/signup').send({
            email: 'ada+shop@mail.example.photography',
            username: 'adashop',
            password: PLAIN_PASSWORD,
            passwordConfirm: PLAIN_PASSWORD,
            termsAccepted: true
        });

        expect(response.status).toBe(201);
        expect(response.body.data.email).toBe('ada+shop@mail.example.photography');
    });

    it('re-sends for an unverified account and the emailed token then verifies it', async () => {
        const { user, bearer } = await loginWithCookie();

        const request = await api().post('/account/verify-request').set('Authorization', bearer);
        expect(request.status).toBe(200);

        const token = verifyTokenFromMail();
        const confirm = await api().post('/account/verify-confirm').send({ token });
        expect(confirm.status).toBe(200);

        const stored = await userRepository.findById(user.id);
        expect(stored?.verifiedAt).toBeInstanceOf(Date);
    });

    it('matches the error contract when the account is already verified', async () => {
        const { bearer } = await loginWithCookie({ verifiedAt: new Date() });

        const response = await api().post('/account/verify-request').set('Authorization', bearer);

        expect(response.status).toBe(409);
    });

    it('matches the error contract for an invented token', async () => {
        const response = await api()
            .post('/account/verify-confirm')
            .send({ token: 'not-a-real-token' });

        expect(response.status).toBe(422);
    });

    it('a token spends exactly once', async () => {
        const { bearer } = await loginWithCookie();
        await api().post('/account/verify-request').set('Authorization', bearer);
        const token = verifyTokenFromMail();

        const first = await api().post('/account/verify-confirm').send({ token });
        const second = await api().post('/account/verify-confirm').send({ token });

        expect(first.status).toBe(200);
        expect(second.status).toBe(422);
    });
});

describe('PATCH /account (email change) and /account/email-change-confirm', () => {
    it('notifies the OLD address and mails a link to the NEW one, the moment the change is requested', async () => {
        const { user, bearer } = await loginWithCookie({ verifiedAt: new Date() });

        const response = await api()
            .patch('/account')
            .set('Authorization', bearer)
            .send({ email: 'new-address@example.com' });

        expect(response.status).toBe(200);
        // The old address gets a warning, not a receipt — sent at request time, not on swap.
        expect(mailTo(user.email)?.[1]).toBe('account.email-change-notice');
        // The new address gets the token-bearing link.
        expect(mailTo('new-address@example.com')?.[1]).toBe('account.verify-request');
    });

    it('confirming the token swaps pendingEmail into email and re-verifies the account', async () => {
        const { user, bearer } = await loginWithCookie({ verifiedAt: new Date() });
        await api()
            .patch('/account')
            .set('Authorization', bearer)
            .send({ email: 'new-address@example.com' });
        const token = verifyTokenFromMail();

        const confirm = await api().post('/account/email-change-confirm').send({ token });

        expect(confirm.status).toBe(200);
        const stored = await userRepository.findById(user.id);
        expect(stored?.email).toBe('new-address@example.com');
        expect(stored?.verifiedAt).toBeInstanceOf(Date);
    });

    it('round-trips a plus-tag address: confirms, and GET /account shows it', async () => {
        const { bearer } = await loginWithCookie({ verifiedAt: new Date() });
        const changeRequest = await api()
            .patch('/account')
            .set('Authorization', bearer)
            .send({ email: 'ada+shop@mail.example.photography' });
        expect(changeRequest.status).toBe(200);

        const token = verifyTokenFromMail();
        const confirm = await api().post('/account/email-change-confirm').send({ token });
        expect(confirm.status).toBe(200);

        // A confirmed email change ends every session (the old bearer included, in `cookie`
        // mode), so the account signs in again under the new address.
        const account = await api()
            .get('/account')
            .set('Authorization', await loginBearer('ada+shop@mail.example.photography'));
        expect(account.body.data.email).toBe('ada+shop@mail.example.photography');
    });

    it('keeps authenticating under the OLD address until the token is spent', async () => {
        const { user, bearer } = await loginWithCookie({ verifiedAt: new Date() });
        await api()
            .patch('/account')
            .set('Authorization', bearer)
            .send({ email: 'new-address@example.com' });

        // The swap has not happened yet — the OLD credential is still the account's.
        const stillOld = await api()
            .post('/account/login')
            .send({ email: user.email, password: PLAIN_PASSWORD });
        expect(stillOld.status).toBe(200);

        const token = verifyTokenFromMail();
        await api().post('/account/email-change-confirm').send({ token });

        const oldNowFails = await api()
            .post('/account/login')
            .send({ email: user.email, password: PLAIN_PASSWORD });
        expect(oldNowFails.status).toBe(401);
        const newNowWorks = await api()
            .post('/account/login')
            .send({ email: 'new-address@example.com', password: PLAIN_PASSWORD });
        expect(newNowWorks.status).toBe(200);
    });

    it('revokes every other session on a confirmed email change', async () => {
        const { user, bearer, jwtCookie } = await loginWithCookie({ verifiedAt: new Date() });
        await api()
            .patch('/account')
            .set('Authorization', bearer)
            .send({ email: 'new-address@example.com' });
        const token = verifyTokenFromMail();

        await api().post('/account/email-change-confirm').send({ token });

        expect(await statusOfSession(jwtCookie)).toBe(401);
        expect(await userRepository.findById(user.id)).not.toBeNull();
    });

    it('a `verify` token is refused by email-change-confirm', async () => {
        const { bearer } = await loginWithCookie();
        await api().post('/account/verify-request').set('Authorization', bearer);
        const token = verifyTokenFromMail();

        const response = await api().post('/account/email-change-confirm').send({ token });

        expect(response.status).toBe(422);
    });

    it('an `email-change` token is refused by the plain verify-confirm', async () => {
        const { bearer } = await loginWithCookie({ verifiedAt: new Date() });
        await api()
            .patch('/account')
            .set('Authorization', bearer)
            .send({ email: 'new-address@example.com' });
        const token = verifyTokenFromMail();

        const response = await api().post('/account/verify-confirm').send({ token });

        expect(response.status).toBe(422);
    });

    it('matches the error contract for an invented email-change token', async () => {
        const response = await api()
            .post('/account/email-change-confirm')
            .send({ token: 'not-a-real-token' });

        expect(response.status).toBe(422);
    });

    /*
     * `PATCH /account`'s own request-time check (`emailOrPendingEmailTaken`) already refuses a
     * SECOND request naming an address already pending elsewhere — so the only way this write
     * still collides is a genuine concurrent race that check cannot see (two requests landing
     * within the same brief window), which a sequential test cannot reproduce deterministically.
     * The other account's email is forced straight through the repository instead, standing in
     * for whichever write actually won that race — what's under test is `completeEmailChange`'s
     * handling of the resulting E11000, not how the collision came about.
     */
    it('answers 409 when the new address was claimed by someone else in the meantime', async () => {
        const changer = await loginWithCookie({
            email: 'racer-one@example.com',
            verifiedAt: new Date()
        });
        await api()
            .patch('/account')
            .set('Authorization', changer.bearer)
            .send({ email: 'contested@example.com' });
        const token = verifyTokenFromMail();

        const holder = await createUser({
            email: 'racer-two@example.com',
            verifiedAt: new Date()
        });
        const holderDocument = await userRepository.findById(holder.id);
        if (!holderDocument) throw new Error('test fixture missing: holder document');
        holderDocument.email = 'contested@example.com';
        await userRepository.save(holderDocument);

        const confirm = await api().post('/account/email-change-confirm').send({ token });

        expect(confirm.status).toBe(409);
        // The loser changes nothing — still the account it started as.
        const stored = await userRepository.findById(changer.user.id);
        expect(stored?.email).toBe(changer.user.email);
    });
});
