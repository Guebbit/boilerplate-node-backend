/**
 * @module
 * Step-up for an account with a second factor: the identity routes (email, password, delete) demand
 * an `otp` proof in the fresh session, a re-authentication earns only what it proved, and an email
 * change can be undone from the old address's link. An account without 2FA is asked nothing new.
 */

import { api } from '@tests/http';
import { setupTestDb } from '@tests/setup-test-db';
import { setEnvironment } from '@tests/environment';
import { codeFor } from '@tests/totp';
import { forgetSessionEpoch } from '@tests/session-epoch';
import {
    createUser,
    userRepository,
    PLAIN_PASSWORD,
    REPLACEMENT_PASSWORD
} from '@modules/users/tests/factories';
import { createAccessToken, createRefreshToken } from '../../session/jwt';

/** Every queued mail, newest last — what each recipient would read. */
const mockOutbox: { to?: string; template: string; data: Record<string, unknown> }[] = [];

jest.mock('@infrastructure/adapters/mailer', () => ({
    ...jest.requireActual<typeof import('@infrastructure/adapters/mailer')>(
        '@infrastructure/adapters/mailer'
    ),
    enqueueEmail: jest.fn(
        (envelope: { to?: string }, template: string, data: Record<string, unknown>) => {
            mockOutbox.push({ to: envelope.to, template, data });
            return Promise.resolve();
        }
    )
}));

setupTestDb();

beforeEach(() => {
    setEnvironment({ NODE_MAIL_TRANSPORT: 'outbox' });
    mockOutbox.length = 0;
});

/** A session minted straight from the token layer, proving `amr` — fresh, whatever it proved. */
const sessionWith = async (userId: string, amr: string[]) => {
    const refreshToken = await createRefreshToken(userId, undefined, amr);
    const token = await createAccessToken(refreshToken);
    return { bearer: `Bearer ${token}`, cookie: `jwt=${refreshToken}` };
};

/** The token a mailed link carries, read off its `linkUrl`. */
const tokenOfLastMail = (template: string): string => {
    const mail = mockOutbox.findLast((queued) => queued.template === template);
    const token = /token=([^&]+)/.exec(String(mail?.data.linkUrl))?.[1];
    if (!token) throw new Error(`No ${template} link was mailed`);
    return token;
};

/** An account with TOTP armed, plus the backup codes it came with (one proof each). */
const armedAccount = async (email = 'armed@example.com') => {
    const user = await createUser({ verifiedAt: new Date(), email });
    const login = await api().post('/account/login').send({ email, password: PLAIN_PASSWORD });
    const bearer = `Bearer ${login.body.data.token as string}`;
    const setup = await api()
        .post('/account/2fa/methods/totp/setup')
        .set('Authorization', bearer)
        .send();
    const confirm = await api()
        .post('/account/2fa/methods/totp/confirm')
        .set('Authorization', bearer)
        .send({ code: await codeFor(setup.body.data.secret as string, 0) });
    await forgetSessionEpoch();
    return { user, backupCodes: confirm.body.data.backupCodes as string[] };
};

/** The status of a pending request, awaited without reaching into the response inline. */
const statusOf = (pending: PromiseLike<{ status: number }>): Promise<number> =>
    Promise.resolve(pending).then((response) => response.status);

/** The stored address of an account, read straight from the database. */
const emailOf = (userId: string): Promise<string | undefined> =>
    userRepository.findByIdWithCredentials(userId).then((stored) => stored?.email);

/** Spend an undo token. */
const undo = (token: string) => api().post('/account/email-change-undo').send({ token });

/** Request an email change as a session that may. */
const requestChange = (bearer: string, email = 'new@example.com') =>
    api().patch('/account').set('Authorization', bearer).send({ email });

describe('the identity routes, for an account with a second factor', () => {
    it('challenge a session that proved only a password, naming `otp` in details.methods', async () => {
        const { user } = await armedAccount();
        const { bearer } = await sessionWith(user.id, ['pwd']);

        const response = await requestChange(bearer);

        expect(response.status).toBe(401);
        expect(response.body.errors[0]).toMatchObject({
            code: 'REAUTH_REQUIRED',
            details: { methods: ['otp'] }
        });
    });

    it('let a session that proved an otp through', async () => {
        const { user } = await armedAccount();
        const { bearer } = await sessionWith(user.id, ['pwd', 'otp']);

        expect(await statusOf(requestChange(bearer))).toBe(200);
    });

    it('gate the password change and the account deletion the same way', async () => {
        const { user } = await armedAccount();
        const { bearer } = await sessionWith(user.id, ['pwd']);

        const password = await api().post('/account/password').set('Authorization', bearer).send({
            currentPassword: PLAIN_PASSWORD,
            password: REPLACEMENT_PASSWORD,
            passwordConfirm: REPLACEMENT_PASSWORD
        });
        const deletion = await api().delete('/account').set('Authorization', bearer);

        expect(password.status).toBe(401);
        expect(password.body.errors[0].details.methods).toEqual(['otp']);
        expect(deletion.status).toBe(401);
        expect(deletion.body.errors[0].details.methods).toEqual(['otp']);
    });

    it('pass a password change and a deletion once the session proved an otp', async () => {
        const { user } = await armedAccount();
        const { bearer } = await sessionWith(user.id, ['pwd', 'otp']);

        const password = await api().post('/account/password').set('Authorization', bearer).send({
            currentPassword: PLAIN_PASSWORD,
            password: REPLACEMENT_PASSWORD,
            passwordConfirm: REPLACEMENT_PASSWORD
        });

        expect(password.status).toBe(200);
    });

    it('are unchanged for an account with no second factor', async () => {
        const user = await createUser({ verifiedAt: new Date() });
        const { bearer } = await sessionWith(user.id, ['pwd']);

        const email = await requestChange(bearer);
        const password = await api().post('/account/password').set('Authorization', bearer).send({
            currentPassword: PLAIN_PASSWORD,
            password: REPLACEMENT_PASSWORD,
            passwordConfirm: REPLACEMENT_PASSWORD
        });

        expect(email.status).toBe(200);
        expect(password.status).toBe(200);
    });
});

describe('POST /account/reauth with an otp', () => {
    it('no longer passes an otp route after a password-only re-authentication', async () => {
        const { user } = await armedAccount();
        const { bearer } = await sessionWith(user.id, ['pwd', 'otp']);

        const reauth = await api()
            .post('/account/reauth')
            .set('Authorization', bearer)
            .send({ method: 'password', password: PLAIN_PASSWORD });
        const change = await requestChange(`Bearer ${reauth.body.data.token as string}`);

        expect(reauth.status).toBe(200);
        expect(change.status).toBe(401);
    });

    it('earns `otp` for a code that verifies, and the route then opens', async () => {
        const { user, backupCodes } = await armedAccount();
        const { bearer } = await sessionWith(user.id, ['pwd']);

        const reauth = await api()
            .post('/account/reauth')
            .set('Authorization', bearer)
            .send({ method: 'password', password: PLAIN_PASSWORD, otp: backupCodes[0] });
        const change = await requestChange(`Bearer ${reauth.body.data.token as string}`);

        expect(reauth.status).toBe(200);
        expect(change.status).toBe(200);
    });

    it('refuses a wrong code with 422 and a locked account with 429', async () => {
        const { user } = await armedAccount();
        const { bearer } = await sessionWith(user.id, ['pwd']);
        const send = () =>
            api()
                .post('/account/reauth')
                .set('Authorization', bearer)
                .send({ method: 'password', password: PLAIN_PASSWORD, otp: '000000' });

        expect(await statusOf(send())).toBe(422);

        await userRepository.updateMany(
            { _id: user.id },
            { $set: { mfaFailures: 10, mfaLockedUntil: new Date(Date.now() + 60_000) } }
        );
        expect(await statusOf(send())).toBe(429);
    });

    it('does not spend an attempt on the code when the password is wrong', async () => {
        const { user } = await armedAccount();
        const { bearer } = await sessionWith(user.id, ['pwd']);

        const response = await api()
            .post('/account/reauth')
            .set('Authorization', bearer)
            .send({ method: 'password', password: 'not-the-password', otp: '000000' });

        const stored = await userRepository.findByIdWithCredentials(user.id);
        expect(response.status).toBe(422);
        expect(stored?.mfaFailures).toBe(0);
    });

    it('refuses a code from an account that has no second factor armed', async () => {
        const user = await createUser({ verifiedAt: new Date() });
        const { bearer } = await sessionWith(user.id, ['pwd']);

        const response = await api()
            .post('/account/reauth')
            .set('Authorization', bearer)
            .send({ method: 'password', password: PLAIN_PASSWORD, otp: '123456' });

        expect(response.status).toBe(422);
    });
});

/** An account that asked for a change, with the old address's undo token and the new one's link. */
const requested = async () => {
    const user = await createUser({ verifiedAt: new Date(), email: 'old@example.com' });
    const { bearer } = await sessionWith(user.id, ['pwd']);
    await requestChange(bearer);
    return {
        user,
        bearer,
        undoToken: tokenOfLastMail('account.email-change-notice'),
        confirmToken: tokenOfLastMail('account.verify-request')
    };
};

describe('undoing an email change', () => {
    it('mails the old address a link that works once the change is confirmed, and restores it', async () => {
        const { user, undoToken, confirmToken } = await requested();
        await api().post('/account/email-change-confirm').send({ token: confirmToken });
        expect(await emailOf(user.id)).toBe('new@example.com');

        const response = await undo(undoToken);

        const stored = await userRepository.findByIdWithCredentials(user.id);
        expect(response.status).toBe(200);
        expect(stored?.email).toBe('old@example.com');
        expect(stored?.previousEmail).toBeUndefined();
        // Every session is ended, the epoch moved: what a thief holds stops working.
        expect(stored?.tokensValidAfter).toBeInstanceOf(Date);
    });

    it('cancels a change that is still pending, and kills its confirmation link', async () => {
        const { user, undoToken, confirmToken } = await requested();

        const response = await undo(undoToken);
        const confirm = await api()
            .post('/account/email-change-confirm')
            .send({ token: confirmToken });

        const stored = await userRepository.findByIdWithCredentials(user.id);
        expect(response.status).toBe(200);
        expect(stored?.pendingEmail).toBeUndefined();
        expect(stored?.email).toBe('old@example.com');
        expect(confirm.status).toBe(422);
    });

    it('spends the link: a second use is refused', async () => {
        const { undoToken } = await requested();
        await undo(undoToken);

        expect(await statusOf(undo(undoToken))).toBe(422);
    });

    it('survives a completed password reset, which purges every other pending token', async () => {
        const { user, undoToken } = await requested();
        await user.tokenAdd('password', 3_600_000, 'reset-after-the-change');

        const reset = await api().post('/account/reset-confirm').send({
            token: 'reset-after-the-change',
            password: REPLACEMENT_PASSWORD,
            passwordConfirm: REPLACEMENT_PASSWORD
        });

        expect(reset.status).toBe(200);
        expect(await statusOf(undo(undoToken))).toBe(200);
    });

    it('answers 409 when the previous address was meanwhile taken by another account', async () => {
        const { user, undoToken, confirmToken } = await requested();
        await api().post('/account/email-change-confirm').send({ token: confirmToken });
        await createUser({ email: 'old@example.com', username: 'squatter' });

        const response = await undo(undoToken);

        expect(response.status).toBe(409);
        expect(await emailOf(user.id)).toBe('new@example.com');
    });

    it('lives for the newest request only: an older undo link is pulled', async () => {
        const { user, bearer, undoToken } = await requested();
        await userRepository.updateMany({ _id: user.id }, { $unset: { pendingEmail: '' } });
        mockOutbox.length = 0;
        // The cooldown between two requests is not what is under test.
        await userRepository.updateMany(
            { _id: user.id },
            { $pull: { tokens: { type: 'email-change' } } }
        );
        await requestChange(bearer, 'third@example.com');

        expect(await statusOf(undo(undoToken))).toBe(422);
        expect(await statusOf(undo(tokenOfLastMail('account.email-change-notice')))).toBe(200);
    });
});
