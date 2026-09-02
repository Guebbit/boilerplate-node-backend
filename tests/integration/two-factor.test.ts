/**
 * Two-factor authentication end to end: enroll, confirm, log in through the two-step challenge,
 * disable — driven through the real Express app so routing, guards and serialization all run for
 * real, the same reasoning `tests/support/http.ts` gives for every suite that uses it.
 *
 * The one test that matters most is the bypass check at the bottom: if a challenge token can
 * authenticate a request on its own, nothing else here is worth anything.
 */

import { generate } from 'otplib';
import { decode } from 'jsonwebtoken';
import { api, authenticateAs } from '@tests/http';
import { setupTestDb } from '@tests/setup-test-db';

setupTestDb();

/**
 * Generates the code a real authenticator app would show for this secret, at a given RFC 6238
 * time step relative to now. `stepsFromNow` defaults to 0 ("right now"); a caller after
 * `enrollTwoFactor` — which already spends the "now" step confirming — passes 1 to land on the
 * NEXT step, so replay protection does not reject a code this suite never actually replayed.
 * `epochTolerance` on the server side is symmetric (past and future), so a code minted one step
 * ahead still verifies immediately rather than needing a real 30-second wait.
 */
const codeFor = (secret: string, stepsFromNow = 0): Promise<string> =>
    generate({ secret, epoch: Math.floor(Date.now() / 1000) + stepsFromNow * 30 });

/** Enrolls and confirms 2FA for an authenticated caller, returning the secret and backup codes. */
const enrollTwoFactor = async (bearer: string) => {
    const setup = await api().post('/account/2fa/setup').set('Authorization', bearer).send();
    const { secret } = setup.body.data as { secret: string; otpauthUri: string };

    const confirm = await api()
        .post('/account/2fa/confirm')
        .set('Authorization', bearer)
        .send({ code: await codeFor(secret) });

    return { secret, backupCodes: confirm.body.data.backupCodes as string[] };
};

describe('enrollment', () => {
    it('requires a live session', async () => {
        const response = await api().post('/account/2fa/setup').send();

        expect(response.status).toBe(401);
    });

    it('returns a fresh secret and its otpauth:// URI', async () => {
        const { bearer } = await authenticateAs();

        const response = await api().post('/account/2fa/setup').set('Authorization', bearer).send();

        expect(response.status).toBe(200);
        expect(response.body.data.secret).toEqual(expect.any(String));
        expect(response.body.data.otpauthUri).toMatch(/^otpauth:\/\/totp\//);
    });

    it('refuses to confirm on a wrong code', async () => {
        const { bearer } = await authenticateAs();
        await api().post('/account/2fa/setup').set('Authorization', bearer).send();

        const response = await api()
            .post('/account/2fa/confirm')
            .set('Authorization', bearer)
            .send({ code: '000000' });

        expect(response.status).toBe(422);
    });

    it('arms the account and returns backup codes on the right code', async () => {
        const { bearer } = await authenticateAs();

        const { backupCodes } = await enrollTwoFactor(bearer);

        expect(backupCodes.length).toBeGreaterThanOrEqual(10);
        expect(new Set(backupCodes).size).toBe(backupCodes.length);

        const profile = await api().get('/account').set('Authorization', bearer).send();
        expect(profile.body.data.twoFactorEnabledAt).toEqual(expect.any(String));
    });

    it('a pending, unconfirmed secret does not change login', async () => {
        const { user, bearer } = await authenticateAs();
        await api().post('/account/2fa/setup').set('Authorization', bearer).send();

        const login = await api()
            .post('/account/login')
            .send({ email: user.email, password: 'Password1!' });

        expect(login.status).toBe(200);
        expect(login.body.data.token).toEqual(expect.any(String));
        expect(login.body.data.mfaRequired).toBeUndefined();
    });
});

describe('logging in with 2FA enabled', () => {
    it('answers a challenge instead of a token', async () => {
        const { user, bearer } = await authenticateAs();
        await enrollTwoFactor(bearer);

        const login = await api()
            .post('/account/login')
            .send({ email: user.email, password: 'Password1!' });

        expect(login.status).toBe(200);
        expect(login.body.data).toEqual({ mfaRequired: true, challenge: expect.any(String) });
        expect(login.headers['set-cookie']).toBeUndefined();
    });

    it('rejects a wrong code against the challenge', async () => {
        const { user, bearer } = await authenticateAs();
        await enrollTwoFactor(bearer);
        const login = await api()
            .post('/account/login')
            .send({ email: user.email, password: 'Password1!' });

        const response = await api()
            .post('/account/login/2fa')
            .send({ challenge: login.body.data.challenge, code: '000000' });

        expect(response.status).toBe(422);
    });

    it('mints a session on the right code, carrying otp in amr', async () => {
        const { user, bearer } = await authenticateAs();
        const { secret } = await enrollTwoFactor(bearer);
        const login = await api()
            .post('/account/login')
            .send({ email: user.email, password: 'Password1!' });

        const response = await api()
            .post('/account/login/2fa')
            .send({ challenge: login.body.data.challenge, code: await codeFor(secret, 1) });

        expect(response.status).toBe(200);
        const claims = decode(response.body.data.token as string) as { amr?: string[] };
        expect(claims.amr).toEqual(['pwd', 'otp']);
    });

    it('refuses the identical code on a second, separate login — replay protection', async () => {
        const { user, bearer } = await authenticateAs();
        const { secret } = await enrollTwoFactor(bearer);
        const code = await codeFor(secret, 1);

        const firstLogin = await api()
            .post('/account/login')
            .send({ email: user.email, password: 'Password1!' });
        const first = await api()
            .post('/account/login/2fa')
            .send({ challenge: firstLogin.body.data.challenge, code });
        expect(first.status).toBe(200);

        const secondLogin = await api()
            .post('/account/login')
            .send({ email: user.email, password: 'Password1!' });
        const second = await api()
            .post('/account/login/2fa')
            .send({ challenge: secondLogin.body.data.challenge, code });

        expect(second.status).toBe(422);
    });

    it('accepts a backup code once, and refuses it a second time', async () => {
        const { user, bearer } = await authenticateAs();
        const { backupCodes } = await enrollTwoFactor(bearer);
        const [backupCode] = backupCodes;

        const firstLogin = await api()
            .post('/account/login')
            .send({ email: user.email, password: 'Password1!' });
        const first = await api()
            .post('/account/login/2fa')
            .send({ challenge: firstLogin.body.data.challenge, code: backupCode });
        expect(first.status).toBe(200);

        const secondLogin = await api()
            .post('/account/login')
            .send({ email: user.email, password: 'Password1!' });
        const second = await api()
            .post('/account/login/2fa')
            .send({ challenge: secondLogin.body.data.challenge, code: backupCode });

        expect(second.status).toBe(422);
    });

    it('kills the challenge after too many wrong attempts, regardless of the account/address budgets', async () => {
        const { user, bearer } = await authenticateAs();
        await enrollTwoFactor(bearer);
        const login = await api()
            .post('/account/login')
            .send({ email: user.email, password: 'Password1!' });
        const { challenge } = login.body.data as { challenge: string };

        const attempts = await Promise.all(
            Array.from({ length: 6 }, () =>
                api().post('/account/login/2fa').send({ challenge, code: '000000' })
            )
        );

        expect(attempts.some((response) => response.status === 429)).toBe(true);
    });
});

describe('disabling 2FA', () => {
    it('refuses on a wrong code', async () => {
        const { bearer } = await authenticateAs();
        await enrollTwoFactor(bearer);

        const response = await api()
            .delete('/account/2fa')
            .set('Authorization', bearer)
            .send({ code: '000000' });

        expect(response.status).toBe(422);
    });

    it('turns 2FA off on the right code, and login stops challenging', async () => {
        const { user, bearer } = await authenticateAs();
        const { secret } = await enrollTwoFactor(bearer);

        const disable = await api()
            .delete('/account/2fa')
            .set('Authorization', bearer)
            .send({ code: await codeFor(secret, 1) });
        expect(disable.status).toBe(200);

        const login = await api()
            .post('/account/login')
            .send({ email: user.email, password: 'Password1!' });

        expect(login.body.data.token).toEqual(expect.any(String));
        expect(login.body.data.mfaRequired).toBeUndefined();
    });
});

describe('admin-assisted recovery', () => {
    it('strips a user’s second factor with no code, and login stops challenging', async () => {
        const { user, bearer } = await authenticateAs();
        await enrollTwoFactor(bearer);
        const { bearer: adminBearer } = await authenticateAs('admin');

        const recovery = await api()
            .delete(`/users/${user._id.toString()}/2fa`)
            .set('Authorization', adminBearer)
            .send();
        expect(recovery.status).toBe(200);

        const login = await api()
            .post('/account/login')
            .send({ email: user.email, password: 'Password1!' });

        expect(login.body.data.token).toEqual(expect.any(String));
        expect(login.body.data.mfaRequired).toBeUndefined();
    });

    it('is refused to a non-admin', async () => {
        const { user, bearer } = await authenticateAs();
        await enrollTwoFactor(bearer);

        const response = await api()
            .delete(`/users/${user._id.toString()}/2fa`)
            .set('Authorization', bearer)
            .send();

        expect(response.status).toBe(403);
    });
});

describe('the bypass — a challenge token must never authenticate a request on its own', () => {
    it('is rejected by isAuth, the same as any other invalid token', async () => {
        const { user, bearer } = await authenticateAs();
        await enrollTwoFactor(bearer);
        const login = await api()
            .post('/account/login')
            .send({ email: user.email, password: 'Password1!' });
        const { challenge } = login.body.data as { challenge: string };

        const response = await api()
            .get('/account')
            .set('Authorization', `Bearer ${challenge}`)
            .send();

        expect(response.status).toBe(401);
    });
});
