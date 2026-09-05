/**
 * Two-factor authentication end to end: enroll a device factor and a delivered one, log in through
 * the two-step challenge with either, remove one, disable the rest — driven through the real
 * Express app so routing, guards and serialization all run for real, the same reasoning
 * `tests/support/http.ts` gives for every suite that uses it.
 *
 * The one test that matters most is the bypass check at the bottom: if a challenge token can
 * authenticate a request on its own, nothing else here is worth anything.
 */

import { generate } from 'otplib';
import { decode } from 'jsonwebtoken';
import { api, authenticateAs } from '@tests/http';
import { setupTestDb } from '@tests/setup-test-db';
import { userRepository, TokenType, hashToken } from '@modules/users';
import { createUser, PLAIN_PASSWORD } from '@modules/users/tests/fixtures';
import { accountService } from '@modules/account/services';
import { DELIVERED_CODE_MAX_ATTEMPTS } from '@modules/account/two-factor';
import { testCallerContext } from '@tests/caller-context';

/**
 * Every mail the app queued, newest last.
 *
 * The only way to read a delivered code: it exists in the clear exactly once, in the message, and
 * the account stores nothing but its HMAC. Named `mock*` because `jest.mock` is hoisted above the
 * imports and may only close over identifiers with that prefix.
 */
const mockOutbox: { template: string; data: Record<string, unknown> }[] = [];

jest.mock('@infrastructure/adapters/mailer', () => ({
    ...jest.requireActual<typeof import('@infrastructure/adapters/mailer')>(
        '@infrastructure/adapters/mailer'
    ),
    enqueueEmail: jest.fn((_envelope: unknown, template: string, data: Record<string, unknown>) => {
        mockOutbox.push({ template, data });
        return Promise.resolve();
    })
}));

setupTestDb();

beforeEach(() => {
    mockOutbox.length = 0;
});

/**
 * Generates the code a real authenticator app would show for this secret, at a given RFC 6238
 * time step relative to now. `stepsFromNow` defaults to 0 ("right now"); a caller after
 * `enrollTotp` — which already spends the "now" step confirming — passes 1 to land on the
 * NEXT step, so replay protection does not reject a code this suite never actually replayed.
 * `epochTolerance` on the server side is symmetric (past and future), so a code minted one step
 * ahead still verifies immediately rather than needing a real 30-second wait.
 */
const codeFor = (secret: string, stepsFromNow = 0): Promise<string> =>
    generate({ secret, epoch: Math.floor(Date.now() / 1000) + stepsFromNow * 30 });

/** The digits from the most recent two-factor mail — what the recipient would type. */
const mailedCode = (): string => {
    const mail = mockOutbox.findLast(({ template }) => template === 'account.two-factor-code');
    if (!mail) throw new Error('No two-factor code was mailed');
    return mail.data.code as string;
};

/**
 * A signed-in account whose address is VERIFIED, which is what the email factor requires.
 * `authenticateAs` leaves `verified` at the schema default, deliberately, so this suite asks for
 * the state it needs rather than changing the default for everyone.
 */
const authenticateVerified = async () => {
    const user = await createUser({ verified: true, email: 'ada@example.com' });
    const login = await api()
        .post('/account/login')
        .send({ email: user.email, password: PLAIN_PASSWORD });

    return { user, bearer: `Bearer ${login.body.data.token as string}` as const };
};

/** Enrolls and confirms the TOTP factor for an authenticated caller. */
const enrollTotp = async (bearer: string) => {
    const setup = await api()
        .post('/account/2fa/methods/totp/setup')
        .set('Authorization', bearer)
        .send();
    const { secret } = setup.body.data as { secret: string };

    const confirm = await api()
        .post('/account/2fa/methods/totp/confirm')
        .set('Authorization', bearer)
        .send({ code: await codeFor(secret) });

    return { secret, backupCodes: (confirm.body.data.backupCodes ?? []) as string[] };
};

/** Enrolls and confirms the email factor, reading the code back out of the outbox. */
const enrollEmail = async (bearer: string) => {
    await api().post('/account/2fa/methods/email/setup').set('Authorization', bearer).send();

    const confirm = await api()
        .post('/account/2fa/methods/email/confirm')
        .set('Authorization', bearer)
        .send({ code: mailedCode() });

    return { backupCodes: (confirm.body.data.backupCodes ?? []) as string[] };
};

/** Password step only — the half that answers with a challenge rather than a token. */
const startLogin = (email: string) =>
    api().post('/account/login').send({ email, password: PLAIN_PASSWORD });

/**
 * Mints a fresh, DB-backed MFA challenge for this user id, at the service level — the
 * `POST /account/login` password step's own half, without a login round trip. For suites that
 * need a NEW challenge per call, same reasoning `startLogin` gives at the HTTP level.
 */
const mintChallenge = (userId: string): Promise<string> =>
    userRepository
        .findByIdWithCredentials(userId)
        .then((user) => accountService.buildLoginChallenge(user!))
        .then(({ challenge }) => challenge);

describe('status', () => {
    it('requires a live session', async () => {
        const response = await api().get('/account/2fa').send();

        expect(response.status).toBe(401);
    });

    it('reports nothing armed, and both methods available, on a fresh verified account', async () => {
        const { bearer } = await authenticateVerified();

        const response = await api().get('/account/2fa').set('Authorization', bearer).send();

        expect(response.status).toBe(200);
        expect(response.body.data.enabled).toBe(false);
        expect(response.body.data.methods).toEqual([]);
        expect(response.body.data.backupCodesRemaining).toBe(0);
        expect(
            (response.body.data.available as { method: string; enrollable: boolean }[]).map(
                ({ method, enrollable }) => [method, enrollable]
            )
        ).toEqual([
            ['totp', true],
            ['email', true]
        ]);
    });

    it('offers email as un-enrollable, with a reason, until the address is verified', async () => {
        const { bearer } = await authenticateAs();

        const response = await api().get('/account/2fa').set('Authorization', bearer).send();

        const email = (
            response.body.data.available as {
                method: string;
                enrollable: boolean;
                reason?: string;
            }[]
        ).find(({ method }) => method === 'email');
        expect(email?.enrollable).toBe(false);
        expect(email?.reason).toEqual(expect.any(String));
    });

    it('moves an armed method out of `available` and into `methods`', async () => {
        const { bearer } = await authenticateVerified();
        await enrollTotp(bearer);

        const response = await api().get('/account/2fa').set('Authorization', bearer).send();

        expect(response.body.data.enabled).toBe(true);
        expect((response.body.data.methods as { method: string }[]).map((m) => m.method)).toEqual([
            'totp'
        ]);
        expect((response.body.data.available as { method: string }[]).map((m) => m.method)).toEqual(
            ['email']
        );
        expect(response.body.data.backupCodesRemaining).toBe(10);
    });
});

describe('enrolling the device factor', () => {
    it('requires a live session', async () => {
        const response = await api().post('/account/2fa/methods/totp/setup').send();

        expect(response.status).toBe(401);
    });

    it('answers 404 for a method this deployment does not run', async () => {
        const { bearer } = await authenticateVerified();

        const response = await api()
            .post('/account/2fa/methods/carrier-pigeon/setup')
            .set('Authorization', bearer)
            .send();

        expect(response.status).toBe(404);
    });

    it('returns a fresh secret and its otpauth:// URI, and sends no mail', async () => {
        const { bearer } = await authenticateVerified();

        const response = await api()
            .post('/account/2fa/methods/totp/setup')
            .set('Authorization', bearer)
            .send();

        expect(response.status).toBe(200);
        expect(response.body.data.delivers).toBe(false);
        expect(response.body.data.secret).toEqual(expect.any(String));
        expect(response.body.data.otpauthUri).toMatch(/^otpauth:\/\/totp\//);
        expect(mockOutbox).toEqual([]);
    });

    it('refuses to confirm on a wrong code', async () => {
        const { bearer } = await authenticateVerified();
        await api().post('/account/2fa/methods/totp/setup').set('Authorization', bearer).send();

        const response = await api()
            .post('/account/2fa/methods/totp/confirm')
            .set('Authorization', bearer)
            .send({ code: '000000' });

        expect(response.status).toBe(422);
    });

    it('arms the account and returns backup codes on the right code', async () => {
        const { bearer } = await authenticateVerified();

        const { backupCodes } = await enrollTotp(bearer);

        expect(backupCodes.length).toBe(10);
        expect(new Set(backupCodes).size).toBe(backupCodes.length);

        const profile = await api().get('/account').set('Authorization', bearer).send();
        expect(profile.body.data.twoFactorEnabledAt).toEqual(expect.any(String));
    });

    it('a pending, unconfirmed factor does not change login', async () => {
        const { user, bearer } = await authenticateVerified();
        await api().post('/account/2fa/methods/totp/setup').set('Authorization', bearer).send();

        const login = await startLogin(user.email);

        expect(login.status).toBe(200);
        expect(login.body.data.token).toEqual(expect.any(String));
        expect(login.body.data.mfaRequired).toBeUndefined();
    });
});

describe('enrolling the email factor', () => {
    it('refuses an account whose address is not verified', async () => {
        const { bearer } = await authenticateAs();

        const response = await api()
            .post('/account/2fa/methods/email/setup')
            .set('Authorization', bearer)
            .send();

        expect(response.status).toBe(422);
        expect(mockOutbox).toEqual([]);
    });

    it('mails a code and answers with the MASKED address, never the whole one', async () => {
        const { bearer } = await authenticateVerified();

        const response = await api()
            .post('/account/2fa/methods/email/setup')
            .set('Authorization', bearer)
            .send();

        expect(response.status).toBe(200);
        expect(response.body.data.delivers).toBe(true);
        expect(response.body.data.sentTo).toBe('a***a@example.com');
        expect(response.body.data.sentTo).not.toContain('ada@example.com');
        expect(response.body.data.secret).toBeUndefined();
        expect(mockOutbox).toHaveLength(1);
        expect(mailedCode()).toMatch(/^\d{6}$/);
    });

    it('arms the account on the mailed code', async () => {
        const { bearer } = await authenticateVerified();

        await enrollEmail(bearer);

        const status = await api().get('/account/2fa').set('Authorization', bearer).send();
        expect((status.body.data.methods as { method: string }[]).map((m) => m.method)).toEqual([
            'email'
        ]);
    });

    it('refuses a code that was never mailed', async () => {
        const { bearer } = await authenticateVerified();
        await api().post('/account/2fa/methods/email/setup').set('Authorization', bearer).send();

        const response = await api()
            .post('/account/2fa/methods/email/confirm')
            .set('Authorization', bearer)
            .send({ code: '000000' });

        expect(response.status).toBe(422);
    });

    it('refuses a second send inside the cooldown, and says how long to wait', async () => {
        const { bearer } = await authenticateVerified();
        await api().post('/account/2fa/methods/email/setup').set('Authorization', bearer).send();

        const response = await api()
            .post('/account/2fa/methods/email/setup')
            .set('Authorization', bearer)
            .send();

        expect(response.status).toBe(429);
        expect(response.body.errors[0].details.retryAfter).toBeGreaterThan(0);
        // The cooldown is what stops the mail, not just the response: one queued message, not two.
        expect(mockOutbox).toHaveLength(1);
    });

    it('mints no second set of backup codes for a second factor', async () => {
        const { bearer } = await authenticateVerified();
        const { backupCodes: first } = await enrollTotp(bearer);
        const { backupCodes: second } = await enrollEmail(bearer);

        expect(first).toHaveLength(10);
        // They recover the ACCOUNT, not the method — a second factor re-issuing them would
        // silently invalidate the list the user already wrote down.
        expect(second).toEqual([]);
    });
});

describe('logging in with a device factor', () => {
    it('answers a challenge instead of a token, naming what it accepts', async () => {
        const { user, bearer } = await authenticateVerified();
        await enrollTotp(bearer);

        const login = await startLogin(user.email);

        expect(login.status).toBe(200);
        expect(login.body.data.mfaRequired).toBe(true);
        expect(login.body.data.challenge).toEqual(expect.any(String));
        expect(login.body.data.defaultMethod).toBe('totp');
        expect(login.body.data.methods).toEqual([{ method: 'totp', delivers: false }]);
        expect(login.headers['set-cookie']).toBeUndefined();
    });

    it('rejects a wrong code against the challenge', async () => {
        const { user, bearer } = await authenticateVerified();
        await enrollTotp(bearer);
        const login = await startLogin(user.email);

        const response = await api()
            .post('/account/login/2fa')
            .send({ challenge: login.body.data.challenge, code: '000000' });

        expect(response.status).toBe(422);
    });

    it('mints a session on the right code, carrying otp in amr', async () => {
        const { user, bearer } = await authenticateVerified();
        const { secret } = await enrollTotp(bearer);
        const login = await startLogin(user.email);

        const response = await api()
            .post('/account/login/2fa')
            .send({ challenge: login.body.data.challenge, code: await codeFor(secret, 1) });

        expect(response.status).toBe(200);
        const claims = decode(response.body.data.token as string) as { amr?: string[] };
        expect(claims.amr).toEqual(['pwd', 'otp']);
    });

    it('refuses the identical code on a second, separate login — replay protection', async () => {
        const { user, bearer } = await authenticateVerified();
        const { secret } = await enrollTotp(bearer);
        const code = await codeFor(secret, 1);

        const firstLogin = await startLogin(user.email);
        const first = await api()
            .post('/account/login/2fa')
            .send({ challenge: firstLogin.body.data.challenge, code });
        expect(first.status).toBe(200);

        const secondLogin = await startLogin(user.email);
        const second = await api()
            .post('/account/login/2fa')
            .send({ challenge: secondLogin.body.data.challenge, code });

        expect(second.status).toBe(422);
    });

    it('accepts a backup code once, and refuses it a second time', async () => {
        const { user, bearer } = await authenticateVerified();
        const { backupCodes } = await enrollTotp(bearer);
        const [backupCode] = backupCodes;

        const firstLogin = await startLogin(user.email);
        const first = await api()
            .post('/account/login/2fa')
            .send({ challenge: firstLogin.body.data.challenge, code: backupCode });
        expect(first.status).toBe(200);

        const secondLogin = await startLogin(user.email);
        const second = await api()
            .post('/account/login/2fa')
            .send({ challenge: secondLogin.body.data.challenge, code: backupCode });

        expect(second.status).toBe(422);
    });

    it('kills the challenge after too many wrong attempts, regardless of the account/address budgets', async () => {
        const { user, bearer } = await authenticateVerified();
        await enrollTotp(bearer);
        const login = await startLogin(user.email);
        const { challenge } = login.body.data as { challenge: string };

        const attempts = await Promise.all(
            Array.from({ length: 6 }, () =>
                api().post('/account/login/2fa').send({ challenge, code: '000000' })
            )
        );

        expect(attempts.some((response) => response.status === 429)).toBe(true);
    });

    it('spends the challenge on success — presenting it again fails even with a fresh code', async () => {
        // The property the JWT design never had: a challenge is a single-use, revocable token now
        // (users/model.ts's tokens[]), not a self-verifying signature good for its whole TTL.
        const { user, bearer } = await authenticateVerified();
        const { secret } = await enrollTotp(bearer);
        const login = await startLogin(user.email);
        const { challenge } = login.body.data as { challenge: string };

        const first = await api()
            .post('/account/login/2fa')
            .send({ challenge, code: await codeFor(secret, 1) });
        expect(first.status).toBe(200);

        // A different, otherwise-valid code — this fails on the CHALLENGE being gone, not on
        // TOTP's own replay guard, which the earlier "replay protection" test already covers.
        const second = await api()
            .post('/account/login/2fa')
            .send({ challenge, code: await codeFor(secret, 2) });
        expect(second.status).toBe(401);
    });

    it('leaves the challenge live after a wrong code, for a right one to still use', async () => {
        const { user, bearer } = await authenticateVerified();
        const { secret } = await enrollTotp(bearer);
        const login = await startLogin(user.email);
        const { challenge } = login.body.data as { challenge: string };

        const wrong = await api().post('/account/login/2fa').send({ challenge, code: '000000' });
        expect(wrong.status).toBe(422);

        const right = await api()
            .post('/account/login/2fa')
            .send({ challenge, code: await codeFor(secret, 1) });
        expect(right.status).toBe(200);
    });

    it('refuses a challenge past its expiry, the same as a forged one', async () => {
        /*
         * Seeded directly, like the stale-reset-token case in `self-service.test.ts`'s
         * `findLiveToken` suite: `tokenAdd` cannot produce a past `expiration` itself, and this is
         * the state a genuinely stale challenge reaches. Regression coverage for the gap the JWT
         * design had — a signed challenge kept verifying for its whole TTL with no way to check it
         * against anything; this one is refused the moment it's past its stored deadline.
         */
        await createUser({
            email: 'stale-challenge@example.com',
            tokens: [
                {
                    type: TokenType.MFA_CHALLENGE,
                    token: hashToken('stale-mfa-challenge'),
                    expiration: new Date(Date.now() - 1000)
                }
            ]
        });

        const response = await api()
            .post('/account/login/2fa')
            .send({ challenge: 'stale-mfa-challenge', code: '000000' });

        expect(response.status).toBe(401);
    });
});

describe('logging in with the email factor', () => {
    it('offers the method, masked, and a longer challenge than a device-only account gets', async () => {
        const { user, bearer } = await authenticateVerified();
        await enrollEmail(bearer);

        const login = await startLogin(user.email);

        // No `enrolledAt`: whoever is answering this challenge has proved a password and nothing
        // else, and when the factor was armed is not theirs to know.
        expect(login.body.data.methods).toEqual([
            { method: 'email', delivers: true, target: 'a***a@example.com', resendAfter: 30 }
        ]);
        // Ten minutes, not five: the code has an SMTP queue and a person switching apps to survive.
        const remaining = new Date(login.body.data.expiresAt as string).getTime() - Date.now();
        expect(remaining).toBeGreaterThan(300_000);
    });

    it('sends nothing until asked — the password step must not mail anyone', async () => {
        const { user, bearer } = await authenticateVerified();
        await enrollEmail(bearer);
        mockOutbox.length = 0;

        await startLogin(user.email);

        // Otherwise every password guess against a known address is a free message to its owner.
        expect(mockOutbox).toEqual([]);
    });

    it('mails a code on request and completes the login with it', async () => {
        const { user, bearer } = await authenticateVerified();
        await enrollEmail(bearer);
        const login = await startLogin(user.email);
        const { challenge } = login.body.data as { challenge: string };
        mockOutbox.length = 0;

        const send = await api()
            .post('/account/login/2fa/send')
            .send({ challenge, method: 'email' });
        expect(send.status).toBe(200);
        expect(send.body.data.sentTo).toBe('a***a@example.com');

        const response = await api()
            .post('/account/login/2fa')
            .send({ challenge, code: mailedCode() });

        expect(response.status).toBe(200);
        const claims = decode(response.body.data.token as string) as { amr?: string[] };
        expect(claims.amr).toEqual(['pwd', 'otp']);
    });

    it('refuses a resend inside the cooldown', async () => {
        const { user, bearer } = await authenticateVerified();
        await enrollEmail(bearer);
        const login = await startLogin(user.email);
        const { challenge } = login.body.data as { challenge: string };

        await api().post('/account/login/2fa/send').send({ challenge, method: 'email' });
        const second = await api()
            .post('/account/login/2fa/send')
            .send({ challenge, method: 'email' });

        expect(second.status).toBe(429);
    });

    it('refuses to send through a method the account has not armed', async () => {
        const { user, bearer } = await authenticateVerified();
        await enrollTotp(bearer);
        const login = await startLogin(user.email);

        const response = await api()
            .post('/account/login/2fa/send')
            .send({ challenge: login.body.data.challenge, method: 'email' });

        expect(response.status).toBe(422);
        expect(mockOutbox).toEqual([]);
    });

    it('refuses to send against a forged challenge', async () => {
        const response = await api()
            .post('/account/login/2fa/send')
            .send({ challenge: 'not-a-real-challenge', method: 'email' });

        expect(response.status).toBe(401);
        expect(mockOutbox).toEqual([]);
    });

    it('burns the code after DELIVERED_CODE_MAX_ATTEMPTS wrong guesses, ACROSS challenges', async () => {
        const { user, bearer } = await authenticateVerified();
        await enrollEmail(bearer);
        mockOutbox.length = 0;
        const userId = user._id.toString();
        await accountService.sendLoginCode(await mintChallenge(userId), 'email', testCallerContext);
        const code = mailedCode();

        /*
         * Driven at the SERVICE, not over HTTP, and a fresh challenge per guess — both deliberate.
         *
         * A fresh challenge because that is the attack: `mfaChallengeLimiter` caps attempts against
         * one challenge, but the delivered code lives on the user document and outlives any single
         * challenge, so a caller who simply logs in again would otherwise get a clean budget to
         * keep guessing the SAME six digits with. The per-code ceiling is what closes that, and
         * nothing else does.
         *
         * At the service because the route's own credential budget — shared with every other suite
         * in this run — refuses the sixth call before the ceiling can answer, which would leave
         * this asserting on a limiter rather than on the ceiling.
         *
         * Sequential, not concurrent: the ceiling is a counter on one document, and parallel calls
         * would race each other's read-modify-write instead of testing it.
         */
        for (let attempt = 0; attempt < DELIVERED_CODE_MAX_ATTEMPTS; attempt++)
            await accountService.verifyLoginChallenge(
                await mintChallenge(userId),
                '000000',
                testCallerContext
            );

        const result = await accountService.verifyLoginChallenge(
            await mintChallenge(userId),
            code,
            testCallerContext
        );

        expect(result.success).toBe(false);
    });

    it('burns an ENROLLMENT code after the same ceiling', async () => {
        const { bearer } = await authenticateVerified();
        await api().post('/account/2fa/methods/email/setup').set('Authorization', bearer).send();
        const code = mailedCode();

        // Over HTTP because the confirm route carries no limiter of its own — the ceiling is the
        // only thing bounding guesses here, which is exactly what this asserts.
        for (let attempt = 0; attempt < DELIVERED_CODE_MAX_ATTEMPTS; attempt++)
            await api()
                .post('/account/2fa/methods/email/confirm')
                .set('Authorization', bearer)
                .send({ code: '000000' });

        const response = await api()
            .post('/account/2fa/methods/email/confirm')
            .set('Authorization', bearer)
            .send({ code });

        expect(response.status).toBe(422);
    });
});

describe('several factors at once', () => {
    it('offers both, device first, and accepts either', async () => {
        const { user, bearer } = await authenticateVerified();
        const { secret } = await enrollTotp(bearer);
        await enrollEmail(bearer);

        const login = await startLogin(user.email);
        expect((login.body.data.methods as { method: string }[]).map((m) => m.method)).toEqual([
            'totp',
            'email'
        ]);
        // The cheapest for the user: no round-trip, no mailbox.
        expect(login.body.data.defaultMethod).toBe('totp');

        const response = await api()
            .post('/account/login/2fa')
            .send({ challenge: login.body.data.challenge, code: await codeFor(secret, 1) });

        expect(response.status).toBe(200);
    });

    it('removing one leaves the other armed, and login still challenges', async () => {
        const { user, bearer } = await authenticateVerified();
        const { secret } = await enrollTotp(bearer);
        await enrollEmail(bearer);

        const removal = await api()
            .delete('/account/2fa/methods/email')
            .set('Authorization', bearer)
            .send({ code: await codeFor(secret, 1) });
        expect(removal.status).toBe(200);

        const login = await startLogin(user.email);
        expect(login.body.data.mfaRequired).toBe(true);
        expect((login.body.data.methods as { method: string }[]).map((m) => m.method)).toEqual([
            'totp'
        ]);
    });

    it('removing the LAST one turns the feature off, backup codes included', async () => {
        const { user, bearer } = await authenticateVerified();
        const { secret } = await enrollTotp(bearer);

        await api()
            .delete('/account/2fa/methods/totp')
            .set('Authorization', bearer)
            .send({ code: await codeFor(secret, 1) });

        const status = await api().get('/account/2fa').set('Authorization', bearer).send();
        expect(status.body.data.enabled).toBe(false);
        // Left behind, they would arm the NEXT enrollment with a list the user wrote down for a
        // factor that no longer exists.
        expect(status.body.data.backupCodesRemaining).toBe(0);

        const login = await startLogin(user.email);
        expect(login.body.data.token).toEqual(expect.any(String));
    });

    it('accepts a code from the OTHER armed factor when removing one', async () => {
        const { bearer } = await authenticateVerified();
        await enrollTotp(bearer);
        await enrollEmail(bearer);
        mockOutbox.length = 0;

        // Proving the email factor to remove the authenticator: any armed factor proves the
        // account, which is what the removal is really guarding.
        await api().post('/account/2fa/methods/email/setup').set('Authorization', bearer).send();
        const emailCode = mailedCode();
        await api()
            .post('/account/2fa/methods/email/confirm')
            .set('Authorization', bearer)
            .send({ code: emailCode });

        const login = await api()
            .post('/account/login')
            .send({ email: 'ada@example.com', password: PLAIN_PASSWORD });
        const send = await api()
            .post('/account/login/2fa/send')
            .send({ challenge: login.body.data.challenge, method: 'email' });
        expect(send.status).toBe(200);

        const removal = await api()
            .delete('/account/2fa/methods/totp')
            .set('Authorization', bearer)
            .send({ code: mailedCode() });

        expect(removal.status).toBe(200);
    });
});

describe('disabling 2FA', () => {
    it('refuses on a wrong code', async () => {
        const { bearer } = await authenticateVerified();
        await enrollTotp(bearer);

        const response = await api()
            .delete('/account/2fa')
            .set('Authorization', bearer)
            .send({ code: '000000' });

        expect(response.status).toBe(422);
    });

    it('turns 2FA off on the right code, and login stops challenging', async () => {
        const { user, bearer } = await authenticateVerified();
        const { secret } = await enrollTotp(bearer);
        await enrollEmail(bearer);

        const disable = await api()
            .delete('/account/2fa')
            .set('Authorization', bearer)
            .send({ code: await codeFor(secret, 1) });
        expect(disable.status).toBe(200);

        const login = await startLogin(user.email);

        expect(login.body.data.token).toEqual(expect.any(String));
        expect(login.body.data.mfaRequired).toBeUndefined();
    });
});

describe('regenerating backup codes', () => {
    it('refuses on a wrong code', async () => {
        const { bearer } = await authenticateVerified();
        await enrollTotp(bearer);

        const response = await api()
            .post('/account/2fa/backup-codes')
            .set('Authorization', bearer)
            .send({ code: '000000' });

        expect(response.status).toBe(422);
    });

    it('refuses when 2FA is not enabled', async () => {
        const { bearer } = await authenticateVerified();

        const response = await api()
            .post('/account/2fa/backup-codes')
            .set('Authorization', bearer)
            .send({ code: '000000' });

        expect(response.status).toBe(422);
    });

    it('mints a fresh set on the right code, and the old set stops working', async () => {
        const { user, bearer } = await authenticateVerified();
        const { secret, backupCodes: oldCodes } = await enrollTotp(bearer);

        const regenerate = await api()
            .post('/account/2fa/backup-codes')
            .set('Authorization', bearer)
            .send({ code: await codeFor(secret, 1) });

        expect(regenerate.status).toBe(200);
        const freshCodes = regenerate.body.data.backupCodes as string[];
        expect(freshCodes.length).toBe(10);
        expect(new Set(freshCodes).size).toBe(10);
        // A fresh draw, not the same list handed back again.
        expect(freshCodes.some((code) => oldCodes.includes(code))).toBe(false);

        const status = await api().get('/account/2fa').set('Authorization', bearer).send();
        expect(status.body.data.backupCodesRemaining).toBe(10);

        const login = await startLogin(user.email);
        const stale = await api()
            .post('/account/login/2fa')
            .send({ challenge: login.body.data.challenge, code: oldCodes[0] });
        expect(stale.status).toBe(422);
    });

    it('accepts an unused backup code to prove the caller, same as disabling would', async () => {
        const { bearer } = await authenticateVerified();
        const { backupCodes } = await enrollTotp(bearer);

        const regenerate = await api()
            .post('/account/2fa/backup-codes')
            .set('Authorization', bearer)
            .send({ code: backupCodes[0] });

        expect(regenerate.status).toBe(200);
    });
});

describe('admin-assisted recovery', () => {
    it('strips every second factor with no code, and login stops challenging', async () => {
        const { user, bearer } = await authenticateVerified();
        await enrollTotp(bearer);
        await enrollEmail(bearer);
        const { bearer: adminBearer } = await authenticateAs('admin');

        const recovery = await api()
            .delete(`/users/${user._id.toString()}/2fa`)
            .set('Authorization', adminBearer)
            .send();
        expect(recovery.status).toBe(200);

        const login = await startLogin(user.email);

        expect(login.body.data.token).toEqual(expect.any(String));
        expect(login.body.data.mfaRequired).toBeUndefined();
    });

    it('is refused to a non-admin', async () => {
        const { user, bearer } = await authenticateVerified();
        await enrollTotp(bearer);

        const response = await api()
            .delete(`/users/${user._id.toString()}/2fa`)
            .set('Authorization', bearer)
            .send();

        expect(response.status).toBe(403);
    });
});

describe('the bypass — a challenge token must never authenticate a request on its own', () => {
    it('is rejected by isAuth, the same as any other invalid token', async () => {
        const { user, bearer } = await authenticateVerified();
        await enrollTotp(bearer);
        const login = await startLogin(user.email);
        const { challenge } = login.body.data as { challenge: string };

        const response = await api()
            .get('/account')
            .set('Authorization', `Bearer ${challenge}`)
            .send();

        expect(response.status).toBe(401);
    });
});
