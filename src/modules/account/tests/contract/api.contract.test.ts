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
import { api, authenticateAs } from '@tests/http';
import { setCookie, cookieHeader } from '@tests/cookies';
import { createUser, PLAIN_PASSWORD, REPLACEMENT_PASSWORD } from '@modules/users/tests/factories';
import { userRepository } from '@modules/users/tests/factories';
import { EMAIL_VERIFY_TOKEN_TYPE } from '@modules/account/services';
import { TokenType, userService } from '@modules/users';
import { decode } from 'jsonwebtoken';
import { logger } from '@infrastructure/adapters/logger';
import * as mailerPort from '@infrastructure/adapters/mailer';
import itUsers from '@modules/users/locales/it.json';
import itShared from '../../../../locales/it.json';
import { WEAK_PASSWORD } from '@modules/users/tests/factories';
import { loginWithCookie } from './support';
import {
    getExpiryTime,
    getAccessExpiryTime,
    RefreshTokenExpiryTime
} from '@modules/account/session/config';
import { MISSING_ID } from '@tests/ids';
import { freezeDate, advanceDate } from '@tests/clock';
import { REAUTH_TIME_SENSITIVE } from '@kernel/middlewares/authorizations';

setupTestDb();

/*
 * The mailer is REPLACED, not spied on — same reasoning as the audit/analytics ports elsewhere
 * (`jest.spyOn` cannot redefine the non-configurable getter a CommonJS namespace import exposes
 * under swc). Needed here because `tokens[].token` is a digest at rest: the plaintext verify
 * token this suite submits to `/account/verify-confirm` only ever exists in the emailed link,
 * never in storage — see `verifyTokenFromMail` below.
 */
jest.mock('@infrastructure/adapters/mailer', () => ({
    __esModule: true,
    ...jest.requireActual('@infrastructure/adapters/mailer'),
    enqueueEmail: jest.fn().mockResolvedValue(undefined)
}));

/** Whether the account holds a verify token — a digest at rest, so only presence is checkable. */
const readVerifyToken = async (userId: string) => {
    const stored = await userRepository.findByIdWithCredentials(userId);
    return stored?.tokens.find(({ type }) => type === EMAIL_VERIFY_TOKEN_TYPE)?.token;
};

/**
 * The PLAINTEXT verify token from the most recently queued mail — what the link in the email
 * actually carries. `tokens[].token` is a `hashToken` digest at rest, so this suite cannot read
 * the usable token back from storage; it has to observe it the same way the account holder
 * would, via `verifyRequestEmail`'s `linkUrl`'s own `?token=` query parameter.
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
    const token = /[&?]token=([^&]+)/.exec(data?.linkUrl ?? '')?.[1];
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
        expect(cookieMaxAge(response, 'jwt')).toBe(expected);
        // The UI hint expires in step with the credential it describes.
        expect(cookieMaxAge(response, 'isAuth')).toBe(expected);
    });

    it('sets browser-session cookies (no Max-Age, no Expires) when no tier is asked for', async () => {
        const user = await createUser();
        const response = await api()
            .post('/account/login')
            .send({ email: user.email, password: PLAIN_PASSWORD });

        expect(response.status).toBe(200);
        for (const name of ['jwt', 'isAuth']) {
            expect(setCookie(response, name)).toBeDefined();
            expect(cookieMaxAge(response, name)).toBeUndefined();
            expect(setCookie(response, name)).not.toMatch(/expires=/i);
        }
    });

    it('still gives the access token the short window, not the refresh fallback', async () => {
        const user = await createUser();
        const response = await api()
            .post('/account/login')
            .send({ email: user.email, password: PLAIN_PASSWORD });

        const { iat, exp } = decode(response.body.data.token) as { iat: number; exp: number };
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
    const jwtCookie = setCookie(response, 'jwt');
    if (!jwtCookie) throw new Error('login set no jwt cookie');
    return {
        user,
        bearer: `Bearer ${response.body.data.token as string}` as const,
        jwtCookie
    };
};

/** Asserts the response sets BOTH session cookies with no `Max-Age` and no `Expires`. */
const expectSessionCookies = (response: { headers: Record<string, unknown> }) => {
    for (const name of ['jwt', 'isAuth']) {
        expect(setCookie(response, name)).toBeDefined();
        expect(cookieMaxAge(response, name)).toBeUndefined();
        expect(setCookie(response, name)).not.toMatch(/expires=/i);
    }
};

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
        const { jwtCookie } = await loginRemembering();

        const rotated = await api().get('/account/refresh').set('Cookie', jwtCookie);
        expect(rotated.status).toBe(200);
        expectSessionCookies(rotated);

        // A second rotation, off the rotated cookie: the flag must survive being copied twice.
        const again = await api().get('/account/refresh').set('Cookie', setCookie(rotated, 'jwt')!);
        expect(again.status).toBe(200);
        expectSessionCookies(again);
    });

    it('refresh rotation keeps a remembered login persistent, for what is left of its window', async () => {
        const { jwtCookie } = await loginRemembering('medium');

        const rotated = await api().get('/account/refresh').set('Cookie', jwtCookie);

        expect(rotated.status).toBe(200);
        // Rotation carries the REMAINING lifetime, so a whole second may have elapsed.
        expect(cookieMaxAge(rotated, 'jwt')).toBeGreaterThan(MEDIUM - 5);
        expect(cookieMaxAge(rotated, 'jwt')).toBeLessThanOrEqual(MEDIUM);
        expect(cookieMaxAge(rotated, 'isAuth')).toBe(cookieMaxAge(rotated, 'jwt'));
    });

    it('refresh rotation keeps the access token on its own short window', async () => {
        const { jwtCookie } = await loginRemembering();

        const rotated = await api().get('/account/refresh').set('Cookie', jwtCookie);

        const { iat, exp } = decode(rotated.body.data.token as string) as {
            iat: number;
            exp: number;
        };
        expect(exp - iat).toBe(getAccessExpiryTime());
    });

    it('gives a browser-session login a server-side limit of the short tier', async () => {
        const { jwtCookie } = await loginRemembering();

        const value = /jwt=([^;]+)/.exec(jwtCookie)![1];
        const { iat, exp } = decode(value) as { iat: number; exp: number };
        expect(exp - iat).toBe(getExpiryTime(RefreshTokenExpiryTime.SHORT));
    });

    it('reauth keeps a remembered login at its tier', async () => {
        const { bearer, jwtCookie } = await loginRemembering('medium');

        const response = await api()
            .post('/account/reauth')
            .set('Authorization', bearer)
            .set('Cookie', jwtCookie)
            .send({ method: 'password', password: PLAIN_PASSWORD });

        expect(response.status).toBe(200);
        expect(cookieMaxAge(response, 'jwt')).toBe(MEDIUM);
        expect(cookieMaxAge(response, 'isAuth')).toBe(MEDIUM);
    });

    it('reauth keeps a browser-session login a session cookie', async () => {
        const { bearer, jwtCookie } = await loginRemembering();

        const response = await api()
            .post('/account/reauth')
            .set('Authorization', bearer)
            .set('Cookie', jwtCookie)
            .send({ method: 'password', password: PLAIN_PASSWORD });

        expect(response.status).toBe(200);
        expectSessionCookies(response);
    });

    it('a password change keeps a remembered login at its tier', async () => {
        const { bearer, jwtCookie } = await loginRemembering('medium');

        const response = await api()
            .post('/account/password')
            .set('Authorization', bearer)
            .set('Cookie', jwtCookie)
            .send({
                currentPassword: PLAIN_PASSWORD,
                password: REPLACEMENT_PASSWORD,
                passwordConfirm: REPLACEMENT_PASSWORD
            });

        expect(response.status).toBe(200);
        expect(cookieMaxAge(response, 'jwt')).toBe(MEDIUM);
    });

    it('a password change keeps a browser-session login a session cookie', async () => {
        const { bearer, jwtCookie } = await loginRemembering();

        const response = await api()
            .post('/account/password')
            .set('Authorization', bearer)
            .set('Cookie', jwtCookie)
            .send({
                currentPassword: PLAIN_PASSWORD,
                password: REPLACEMENT_PASSWORD,
                passwordConfirm: REPLACEMENT_PASSWORD
            });

        expect(response.status).toBe(200);
        expectSessionCookies(response);
    });

    it("reauth ignores another user's refresh cookie rather than adopting its tier", async () => {
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
    const jwtCookie = setCookie(response, 'jwt');
    if (!jwtCookie) throw new Error('login set no jwt cookie');
    return { user, jwtCookie };
};

/**
 * Beyond `REAUTH_TIME_SENSITIVE`, but still holding a USABLE access token: `auth_time` is
 * copied forward on every refresh, never re-stamped (`session/jwt.ts`), so a refreshed token
 * is exactly what a long-lived-but-stale session looks like.
 */
const staleButRefreshedBearer = async (jwtCookie: string): Promise<`Bearer ${string}`> => {
    advanceDate((REAUTH_TIME_SENSITIVE + 1) * 1000);
    const refreshed = await api().get('/account/refresh').set('Cookie', jwtCookie);
    return `Bearer ${refreshed.body.data.token as string}`;
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

    it('demands a session', async () => {
        const response = await api().post('/account/pending-email/resend');

        expect(response.status).toBe(401);
    });
});

/**
 * `POST /account/reset-confirm` shares `postPasswordChange`'s shape-only parse, and for the same
 * reason. Its own describe because the flow needs a live one-time token rather than a session.
 */
describe('POST /account/reset-confirm', () => {
    it('answers a weak password with the password copy, not the generic size message', async () => {
        const user = await createUser({ email: 'reset-copy@example.com' });
        await user.tokenAdd(TokenType.PASSWORD_RESET, 60 * 60 * 1000, 'a-live-reset-token');

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
        expect(messages).toContain(itUsers.users['field-password-min']);
        expect(messages).not.toContain(itShared.validation['too-small-string']);
    });

    /**
     * The new password is checked BEFORE the token is spent — a typo must not burn the link. A
     * weak-password attempt followed by a valid one on the SAME token proves the first attempt
     * never touched it: if it had, the second attempt would see the token gone.
     */
    it('does not consume the reset token when the new password fails validation', async () => {
        const user = await createUser({ email: 'reset-typo@example.com' });
        await user.tokenAdd(TokenType.PASSWORD_RESET, 60 * 60 * 1000, 'a-fresh-reset-token');

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
     * Message precedence, the same rule `tests/integration/locale.test.ts` pins for signup: a
     * field with its own copy must not be answered with the generic size sentence from the global
     * Zod error map. Parsing the generated `ChangePasswordBody` here would win that race, which is
     * why this controller parses a shape-only schema and leaves the rules to the service.
     */
    it('answers a weak password with the password copy, not the generic size message', async () => {
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
        expect(messages).toContain(itUsers.users['field-password-min']);
        expect(messages).not.toContain(itShared.validation['too-small-string']);
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
        jest.spyOn(userService, 'tokenAdd').mockRejectedValueOnce(new Error('write conflict'));

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
        const { bearer } = await loginWithCookie();

        const response = await api()
            .post('/account/reauth')
            .set('Authorization', bearer)
            .send({ method: 'password', password: PLAIN_PASSWORD });

        expect(setCookie(response, 'jwt')).toBeDefined();
    });

    /*
     * Unlike `POST /account/password`, `accountService.reauth` writes nothing and revokes no
     * session — it only compares the password. A failed re-mint here means the whole point of the
     * endpoint (a fresh session, to clear a step-up challenge) did not happen, so it must answer
     * 500, not the false 200-with-no-token the code used to degrade to.
     */
    it('answers 500 with no jwt cookie when the re-mint fails, rather than a false 200', async () => {
        const { bearer } = await loginWithCookie();
        jest.spyOn(userService, 'tokenAdd').mockRejectedValueOnce(new Error('write conflict'));

        const response = await api()
            .post('/account/reauth')
            .set('Authorization', bearer)
            .send({ method: 'password', password: PLAIN_PASSWORD });

        expect(response.status).toBe(500);
        expect(setCookie(response, 'jwt')).toBeUndefined();
        jest.restoreAllMocks();
    });
});

describe('POST /account/export', () => {
    it("returns the caller's profile and sessions, and satisfies the contract", async () => {
        const { user, bearer } = await loginWithCookie();

        const response = await api().post('/account/export').set('Authorization', bearer).send();

        expect(response.status).toBe(200);
        const { data } = response.body as {
            data: { profile: { email: string }; sessions: { id: string; type: string }[] };
        };
        expect(data.profile.email).toBe(user.email);
        expect(data.sessions.some((session) => session.type === 'refresh')).toBe(true);
    });
});

describe('POST /account/logout', () => {
    it('revokes exactly the cookie session', async () => {
        const { jwtCookie } = await loginWithCookie();

        const response = await api().post('/account/logout').set('Cookie', jwtCookie);

        expect(response.status).toBe(200);

        // The revoked cookie can no longer mint access tokens — the session is dead server-side,
        // not merely cleared client-side.
        const refresh = await api().get('/account/refresh').set('Cookie', jwtCookie);
        expect(refresh.status).toBe(401);
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
     * stopped at `cart.self.checkout` alone. The BODY stays a bare profile so rung 2's refusal — which
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

        expect(setCookie(response, 'jwt')).toBeDefined();

        // The access token comes from the bootstrap the frontend already runs after OAuth.
        const refresh = await api()
            .get('/account/refresh')
            .set('Cookie', cookieHeader(response, 'jwt'));
        expect(refresh.status).toBe(200);
        expect(refresh.body.data.token).toEqual(expect.any(String));
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

        const account = await api().get('/account').set('Authorization', bearer);
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

        const refreshed = await api().get('/account/refresh').set('Cookie', jwtCookie);
        expect(refreshed.status).toBe(401);
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
        expect(added.status).toBe(201);
        expect(added.headers.location).toBe(`/account/addresses/${String(added.body.data.id)}`);
        expect(added.body.data.default).toBe(true);

        const second = await api()
            .post('/account/addresses')
            .set('Authorization', bearer)
            .send({ ...HOME, label: 'office', street: 'Via Milano 2', default: true });
        expect(second.status).toBe(201);
        expect(second.body.data).toMatchObject({ label: 'office', default: true });

        const listed = await api().get('/account/addresses').set('Authorization', bearer);
        expect(listed.status).toBe(200);
        expect(listed.body.data.addresses).toHaveLength(2);
        const defaults = listed.body.data.addresses.filter(
            ({ default: d }: { default: boolean }) => d
        );
        expect(defaults.map(({ label }: { label: string }) => label)).toEqual(['office']);

        const officeId = second.body.data.id as string;
        const updated = await api()
            .patch(`/account/addresses/${officeId}`)
            .set('Authorization', bearer)
            .send({ city: 'Bologna' });
        expect(updated.status).toBe(200);
        expect(updated.body.data).toMatchObject({ id: officeId, city: 'Bologna' });

        const removed = await api()
            .delete(`/account/addresses/${officeId}`)
            .set('Authorization', bearer);
        expect(removed.status).toBe(200);
        // The promoted survivor keeps the book at exactly one default.
        expect(
            removed.body.data.addresses.map(({ default: d }: { default: boolean }) => d)
        ).toEqual([true]);
    });

    // The default is the book's pointer: an idempotent action of its own, not a field of
    // one address, so it leaves the PUT and PATCH bodies and answers the address itself.
    it('moves the default with PUT .../default, and repeating it changes nothing', async () => {
        const { bearer } = await authenticateAs('user');
        await api().post('/account/addresses').set('Authorization', bearer).send(HOME);
        const second = await api()
            .post('/account/addresses')
            .set('Authorization', bearer)
            .send({ ...HOME, label: 'office', street: 'Via Milano 2' });
        const officeId = second.body.data.id as string;
        const send = () =>
            api().put(`/account/addresses/${officeId}/default`).set('Authorization', bearer);

        const first = await send();
        const again = await send();

        expect(first.status).toBe(200);
        expect(first.body.data).toMatchObject({ id: officeId, default: true });
        expect(again.body.data).toEqual(first.body.data);
        const listed = await api().get('/account/addresses').set('Authorization', bearer);
        expect(
            listed.body.data.addresses
                .filter(({ default: d }: { default: boolean }) => d)
                .map(({ label }: { label: string }) => label)
        ).toEqual(['office']);
    });

    it('refuses `default` in a PUT or PATCH body — it is no longer a field of one address', async () => {
        const { bearer } = await authenticateAs('user');
        const added = await api()
            .post('/account/addresses')
            .set('Authorization', bearer)
            .send(HOME);
        const addressId = added.body.data.id as string;

        const response = await api()
            .patch(`/account/addresses/${addressId}`)
            .set('Authorization', bearer)
            .send({ default: true });

        expect(response.status).toBe(422);
    });

    it('404s the default action for an entry the caller does not hold', async () => {
        const { bearer } = await authenticateAs('user');

        const response = await api()
            .put(`/account/addresses/${MISSING_ID}/default`)
            .set('Authorization', bearer);

        expect(response.status).toBe(404);
    });

    it('matches the error contract for an invalid body', async () => {
        const { bearer } = await authenticateAs('user');
        const response = await api()
            .post('/account/addresses')
            .set('Authorization', bearer)
            .send({ label: 'incomplete' });

        expect(response.status).toBe(422);
    });

    // `country` is an ISO 3166-1 alpha-2 code, not free text — a full name or a lowercase
    // code both fail the contract's `CountryCode` pattern.
    it.each([
        ['a full country name', 'Italy'],
        ['a lowercase code', 'it'],
        ['a 3-letter code', 'ITA']
    ])('matches the error contract for %s as the country', async (_label, country) => {
        const { bearer } = await authenticateAs('user');
        const response = await api()
            .post('/account/addresses')
            .set('Authorization', bearer)
            .send({ ...HOME, country });

        expect(response.status).toBe(422);
    });

    it('matches the error contract for an entry the caller does not hold', async () => {
        const { bearer } = await authenticateAs('user');
        const response = await api()
            .patch(`/account/addresses/${MISSING_ID}`)
            .set('Authorization', bearer)
            .send({ city: 'Nowhere' });

        expect(response.status).toBe(404);
    });

    // A PUT body IS the new resource (RFC 9110 §9.3.4) — every writable field
    // this resource has must be nameable, and the five identity fields are genuinely required.
    it('PUT replaces the whole entry, requiring every identity field', async () => {
        const { bearer } = await authenticateAs('user');
        const added = await api()
            .post('/account/addresses')
            .set('Authorization', bearer)
            .send(HOME);
        const addressId = added.body.data.id as string;

        const response = await api()
            .put(`/account/addresses/${addressId}`)
            .set('Authorization', bearer)
            .send({
                fullName: 'Ada L.',
                street: 'Via Torino 9',
                city: 'Torino',
                zip: '10121',
                country: 'IT'
            });

        expect(response.status).toBe(200);
        const replaced = response.body.data as { id: string; city: string; label?: string };
        expect(replaced.id).toBe(addressId);
        expect(replaced.city).toBe('Torino');
        // Omitted on a PUT — RFC 9110 clears it, not "leaves it alone".
        expect(replaced.label).toBeUndefined();
    });

    it('PUT refuses a body missing a required identity field', async () => {
        const { bearer } = await authenticateAs('user');
        const added = await api()
            .post('/account/addresses')
            .set('Authorization', bearer)
            .send(HOME);
        const addressId = added.body.data.id as string;

        const response = await api()
            .put(`/account/addresses/${addressId}`)
            .set('Authorization', bearer)
            .send({ fullName: 'Ada L.', street: 'Via Torino 9', city: 'Torino', zip: '10121' });

        expect(response.status).toBe(422);
    });

    it('PATCH null clears the optional label, leaving everything else unchanged', async () => {
        const { bearer } = await authenticateAs('user');
        const added = await api()
            .post('/account/addresses')
            .set('Authorization', bearer)
            .send(HOME);
        const addressId = added.body.data.id as string;

        const response = await api()
            .patch(`/account/addresses/${addressId}`)
            .set('Authorization', bearer)
            .send({ label: null });

        expect(response.status).toBe(200);
        const patched = response.body.data as { label?: string; city: string };
        expect(patched.label).toBeUndefined();
        expect(patched.city).toBe(HOME.city);
    });

    it('PATCH refuses "" for the optional label, never a synonym for null', async () => {
        const { bearer } = await authenticateAs('user');
        const added = await api()
            .post('/account/addresses')
            .set('Authorization', bearer)
            .send(HOME);
        const addressId = added.body.data.id as string;

        const response = await api()
            .patch(`/account/addresses/${addressId}`)
            .set('Authorization', bearer)
            .send({ label: '' });

        expect(response.status).toBe(422);
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
    });
});
