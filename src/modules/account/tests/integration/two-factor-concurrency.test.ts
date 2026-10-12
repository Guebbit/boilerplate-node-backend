/**
 * @module
 * Two-factor one-time spends under parallel requests, over the real app: each secret that can be
 * used once is used once, and each counter counts every miss. Every assertion holds under EVERY
 * interleaving — a test that passes only when one request happens to win proves nothing.
 */

import { api } from '@tests/http';
import { setupTestDb } from '@tests/setup-test-db';
import { codeFor } from '@tests/totp';
import { forgetSessionEpoch } from '@tests/session-epoch';
import { createUser, PLAIN_PASSWORD, userRepository } from '@modules/users/tests/factories';
import { twoFactorService } from '@modules/account/services';
import { hashBackupCode } from '@modules/account/two-factor';

setupTestDb();

/** A signed-in account with the TOTP factor armed, and the codes `confirm` handed out. */
const armedAccount = async () => {
    const user = await createUser({ verifiedAt: new Date(), email: 'ada@example.com' });
    const login = await api()
        .post('/account/login')
        .send({ email: user.email, password: PLAIN_PASSWORD });
    const bearer = `Bearer ${login.body.data.token as string}` as const;

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
