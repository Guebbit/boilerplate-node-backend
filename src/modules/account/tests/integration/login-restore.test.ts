/**
 * @module
 * Signing in during the deletion grace, over HTTP: the credentials check out, no session is
 * issued, a claim check goes back, and `POST /account/login/restore` cancels the deletion and
 * starts the session. Second factor first when armed (asked once), then the claim check.
 */

import { api } from '@tests/http';
import { setupTestDb } from '@tests/setup-test-db';
import { codeFor } from '@tests/totp';
import { cookieHeader, setCookie } from '@tests/cookies';
import { createUser, PLAIN_PASSWORD, userRepository } from '@modules/users/tests/factories';
import { userService } from '@modules/users';
import { registerOAuthProvider } from '../../oauth/providers';
import { fakeOAuthProvider } from '@scenarios/support/doubles/oauth-fake';
import { DELETION_RESTORE_TOKEN_TYPE } from '../../token-types';
import { plantToken, sessionRowsOf } from '../factories';
import { withoutInstance } from '@tests/problem';

setupTestDb();

beforeAll(() => {
    registerOAuthProvider('fake', () => fakeOAuthProvider);
});

/** The moment `days` days from now (negative: ago). */
const daysFromNow = (days: number): Date => new Date(Date.now() + days * 24 * 60 * 60 * 1000);

/** An account its owner asked to delete a minute ago; the epoch is safely before any new login. */
const pendingAccount = async (overrides: Parameters<typeof createUser>[0] = {}) => {
    const user = await createUser({
        email: 'pending@example.com',
        verifiedAt: new Date(),
        ...overrides
    });
    const stored = await userRepository.findById(user.id);
    await userService.scheduleOwnDeletion(stored!, new Date(Date.now() - 60_000), daysFromNow(20));
    return user;
};

/** The password step. */
const signIn = (email: string, password = PLAIN_PASSWORD) =>
    api().post('/account/login').send({ email, password });

/** Enrolls and confirms TOTP for an account that is NOT yet locked; returns the secret. */
const armTotp = async (email: string): Promise<string> => {
    const login = await signIn(email);
    const bearer = `Bearer ${login.body.token as string}`;
    const setup = await api()
        .post('/account/2fa/methods/totp/setup')
        .set('Authorization', bearer)
        .send();
    const { secret } = setup.body as { secret: string };
    await api()
        .post('/account/2fa/methods/totp/confirm')
        .set('Authorization', bearer)
        .send({ code: await codeFor(secret, 0) });
    return secret;
};

describe('POST /account/login for an account in its deletion grace', () => {
    it('answers a claim check, issues no session and leaves the account locked', async () => {
        const user = await pendingAccount();

        const response = await signIn(user.email);

        expect(response.status).toBe(200);
        expect(response.body).toEqual({
            deletionPending: true,
            challenge: expect.any(String),
            expiresAt: expect.any(String),
            purgeAt: expect.any(String)
        });
        expect(response.get('Set-Cookie')).toBeUndefined();
        expect(await sessionRowsOf(user.id)).toEqual([]);
        const stored = await userRepository.findById(user.id);
        expect(stored?.deletedBy).toBe('owner');
    });

    it('answers a wrong password on a pending account exactly like on any other', async () => {
        const user = await pendingAccount();
        const unknown = await signIn('nobody@example.com', 'wrong-Password1!');

        const wrong = await signIn(user.email, 'wrong-Password1!');

        expect(wrong.status).toBe(401);
        expect(withoutInstance(wrong.body)).toEqual(withoutInstance(unknown.body));
    });

    it('stays a plain 401 for a banned account, and once purgeAt has passed', async () => {
        const banned = await pendingAccount({ email: 'banned@example.com', active: false });
        const late = await pendingAccount({ email: 'late@example.com' });
        await userRepository.updateMany({ _id: late.id }, { $set: { purgeAt: daysFromNow(-1) } });

        const bannedResponse = await signIn(banned.email);
        const lateResponse = await signIn(late.email);

        expect([bannedResponse.status, lateResponse.status]).toEqual([401, 401]);
        expect(withoutInstance(lateResponse.body)).toEqual(withoutInstance(bannedResponse.body));
    });
});

/** Signs a pending account in and returns the claim check. */
const claimCheck = async (email = 'pending@example.com'): Promise<string> => {
    const user = await pendingAccount({ email });
    const response = await signIn(user.email);
    return response.body.challenge as string;
};

describe('POST /account/login/restore', () => {
    it('restores the account and starts the session', async () => {
        const challenge = await claimCheck();

        const response = await api().post('/account/login/restore').send({ challenge });

        expect(response.status).toBe(200);
        const profile = await api()
            .get('/account')
            .set('Authorization', `Bearer ${response.body.token as string}`);
        expect(profile.status).toBe(200);
        const stored = await userRepository.findOne({ email: 'pending@example.com' });
        expect(stored?.deletedAt).toBeUndefined();
        expect(stored?.purgeAt).toBeUndefined();
    });

    it('refuses the same claim check a second time', async () => {
        const challenge = await claimCheck();
        await api().post('/account/login/restore').send({ challenge });

        const again = await api().post('/account/login/restore').send({ challenge });

        expect(again.status).toBe(401);
    });

    it('refuses an unknown claim check, an expired one and a missing one alike', async () => {
        const user = await pendingAccount();
        await plantToken(user.id, DELETION_RESTORE_TOKEN_TYPE, 'stale', {
            ttlMs: -1000,
            amr: ['pwd']
        });

        const unknown = await api().post('/account/login/restore').send({ challenge: 'nope' });
        const expired = await api().post('/account/login/restore').send({ challenge: 'stale' });
        const missing = await api().post('/account/login/restore').send({});

        expect([unknown.status, expired.status, missing.status]).toEqual([401, 401, 401]);
    });

    it('leaves the account locked when the grace ran out after the sign-in', async () => {
        const challenge = await claimCheck('late-restore@example.com');
        await userRepository.updateMany(
            { email: 'late-restore@example.com' },
            { $set: { purgeAt: daysFromNow(-1) } }
        );

        const response = await api().post('/account/login/restore').send({ challenge });

        expect(response.status).toBe(401);
        const stored = await userRepository.findOne({ email: 'late-restore@example.com' });
        expect(stored?.deletedBy).toBe('owner');
    });
});

describe('a pending account with a second factor', () => {
    it('is asked for the code first, and only then offered the restore', async () => {
        const user = await createUser({ email: 'second@example.com', verifiedAt: new Date() });
        const secret = await armTotp(user.email);
        const armed = await userRepository.findById(user.id);
        await userService.scheduleOwnDeletion(
            armed!,
            new Date(Date.now() - 60_000),
            daysFromNow(20)
        );

        const first = await signIn(user.email);
        const second = await api()
            .post('/account/login/2fa')
            .send({ challenge: first.body.challenge, code: await codeFor(secret, 1) });
        const restored = await api()
            .post('/account/login/restore')
            .send({ challenge: second.body.challenge });

        expect(first.body.mfaRequired).toBe(true);
        expect(second.body.deletionPending).toBe(true);
        // Only the spent MFA cookie is cleared; no session cookie exists.
        expect(setCookie(second, '__Host-session')).toBeUndefined();
        expect(restored.status).toBe(200);
        const stored = await userRepository.findById(user.id);
        expect(stored?.deletedAt).toBeUndefined();
    });
});

describe('GET /account/oauth/:provider/callback for an account in its deletion grace', () => {
    it('redirects with the dates, keeps the claim check in a cookie, and restores from it', async () => {
        const user = await pendingAccount({ email: 'oauth-pending@example.com' });
        await userRepository.linkOAuthAccount(user.id, {
            provider: 'fake',
            providerId: 'fake-oauth-subject',
            connectedAt: new Date()
        });
        const start = await api().get('/account/oauth/fake');
        const callbackUrl = new URL(start.headers.location);

        const callback = await api()
            .get(callbackUrl.pathname + callbackUrl.search)
            .set('Cookie', cookieHeader(start, '__Host-oauth_state', '__Host-oauth_verifier'));

        expect(callback.status).toBe(302);
        const location = new URL(callback.headers.location);
        expect(location.searchParams.get('deletionPending')).toBe('1');
        expect(location.searchParams.get('purgeAt')).toEqual(expect.any(String));
        expect(location.searchParams.get('expiresAt')).toEqual(expect.any(String));
        expect(setCookie(callback, '__Host-session')).toBeUndefined();
        expect(setCookie(callback, '__Host-oauth_deletion_challenge')).toBeTruthy();

        const restored = await api()
            .post('/account/login/restore')
            .set('Cookie', cookieHeader(callback, '__Host-oauth_deletion_challenge'))
            .send({});

        expect(restored.status).toBe(200);
        const stored = await userRepository.findById(user.id);
        expect(stored?.deletedAt).toBeUndefined();
    });
});
