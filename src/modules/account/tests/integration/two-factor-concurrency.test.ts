/**
 * @module
 * Two-factor one-time spends under parallel requests, over the real app: each secret that can be
 * used once is used once, and each counter counts every miss. Every assertion holds under EVERY
 * interleaving — a test that passes only when one request happens to win proves nothing.
 */

import { api } from '@tests/http';
import { setupTestDb } from '@tests/setup-test-db';
import { setEnvironment } from '@tests/environment';
import { codeFor } from '@tests/totp';
import { forgetSessionEpoch } from '@tests/session-epoch';
import { createUser, PLAIN_PASSWORD, userRepository } from '@modules/users/tests/factories';
import { twoFactorService } from '@modules/account/services';
import { DELIVERED_CODE_MAX_ATTEMPTS, hashBackupCode } from '@modules/account/two-factor';
import { createAccessToken, startSession } from '@modules/account/session/jwt';
import { testCallerContext } from '@tests/callers';
import { versionOf } from '@infrastructure/persistence/versioning';

/**
 * Every mail the app queued, newest last — the only place a delivered code exists in the clear.
 * Named `mock*` because `jest.mock` is hoisted and may only close over that prefix.
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

// A mailed code is offered only where mail reaches a person; `enqueueEmail` is mocked, so nothing is sent.
beforeEach(() => {
    setEnvironment({ NODE_MAIL_TRANSPORT: 'outbox' });
    mockOutbox.length = 0;
});

/** The digits of the newest mail of one template. */
const mailedCode = (template: string): string => {
    const mail = mockOutbox.findLast((queued) => queued.template === template);
    if (!mail) throw new Error(`No ${template} mail was queued`);
    return String(mail.data.code);
};

/** Both a wrong code and an unused one, as the confirm route reads them. */
const confirmEmail = (bearer: string, code: string) =>
    api().post('/account/2fa/methods/email/confirm').set('Authorization', bearer).send({ code });

/** A signed-in account with a verified address, which the email factor requires. */
const signedIn = async () => {
    const user = await createUser({ verifiedAt: new Date(), email: 'ada@example.com' });
    const login = await api()
        .post('/account/login')
        .send({ email: user.email, password: PLAIN_PASSWORD });

    return { user, bearer: `Bearer ${login.body.data.token as string}` as const };
};

/** A signed-in account with the TOTP factor armed, and the codes `confirm` handed out. */
const armedAccount = async () => {
    const { user, bearer } = await signedIn();

    const setup = await api()
        .post('/account/2fa/methods/totp/setup')
        .set('Authorization', bearer)
        .send();
    const { secret } = setup.body.data as { secret: string };
    const confirm = await api()
        .post('/account/2fa/methods/totp/confirm')
        .set('Authorization', bearer)
        .send({ code: await codeFor(secret, 0) });
    await forgetSessionEpoch();

    return { user, bearer, backupCodes: confirm.body.data.backupCodes as string[] };
};

/** A fresh login challenge, minted at the service level — one per racing request. */
const challengeFor = (userId: string): Promise<string> =>
    userRepository
        .findByIdWithCredentials(userId)
        .then((user) => twoFactorService.buildLoginChallenge(user!, ['pwd']))
        .then(({ challenge }) => challenge);

/** `POST /account/login/2fa` with a backup code, on its own fresh challenge. */
const loginWith = async (userId: string, code: string) =>
    api()
        .post('/account/login/2fa')
        .send({ challenge: await challengeFor(userId), code });

/** The stored backup-code digests, read fresh. */
const storedCodes = (userId: string): Promise<string[]> =>
    userRepository.findByIdWithCredentials(userId).then((user) => [...user!.twoFactorBackupCodes]);

describe('a backup code, spent in parallel', () => {
    it('works once when the same code arrives twice', async () => {
        const { user, backupCodes } = await armedAccount();

        const responses = await Promise.all([
            loginWith(user.id, backupCodes[0]),
            loginWith(user.id, backupCodes[0])
        ]);

        expect(responses.filter(({ status }) => status === 200)).toHaveLength(1);
        expect(await storedCodes(user.id)).toHaveLength(9);
    });

    it('spends two different codes, and neither comes back to life', async () => {
        const { user, backupCodes } = await armedAccount();

        const responses = await Promise.all([
            loginWith(user.id, backupCodes[0]),
            loginWith(user.id, backupCodes[1])
        ]);

        expect(responses.map(({ status }) => status)).toEqual([200, 200]);
        expect(await storedCodes(user.id)).toHaveLength(8);
    });

    it('leaves exactly the regenerated set when a login races a regeneration', async () => {
        const { user, bearer, backupCodes } = await armedAccount();

        const [, regenerate] = await Promise.all([
            loginWith(user.id, backupCodes[0]),
            api()
                .post('/account/2fa/backup-codes')
                .set('Authorization', bearer)
                .send({ code: backupCodes[1] })
        ]);

        const fresh = regenerate.body.data.backupCodes as string[];
        const after = await userRepository.findByIdWithCredentials(user.id);
        expect(after!.twoFactorBackupCodes).toEqual(
            fresh.map((code) => hashBackupCode(code, after!.twoFactorBackupCodeSalt!))
        );
    });
});

describe('a mailed 2FA code, in parallel', () => {
    it('works once when the same code arrives twice', async () => {
        const { user, bearer } = await signedIn();
        await api().post('/account/2fa/methods/email/setup').set('Authorization', bearer).send({});
        await confirmEmail(bearer, mailedCode('account.two-factor-code'));
        await forgetSessionEpoch();
        mockOutbox.length = 0;

        await twoFactorService.sendLoginCode(
            await challengeFor(user.id),
            'email',
            testCallerContext
        );
        const code = mailedCode('account.two-factor-code');
        const responses = await Promise.all([loginWith(user.id, code), loginWith(user.id, code)]);

        expect(responses.filter(({ status }) => status === 200)).toHaveLength(1);
    });

    it('counts every wrong guess, so the ceiling holds however they interleave', async () => {
        const { bearer } = await signedIn();
        await api().post('/account/2fa/methods/email/setup').set('Authorization', bearer).send({});
        const code = mailedCode('account.two-factor-code');

        await Promise.all(
            Array.from({ length: DELIVERED_CODE_MAX_ATTEMPTS + 3 }, () =>
                confirmEmail(bearer, '000000')
            )
        );
        const right = await confirmEmail(bearer, code);
        await forgetSessionEpoch();

        expect(right.status).toBe(422);
    });
});

/** An account with no password and a verified address, signed in the way an OAuth login leaves it. */
const oauthOnlySession = async () => {
    const user = await userRepository.create({
        username: 'oauthonly',
        email: 'oauth@example.com',
        verifiedAt: new Date()
    });
    const token = await startSession(user.id, ['google']).then(createAccessToken);
    return { user, bearer: `Bearer ${token}` as const };
};

/** `POST /account/reauth` with the mailed step-up code. */
const reauthWith = (bearer: string, code: string) =>
    api().post('/account/reauth').set('Authorization', bearer).send({ method: 'email', code });

describe('a step-up code, in parallel', () => {
    it('works once when the same code arrives twice', async () => {
        const { bearer } = await oauthOnlySession();
        await api().post('/account/reauth/methods/email/send').set('Authorization', bearer).send();
        const code = mailedCode('account.reauth-code');

        const responses = await Promise.all([reauthWith(bearer, code), reauthWith(bearer, code)]);

        expect(responses.filter(({ status }) => status === 200)).toHaveLength(1);
    });

    it('counts every wrong guess, so the ceiling holds however they interleave', async () => {
        const { bearer } = await oauthOnlySession();
        await api().post('/account/reauth/methods/email/send').set('Authorization', bearer).send();
        const code = mailedCode('account.reauth-code');

        await Promise.all(
            Array.from({ length: DELIVERED_CODE_MAX_ATTEMPTS + 3 }, () =>
                reauthWith(bearer, '000000')
            )
        );

        const right = await reauthWith(bearer, code);

        expect(right.status).toBe(422);
    });

    it('does not move the account version when a code is sent or spent', async () => {
        const { user, bearer } = await oauthOnlySession();
        const before = versionOf(await userRepository.findById(user.id));

        await api().post('/account/reauth/methods/email/send').set('Authorization', bearer).send();
        await reauthWith(bearer, mailedCode('account.reauth-code'));

        expect(versionOf(await userRepository.findById(user.id))).toBe(before);
    });
});

describe('the first backup-code set, when two factors are confirmed in parallel', () => {
    it('stores one set, and every code that was handed out works', async () => {
        const { user, bearer } = await signedIn();
        const totp = await api()
            .post('/account/2fa/methods/totp/setup')
            .set('Authorization', bearer)
            .send();
        await api().post('/account/2fa/methods/email/setup').set('Authorization', bearer).send({});
        const emailCode = mailedCode('account.two-factor-code');
        const { secret } = totp.body.data as { secret: string };

        const responses = await Promise.all([
            api()
                .post('/account/2fa/methods/totp/confirm')
                .set('Authorization', bearer)
                .send({ code: await codeFor(secret, 0) }),
            confirmEmail(bearer, emailCode)
        ]);
        await forgetSessionEpoch();

        expect(responses.map(({ status }) => status)).toEqual([200, 200]);
        const handedOut = responses.flatMap(
            ({ body }) => (body.data as { backupCodes?: string[] }).backupCodes ?? []
        );
        const stored = await userRepository.findByIdWithCredentials(user.id);
        const salt = stored!.twoFactorBackupCodeSalt!;
        // One request carries the set that was stored; the other carries none.
        expect(handedOut).toHaveLength(stored!.twoFactorBackupCodes.length);
        expect(handedOut.map((code) => hashBackupCode(code, salt)).toSorted()).toEqual(
            stored!.twoFactorBackupCodes.toSorted()
        );
    });
});
