/**
 * @module
 * The one place that mints a FIRST session refuses an account with a second factor armed unless
 * the proof carries one. Login, OAuth and signup each branch before they get here, so this is the
 * backstop for the login path nobody has written yet: a mint that forgot the check fails loudly
 * instead of handing out a session the second factor never guarded. The same mint refuses a proof
 * the account's epoch has since passed.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { createUser } from '@modules/users/tests/factories';
import { sessionRowsOf } from '../factories';
import { decodeJwt } from 'jose';
import { userService } from '@modules/users';
import { continueSession, startSession } from '../../session/jwt';
import { SecondFactorRequiredError, StaleProofError } from '../../session/mint-guard';

setupTestDb();

/** An account that has armed a second factor. */
const armedUser = () =>
    createUser({
        twoFactorEnabledAt: new Date().toISOString(),
        twoFactorMethods: [{ method: 'totp', enrolledAt: new Date(), secret: 'ciphertext' }]
    });

/** How many refresh sessions the account holds. */
const sessionsOf = (id: string): Promise<number> => sessionRowsOf(id).then((rows) => rows.length);

/** Every proof a mint can be handed, against whether the account is armed and which kind of mint it is. */
const CASES: readonly {
    name: string;
    armed: boolean;
    amr: string[];
    mint: 'start' | 'continue';
    minted: boolean;
}[] = [
    { name: 'armed, password alone', armed: true, amr: ['pwd'], mint: 'start', minted: false },
    { name: 'armed, federated alone', armed: true, amr: ['google'], mint: 'start', minted: false },
    {
        name: 'armed, mailed code',
        armed: true,
        amr: ['pwd', 'email'],
        mint: 'start',
        minted: false
    },
    {
        name: 'armed, password and otp',
        armed: true,
        amr: ['pwd', 'otp'],
        mint: 'start',
        minted: true
    },
    { name: 'unarmed, password alone', armed: false, amr: ['pwd'], mint: 'start', minted: true },
    {
        name: 'armed, re-mint on password alone',
        armed: true,
        amr: ['pwd'],
        mint: 'continue',
        minted: true
    }
];

describe('the mint guard, over proofs x armed x mint kind', () => {
    it.each(CASES)('$name', async ({ armed, amr, mint, minted }) => {
        const user = await (armed ? armedUser() : createUser());
        const attempt = (mint === 'start' ? startSession : continueSession)(user.id, amr);

        if (minted) await attempt;
        else await expect(attempt).rejects.toBeInstanceOf(SecondFactorRequiredError);

        // A refusal stores nothing; a mint stores exactly one row.
        expect(await sessionsOf(user.id)).toBe(minted ? 1 : 0);
    });
});

describe('the proof time', () => {
    it('refuses a first session on a proof the epoch has since passed, storing nothing', async () => {
        const user = await createUser();
        const provedAt = Date.now();
        await userService.bumpSessionEpoch(user.id, new Date(provedAt + 1));

        await expect(startSession(user.id, ['pwd'], undefined, provedAt)).rejects.toBeInstanceOf(
            StaleProofError
        );
        expect(await sessionsOf(user.id)).toBe(0);
    });

    it('stamps `auth_time` from the proof, in NumericDate seconds', async () => {
        const user = await createUser();
        const provedAt = Date.now() - 4500;

        const token = await startSession(user.id, ['pwd'], undefined, provedAt);

        // jose: the payload, unverified — the test only reads back what the app itself signed.
        // https://github.com/panva/jose/blob/main/docs/util/decode_jwt/functions/decodeJwt.md
        expect(decodeJwt(token).auth_time).toBe(Math.floor(provedAt / 1000));
    });
});
