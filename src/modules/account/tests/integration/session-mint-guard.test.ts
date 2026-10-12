/**
 * @module
 * The one place that mints a FIRST session refuses an account with a second factor armed unless
 * the proof carries one. Login, OAuth and signup each branch before they get here, so this is the
 * backstop for the login path nobody has written yet: a mint that forgot the check fails loudly
 * instead of handing out a session the second factor never guarded.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { createUser } from '@modules/users/tests/factories';
import { sessionRowsOf } from '../factories';
import { createRefreshToken, SecondFactorRequiredError } from '../../session/jwt';

setupTestDb();

/** An account that has armed a second factor. */
const armedUser = () =>
    createUser({
        twoFactorEnabledAt: new Date().toISOString(),
        twoFactorMethods: [{ method: 'totp', enrolledAt: new Date(), secret: 'ciphertext' }]
    });

/** How many refresh sessions the account holds. */
const sessionsOf = (id: string): Promise<number> => sessionRowsOf(id).then((rows) => rows.length);

describe('a first session for an account with a second factor armed', () => {
    it('is refused when the proof is the password alone, and stores nothing', async () => {
        const user = await armedUser();

        await expect(createRefreshToken(user.id)).rejects.toBeInstanceOf(SecondFactorRequiredError);

        expect(await sessionsOf(user.id)).toBe(0);
    });

    it('is refused when the proof is a federated login alone', async () => {
        const user = await armedUser();

        await expect(createRefreshToken(user.id, undefined, ['google'])).rejects.toBeInstanceOf(
            SecondFactorRequiredError
        );
    });

    it('is minted once the proof carries the second factor', async () => {
        const user = await armedUser();

        await createRefreshToken(user.id, undefined, ['pwd', 'otp']);

        expect(await sessionsOf(user.id)).toBe(1);
    });
});

describe('a re-mint for an account with a second factor armed', () => {
    it('continues the session the caller already holds, so it is not checked again', async () => {
        const user = await armedUser();

        await createRefreshToken(user.id, undefined, ['pwd'], 'remint');

        expect(await sessionsOf(user.id)).toBe(1);
    });
});

describe('a first session for an account with no second factor', () => {
    it('is minted on the password alone', async () => {
        const user = await createUser();

        await createRefreshToken(user.id);

        expect(await sessionsOf(user.id)).toBe(1);
    });
});
