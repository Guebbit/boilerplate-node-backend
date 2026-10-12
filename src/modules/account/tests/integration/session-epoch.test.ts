/**
 * @module
 * The session epoch (`tokensValidAfter`): a token minted before it is refused, access and refresh
 * alike, and each "I may be compromised" event moves it. Real clock throughout: the claim and the
 * epoch both compare in whole seconds, so a case that needs "before the bump" waits one.
 */

import { api } from '@tests/http';
import { setupTestDb } from '@tests/setup-test-db';
import { setEnvironment } from '@tests/environment';
import { codeFor } from '@tests/totp';
import { cookieHeader } from '@tests/cookies';
import { userService } from '@modules/users';
import { outboxEventModel, settleOutboxNudges } from '@kernel/outbox';
import {
    createUser,
    userRepository,
    PLAIN_PASSWORD,
    REPLACEMENT_PASSWORD
} from '@modules/users/tests/factories';
import { plantToken, sessionRowsOf, tokenRowsOf } from '../factories';

setupTestDb();

beforeEach(() => {
    setEnvironment({ NODE_MAIL_TRANSPORT: 'outbox' });
});

/** One second and a little: enough for every `auth_time` already minted to fall before an epoch set now. */
const PAST_THE_SECOND_MS = 1100;

/** Sleeps, so the next token is stamped in a later whole second than the last one. */
const nextSecond = (): Promise<void> =>
    new Promise((resolve) => {
        setTimeout(resolve, PAST_THE_SECOND_MS);
    });

/** A login: the access token, and the refresh cookie as a `Cookie` header. */
const loginAs = async (email: string) => {
    const response = await api().post('/account/login').send({ email, password: PLAIN_PASSWORD });
    return {
        bearer: `Bearer ${response.body.data.token as string}`,
        cookie: cookieHeader(response, '__Host-jwt')
    };
};

/** `GET /account` with a bearer: 200 while the token is live, 401 once it is not. */
const statusWith = (bearer: string): Promise<number> =>
    api()
        .get('/account')
        .set('Authorization', bearer)
        .then((response) => response.status);

describe('a token minted before the epoch', () => {
    it('is refused as an access token', async () => {
        const user = await createUser({ verifiedAt: new Date() });
        const { bearer } = await loginAs(user.email);
        expect(await statusWith(bearer)).toBe(200);

        await userService.bumpSessionEpoch(user.id, new Date(Date.now() + PAST_THE_SECOND_MS));

        expect(await statusWith(bearer)).toBe(401);
    });

    it('is refused at /refresh too, even though the refresh token is still stored', async () => {
        const user = await createUser({ verifiedAt: new Date() });
        const { cookie } = await loginAs(user.email);

        await userService.bumpSessionEpoch(user.id, new Date(Date.now() + PAST_THE_SECOND_MS));

        const refresh = await api().post('/account/refresh').set('Cookie', cookie);
        expect(refresh.status).toBe(401);
    });

    it('is not undone by an older bump arriving late', async () => {
        const user = await createUser({ verifiedAt: new Date() });
        const later = new Date(Date.now() + 60_000);

        await userService.bumpSessionEpoch(user.id, later);
        await userService.bumpSessionEpoch(user.id, new Date());

        const stored = await userRepository.findByIdWithCredentials(user.id);
        expect(stored?.tokensValidAfter).toEqual(later);
    });
});

describe('the events that move the epoch', () => {
    it('a password change keeps the caller working and kills every other device', async () => {
        const user = await createUser({ verifiedAt: new Date() });
        const other = await loginAs(user.email);
        const caller = await loginAs(user.email);
        await nextSecond();

        const change = await api()
            .post('/account/password')
            .set('Authorization', caller.bearer)
            .set('Cookie', caller.cookie)
            .send({
                currentPassword: PLAIN_PASSWORD,
                password: REPLACEMENT_PASSWORD,
                passwordConfirm: REPLACEMENT_PASSWORD
            });

        expect(change.status).toBe(200);
        expect(await statusWith(other.bearer)).toBe(401);
        // The caller's own old access token died with the epoch; the re-minted session works.
        expect(await statusWith(caller.bearer)).toBe(401);
        expect(await statusWith(`Bearer ${change.body.data.token as string}`)).toBe(200);
        const refresh = await api()
            .post('/account/refresh')
            .set('Cookie', cookieHeader(change, '__Host-jwt'));
        expect(refresh.status).toBe(200);
    });

    it('logout-all signs the caller out too, with no re-mint', async () => {
        const user = await createUser({ verifiedAt: new Date() });
        const caller = await loginAs(user.email);
        await nextSecond();

        const response = await api()
            .post('/account/logout-all')
            .set('Authorization', caller.bearer)
            .set('Cookie', caller.cookie);

        expect(response.status).toBe(200);
        expect(await statusWith(caller.bearer)).toBe(401);
        expect(response.headers['set-cookie']).toEqual(
            expect.arrayContaining([expect.stringMatching(/^__Host-jwt=;/)])
        );
    });

    it('a plain logout leaves the other devices alone', async () => {
        const user = await createUser({ verifiedAt: new Date() });
        const other = await loginAs(user.email);
        const caller = await loginAs(user.email);
        await nextSecond();

        await api()
            .post('/account/logout')
            .set('Authorization', caller.bearer)
            .set('Cookie', caller.cookie);

        expect(await statusWith(other.bearer)).toBe(200);
        const stored = await userRepository.findByIdWithCredentials(user.id);
        expect(stored?.tokensValidAfter).toBeUndefined();
    });

    it('arming a 2FA factor kills the other sessions, and the actor re-mints its refresh cookie', async () => {
        const user = await createUser({ verifiedAt: new Date() });
        const other = await loginAs(user.email);
        const caller = await loginAs(user.email);
        const setup = await api()
            .post('/account/2fa/methods/totp/setup')
            .set('Authorization', caller.bearer)
            .send();
        await nextSecond();

        const confirm = await api()
            .post('/account/2fa/methods/totp/confirm')
            .set('Authorization', caller.bearer)
            .send({ code: await codeFor(setup.body.data.secret as string, 0) });

        expect(confirm.status).toBe(200);
        expect(await statusWith(other.bearer)).toBe(401);
        const refresh = await api()
            .post('/account/refresh')
            .set('Cookie', cookieHeader(confirm, '__Host-jwt'));
        expect(refresh.status).toBe(200);
        // The other device's refresh token is gone, not just its access token.
        const stale = await api().post('/account/refresh').set('Cookie', other.cookie);
        expect(stale.status).toBe(401);
    });

    it('a completed password reset purges pending one-time tokens and challenges, not just sessions', async () => {
        const user = await createUser({ verifiedAt: new Date() });
        for (const type of [
            'password',
            'verify',
            'email-change',
            'delete',
            'mfa-challenge'
        ] as const)
            await plantToken(user.id, type, `pending-${type}`, { ttlMs: 3_600_000 });

        const response = await api().post('/account/reset-confirm').send({
            token: 'pending-password',
            password: REPLACEMENT_PASSWORD,
            passwordConfirm: REPLACEMENT_PASSWORD
        });

        expect(response.status).toBe(200);
        const stored = await userRepository.findByIdWithCredentials(user.id);
        expect(await tokenRowsOf(user.id)).toEqual([]);
        expect(await sessionRowsOf(user.id)).toEqual([]);
        expect(stored?.tokensValidAfter).toBeInstanceOf(Date);
    });

    it('re-authenticating retires the refresh token it was given', async () => {
        const user = await createUser({ verifiedAt: new Date() });
        const caller = await loginAs(user.email);

        const response = await api()
            .post('/account/reauth')
            .set('Authorization', caller.bearer)
            .set('Cookie', caller.cookie)
            .send({ method: 'password', password: PLAIN_PASSWORD });

        expect(response.status).toBe(200);
        expect(await sessionRowsOf(user.id)).toHaveLength(1);
        // The old cookie no longer refreshes; the new one does.
        const stale = await api().post('/account/refresh').set('Cookie', caller.cookie);
        expect(stale.status).toBe(401);
    });
});

/** An account whose address was changed away from `old@example.com`, with the undo link live. */
const changedAccount = async () => {
    const user = await createUser({ verifiedAt: new Date(), email: 'new@example.com' });
    await userRepository.updateMany(
        { _id: user.id },
        { $set: { previousEmail: 'old@example.com' } }
    );
    await plantToken(user.id, 'email-change-undo', 'undo-me', { ttlMs: 3_600_000 });
    return user;
};

describe('"this wasn\'t me" ends the sessions before it touches the address', () => {
    it('refuses every old token even when the old address was taken meanwhile (409)', async () => {
        const user = await changedAccount();
        await createUser({ verifiedAt: new Date(), email: 'old@example.com', username: 'taker' });
        const thief = await loginAs(user.email);
        await nextSecond();

        const response = await api().post('/account/email-change-undo').send({ token: 'undo-me' });

        expect(response.status).toBe(409);
        expect(await statusWith(thief.bearer)).toBe(401);
        const refresh = await api().post('/account/refresh').set('Cookie', thief.cookie);
        expect(refresh.status).toBe(401);
    });

    it('announces the revoke with its own reason, even when the restore fails', async () => {
        const user = await changedAccount();
        await createUser({ verifiedAt: new Date(), email: 'old@example.com', username: 'taker' });

        await api().post('/account/email-change-undo').send({ token: 'undo-me' });
        await settleOutboxNudges();

        const rows = await outboxEventModel.find({ name: 'account.sessions-revoked' }).lean();
        expect(rows.map((row) => row.payload)).toEqual([
            { userId: user.id, reason: 'email-change-undo' }
        ]);
    });
});

describe('a credential change moves the epoch in its own write', () => {
    // The bump is made to fail: only a change that no longer depends on it can still end the sessions.
    beforeEach(() => {
        jest.spyOn(userService, 'bumpSessionEpoch').mockRejectedValue(new Error('bump failed'));
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('email-change confirm', async () => {
        const user = await createUser({ verifiedAt: new Date() });
        const other = await loginAs(user.email);
        await userRepository.updateMany(
            { _id: user.id },
            { $set: { pendingEmail: 'confirmed@example.com' } }
        );
        await plantToken(user.id, 'email-change', 'confirm-me', { ttlMs: 3_600_000 });
        await nextSecond();

        const response = await api()
            .post('/account/email-change-confirm')
            .send({ token: 'confirm-me' });

        expect(response.status).toBe(200);
        expect(await statusWith(other.bearer)).toBe(401);
    });

    it('2FA confirm', async () => {
        const user = await createUser({ verifiedAt: new Date() });
        const other = await loginAs(user.email);
        const caller = await loginAs(user.email);
        const setup = await api()
            .post('/account/2fa/methods/totp/setup')
            .set('Authorization', caller.bearer)
            .send();
        await nextSecond();

        const confirm = await api()
            .post('/account/2fa/methods/totp/confirm')
            .set('Authorization', caller.bearer)
            .send({ code: await codeFor(setup.body.data.secret as string, 0) });

        expect(confirm.status).toBe(200);
        expect(await statusWith(other.bearer)).toBe(401);
    });
});
