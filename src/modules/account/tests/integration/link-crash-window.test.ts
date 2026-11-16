/**
 * @module
 * The crash window of a one-time link: the spend of the token and the write it unlocks commit in
 * ONE transaction, so a write that fails leaves the link live and the account as it was, and a
 * retry with the same link succeeds. One case per flow, each failing the flow's own write once.
 *
 * Failing a write AFTER the spend ran (not the spend itself) is what proves the rollback: the
 * token row is back only because the transaction aborted.
 *
 * @see docs/modules/account-sessions.md#spending-a-link
 */

import { MongoServerError } from 'mongodb';
import { api } from '@tests/http';
import { setupTestDb } from '@tests/setup-test-db';
import { setEnvironment } from '@tests/environment';
import { codeFor } from '@tests/totp';
import { cookieHeader } from '@tests/cookies';
import { forgetSessionEpoch } from '@tests/session-epoch';
import { testCallerContext } from '@tests/callers';
import { outboxEventModel, settleOutboxNudges } from '@kernel/outbox';
import {
    createUser,
    userRepository,
    PLAIN_PASSWORD,
    REPLACEMENT_PASSWORD
} from '@modules/users/tests/factories';
import { verificationTokenRepository } from '../../repository';
import { buildLoginChallenge } from '../../services/two-factor-challenge';
import {
    linkProviderToSignedInAccount,
    OAuthIdentityTakenError,
    startOAuthLink
} from '../../services/oauth';
import { plantToken, sessionRowsOf, tokenTypesOf } from '../factories';

setupTestDb();

beforeEach(() => {
    setEnvironment({ NODE_MAIL_TRANSPORT: 'outbox' });
});

afterEach(() => {
    jest.restoreAllMocks();
});

/** The failure a dropped connection looks like: no driver label, so nothing retries it. */
const connectionReset = (): Error =>
    Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' });

/** A failure the driver itself recognises as safe to run the whole transaction again for. */
const transientFailure = (): MongoServerError =>
    new MongoServerError({
        message: 'connection reset, transaction aborted',
        errorLabels: ['TransientTransactionError']
    });

/** The tokens of one kind an account still holds. */
const holds = (userId: string, type: string): Promise<boolean> =>
    tokenTypesOf(userId).then((types) => types.includes(type));

/** One field of the stored account, credentials included. */
const storedField = <
    TKey extends 'verifiedAt' | 'deletedBy' | 'password' | 'email' | 'oauthAccounts'
>(
    userId: string,
    key: TKey
) => userRepository.findByIdWithCredentials(userId).then((account) => account?.[key]);

/** The three address fields, as plain values a matcher can compare. */
const addressesOf = (userId: string) =>
    userRepository.findByIdWithCredentials(userId).then((account) => ({
        email: account?.email,
        previousEmail: account?.previousEmail,
        pendingEmail: account?.pendingEmail
    }));

/** An account with `after@example.com` pending and its confirmation link planted. */
const pendingChange = async () => {
    const user = await createUser({ email: 'before@example.com', verifiedAt: new Date() });
    await userRepository.updateMany(
        { _id: user.id },
        { $set: { pendingEmail: 'after@example.com' } }
    );
    await plantToken(user.id, 'email-change', 'confirm-me');
    return user;
};

/** An account moved away from `old@example.com`, with its undo link live. */
const changedAccount = async () => {
    const user = await createUser({ verifiedAt: new Date(), email: 'new@example.com' });
    await userRepository.updateMany(
        { _id: user.id },
        { $set: { previousEmail: 'old@example.com' } }
    );
    await plantToken(user.id, 'email-change-undo', 'undo-me');
    return user;
};

/** A locked account whose grace is still running. */
const lockedAccount = async (email: string) => {
    const user = await createUser({ email, verifiedAt: new Date() });
    await userRepository.updateMany(
        { _id: user.id },
        {
            $set: {
                deletedAt: new Date(Date.now() - 60_000),
                deletedBy: 'owner',
                purgeAt: new Date(Date.now() + 5 * 86_400_000)
            }
        }
    );
    return user;
};

/** An account with TOTP armed, and the backup codes confirming it handed out. */
const armedAccount = async () => {
    const user = await createUser({ verifiedAt: new Date(), email: 'mfa@example.com' });
    const login = await api()
        .post('/account/login')
        .send({ email: user.email, password: PLAIN_PASSWORD });
    const bearer = `Bearer ${login.body.token as string}`;
    const setup = await api()
        .post('/account/2fa/methods/totp/setup')
        .set('Authorization', bearer)
        .send();
    const confirm = await api()
        .post('/account/2fa/methods/totp/confirm')
        .set('Authorization', bearer)
        .send({ code: await codeFor((setup.body as { secret: string }).secret, 0) });
    await forgetSessionEpoch(bearer);
    return { user, backupCodes: (confirm.body as { backupCodes: string[] }).backupCodes };
};

describe('email verification link', () => {
    it('stays live when the write fails, and works on retry', async () => {
        const user = await createUser({ email: 'verify@example.com' });
        await plantToken(user.id, 'verify', 'verify-me');
        jest.spyOn(userRepository, 'save').mockRejectedValueOnce(connectionReset());

        const failed = await api()
            .post('/account/email-verification/confirm')
            .send({ token: 'verify-me' });

        expect(failed.status).toBeGreaterThanOrEqual(500);
        expect(await holds(user.id, 'verify')).toBe(true);
        expect(await storedField(user.id, 'verifiedAt')).toBeFalsy();

        const retried = await api()
            .post('/account/email-verification/confirm')
            .send({ token: 'verify-me' });

        expect(retried.status).toBe(204);
        expect(await holds(user.id, 'verify')).toBe(false);
        expect(await storedField(user.id, 'verifiedAt')).toBeInstanceOf(Date);
    });
});

describe('email change confirmation link', () => {
    it('stays live when the write fails, and works on retry', async () => {
        const user = await pendingChange();
        jest.spyOn(userRepository, 'save').mockRejectedValueOnce(connectionReset());

        const failed = await api()
            .post('/account/email-change/confirm')
            .send({ token: 'confirm-me' });

        expect(failed.status).toBeGreaterThanOrEqual(500);
        expect(await holds(user.id, 'email-change')).toBe(true);
        expect(await addressesOf(user.id)).toMatchObject({
            email: 'before@example.com',
            pendingEmail: 'after@example.com'
        });

        const retried = await api()
            .post('/account/email-change/confirm')
            .send({ token: 'confirm-me' });

        expect(retried.status).toBe(204);
        expect(await addressesOf(user.id)).toMatchObject({ email: 'after@example.com' });
    });

    it('runs the whole transaction again on a transient error, keeping the undo address', async () => {
        const user = await pendingChange();
        jest.spyOn(userRepository, 'save').mockRejectedValueOnce(transientFailure());

        const response = await api()
            .post('/account/email-change/confirm')
            .send({ token: 'confirm-me' });
        await settleOutboxNudges();

        expect(response.status).toBe(204);
        // The second attempt starts from a document the first one already edited.
        expect(await addressesOf(user.id)).toMatchObject({
            email: 'after@example.com',
            previousEmail: 'before@example.com'
        });
        expect(await holds(user.id, 'email-change')).toBe(false);
        expect(await outboxEventModel.countDocuments({ name: 'user.profile_changed' })).toBe(1);
    });
});

describe('email change confirmation link, a later write failing', () => {
    it('leaves the address as it was when the announcing outbox row cannot be written', async () => {
        const user = await pendingChange();
        jest.spyOn(outboxEventModel, 'create').mockRejectedValueOnce(connectionReset());

        const failed = await api()
            .post('/account/email-change/confirm')
            .send({ token: 'confirm-me' });

        expect(failed.status).toBeGreaterThanOrEqual(500);
        expect(await addressesOf(user.id)).toMatchObject({
            email: 'before@example.com',
            pendingEmail: 'after@example.com'
        });
        expect(await holds(user.id, 'email-change')).toBe(true);
    });
});

describe('email change undo link', () => {
    it('stays live when the write fails, and works on retry', async () => {
        const user = await changedAccount();
        jest.spyOn(userRepository, 'save').mockRejectedValueOnce(connectionReset());

        const failed = await api().post('/account/email-change/undo').send({ token: 'undo-me' });

        expect(failed.status).toBeGreaterThanOrEqual(500);
        expect(await holds(user.id, 'email-change-undo')).toBe(true);
        expect(await storedField(user.id, 'email')).toBe('new@example.com');

        const retried = await api().post('/account/email-change/undo').send({ token: 'undo-me' });

        expect(retried.status).toBe(204);
        expect(await storedField(user.id, 'email')).toBe('old@example.com');
    });

    it('leaves the link live and every session ended when the old address was taken (409)', async () => {
        const user = await changedAccount();
        const taker = await createUser({
            verifiedAt: new Date(),
            email: 'old@example.com',
            username: 'taker'
        });
        const login = await api()
            .post('/account/login')
            .send({ email: user.email, password: PLAIN_PASSWORD });
        const cookie = cookieHeader(login, '__Host-session');

        const refused = await api().post('/account/email-change/undo').send({ token: 'undo-me' });

        expect(refused.status).toBe(409);
        expect(await holds(user.id, 'email-change-undo')).toBe(true);
        expect(await sessionRowsOf(user.id)).toEqual([]);
        const refresh = await api().post('/account/refresh').set('Cookie', cookie);
        expect(refresh.status).toBe(401);
        expect(await storedField(user.id, 'email')).toBe('new@example.com');

        // The owner frees the address and follows the same link again.
        await userRepository.updateMany(
            { _id: taker.id },
            { $set: { email: 'elsewhere@example.com' } }
        );
        const retried = await api().post('/account/email-change/undo').send({ token: 'undo-me' });

        expect(retried.status).toBe(204);
        expect(await storedField(user.id, 'email')).toBe('old@example.com');
    });
});

describe('email change undo link racing a confirmation', () => {
    it('restores the old address when the change was confirmed after the link was found', async () => {
        const user = await createUser({ email: 'before@example.com', verifiedAt: new Date() });
        await userRepository.updateMany(
            { _id: user.id },
            { $set: { pendingEmail: 'after@example.com' } }
        );
        await plantToken(user.id, 'email-change-undo', 'undo-me');
        // The thief confirms between the undo's lookup (still pending) and its transaction.
        const { spend } = verificationTokenRepository;
        jest.spyOn(verificationTokenRepository, 'spend').mockImplementationOnce((...args) =>
            userRepository
                .updateMany(
                    { _id: user.id },
                    {
                        $set: { email: 'after@example.com', previousEmail: 'before@example.com' },
                        $unset: { pendingEmail: '' }
                    }
                )
                .then(() => spend(...args))
        );

        const response = await api().post('/account/email-change/undo').send({ token: 'undo-me' });

        expect(response.status).toBe(204);
        expect(await addressesOf(user.id)).toMatchObject({ email: 'before@example.com' });
    });
});

describe('account restore link', () => {
    it('stays live when the write fails, and works on retry', async () => {
        const user = await lockedAccount('locked@example.com');
        await plantToken(user.id, 'account-restore', 'restore-me');
        jest.spyOn(userRepository, 'restoreScheduledDeletion').mockRejectedValueOnce(
            connectionReset()
        );

        const failed = await api().post('/account/restore').send({ token: 'restore-me' });

        expect(failed.status).toBeGreaterThanOrEqual(500);
        expect(await holds(user.id, 'account-restore')).toBe(true);
        expect(await storedField(user.id, 'deletedBy')).toBe('owner');

        const retried = await api().post('/account/restore').send({ token: 'restore-me' });

        expect(retried.status).toBe(204);
        expect(await storedField(user.id, 'deletedBy')).toBeUndefined();
    });

    it('refuses and burns the link once the grace ran out', async () => {
        const user = await lockedAccount('locked@example.com');
        await userRepository.updateMany(
            { _id: user.id },
            { $set: { purgeAt: new Date(Date.now() - 1000) } }
        );
        await plantToken(user.id, 'account-restore', 'restore-late');

        const response = await api().post('/account/restore').send({ token: 'restore-late' });

        expect(response.status).toBe(422);
        expect(await holds(user.id, 'account-restore')).toBe(false);
        expect(await storedField(user.id, 'deletedBy')).toBe('owner');
    });
});

describe('sign-in restore claim check', () => {
    it('stays live when the write fails, and works on retry', async () => {
        const user = await lockedAccount('claim@example.com');
        await plantToken(user.id, 'deletion-restore', 'claim-me', { amr: ['pwd'] });
        jest.spyOn(userRepository, 'restoreScheduledDeletion').mockRejectedValueOnce(
            connectionReset()
        );

        const failed = await api().post('/account/login/restore').send({ challenge: 'claim-me' });

        expect(failed.status).toBeGreaterThanOrEqual(500);
        expect(await holds(user.id, 'deletion-restore')).toBe(true);
        expect(await storedField(user.id, 'deletedBy')).toBe('owner');

        const retried = await api().post('/account/login/restore').send({ challenge: 'claim-me' });

        expect(retried.status).toBe(200);
        expect(await storedField(user.id, 'deletedBy')).toBeUndefined();
    });
});

describe('OAuth connect link', () => {
    const identity = { providerId: 'subject-1', email: 'oauth@example.com', emailVerified: true };

    it('stays live when the write fails, and works on retry', async () => {
        const user = await createUser({ email: 'oauth@example.com', verifiedAt: new Date() });
        const link = await startOAuthLink(user.id);
        jest.spyOn(userRepository, 'linkOAuthAccount').mockRejectedValueOnce(connectionReset());

        await expect(
            linkProviderToSignedInAccount(link, user.id, 'google', identity, testCallerContext)
        ).rejects.toThrow('ECONNRESET');

        expect(await holds(user.id, 'oauth-link')).toBe(true);
        expect((await storedField(user.id, 'oauthAccounts')) ?? []).toEqual([]);

        await linkProviderToSignedInAccount(link, user.id, 'google', identity, testCallerContext);

        expect(await holds(user.id, 'oauth-link')).toBe(false);
        expect(await storedField(user.id, 'oauthAccounts')).toHaveLength(1);
    });

    it('answers already-linked when another account takes the identity during the write', async () => {
        const user = await createUser({ email: 'oauth@example.com', verifiedAt: new Date() });
        const other = await createUser({
            email: 'other@example.com',
            username: 'other',
            verifiedAt: new Date()
        });
        const link = await startOAuthLink(user.id);
        // The other account links the same identity after this attempt's ownership check.
        const linkAccount = userRepository.linkOAuthAccount;
        jest.spyOn(userRepository, 'linkOAuthAccount').mockImplementationOnce((...args) =>
            linkAccount(other.id, {
                provider: 'google',
                providerId: identity.providerId,
                connectedAt: new Date()
            }).then(() => linkAccount(...args))
        );

        await expect(
            linkProviderToSignedInAccount(link, user.id, 'google', identity, testCallerContext)
        ).rejects.toBeInstanceOf(OAuthIdentityTakenError);

        expect(await holds(user.id, 'oauth-link')).toBe(true);
    });

    it('does not burn the link for an attempt it refuses', async () => {
        const user = await createUser({ email: 'oauth@example.com', verifiedAt: new Date() });
        const link = await startOAuthLink(user.id);

        // A browser signed in as someone else: refused as expired, before any spend.
        await expect(
            linkProviderToSignedInAccount(
                link,
                'someone-else',
                'google',
                identity,
                testCallerContext
            )
        ).rejects.toThrow();

        expect(await holds(user.id, 'oauth-link')).toBe(true);
    });
});

describe('password reset link', () => {
    it('stays live when the write fails, and works on retry', async () => {
        const user = await createUser({ email: 'reset@example.com' });
        const before = await storedField(user.id, 'password');
        await plantToken(user.id, 'password', 'reset-me');
        const body = {
            token: 'reset-me',
            password: REPLACEMENT_PASSWORD,
            passwordConfirm: REPLACEMENT_PASSWORD,
            termsAccepted: true
        };
        jest.spyOn(userRepository, 'save').mockRejectedValueOnce(connectionReset());

        const failed = await api().post('/account/password/reset/confirm').send(body);

        expect(failed.status).toBeGreaterThanOrEqual(500);
        expect(await holds(user.id, 'password')).toBe(true);
        expect(await storedField(user.id, 'password')).toBe(before);

        const retried = await api().post('/account/password/reset/confirm').send(body);

        expect(retried.status).toBe(204);
        expect(await holds(user.id, 'password')).toBe(false);
        expect(await storedField(user.id, 'password')).not.toBe(before);
    });

    it('rolls the new password back when a LATER write of the same action fails', async () => {
        const user = await createUser({ email: 'reset@example.com' });
        const before = await storedField(user.id, 'password');
        await plantToken(user.id, 'password', 'reset-me');
        jest.spyOn(userRepository, 'bumpSessionEpoch').mockRejectedValueOnce(connectionReset());

        const failed = await api().post('/account/password/reset/confirm').send({
            token: 'reset-me',
            password: REPLACEMENT_PASSWORD,
            passwordConfirm: REPLACEMENT_PASSWORD,
            termsAccepted: true
        });

        expect(failed.status).toBeGreaterThanOrEqual(500);
        expect(await storedField(user.id, 'password')).toBe(before);
        expect(await holds(user.id, 'password')).toBe(true);
        const login = await api()
            .post('/account/login')
            .send({ email: user.email, password: PLAIN_PASSWORD });
        expect(login.status).toBe(200);
    });
});

describe('second-factor login challenge', () => {
    it('a failed spend leaves the challenge usable', async () => {
        const { user, backupCodes } = await armedAccount();
        const loaded = await userRepository.findByIdWithCredentials(user.id);
        const { challenge } = await buildLoginChallenge(loaded!, ['pwd']);
        jest.spyOn(verificationTokenRepository, 'spend').mockRejectedValueOnce(connectionReset());

        const failed = await api()
            .post('/account/login/2fa')
            .send({ challenge, code: backupCodes[0] });

        expect(failed.status).toBeGreaterThanOrEqual(500);
        expect(await holds(user.id, 'mfa-challenge')).toBe(true);

        // The first code was consumed by its own atomic write; the challenge is what survives.
        const retried = await api()
            .post('/account/login/2fa')
            .send({ challenge, code: backupCodes[1] });

        expect(retried.status).toBe(200);
        expect(await holds(user.id, 'mfa-challenge')).toBe(false);
    });
});
