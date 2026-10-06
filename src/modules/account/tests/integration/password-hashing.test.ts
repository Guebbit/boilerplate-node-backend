/**
 * @module
 * Where the password hash meets the account flows: an unknown address still pays for one hash
 * (the decoy), a long password is compared whole rather than truncated, and a password that the
 * old composition rule refused is now a fine one.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { testCallerContext } from '@tests/callers';
import { createUser, LEGACY_PASSWORD, PLAIN_PASSWORD } from '@modules/users/tests/factories';
import { accountService } from '@modules/account/services';
import * as passwordHash from '@infrastructure/security/password-hash';

setupTestDb();

afterEach(() => jest.restoreAllMocks());

describe('login with an unknown address', () => {
    it('still verifies against an argon2id hash, so a miss costs what a wrong password costs', async () => {
        const verify = jest.spyOn(passwordHash, 'verifyPassword');

        const response = await accountService.login('nobody@example.com', 'whatever-it-is');

        expect(response.success).toBe(false);
        expect(verify).toHaveBeenCalledTimes(1);
        expect(verify.mock.calls[0][1]).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    });
});

describe('a long password', () => {
    it('is compared whole: one that shares its first 72 bytes with the real one does not log in', async () => {
        const prefix = 'L0ng-pass!'.repeat(8);
        const user = await createUser({ password: `${prefix}-the-real-ending` });

        const real = await accountService.login(user.email, `${prefix}-the-real-ending`);
        const sameStart = await accountService.login(user.email, `${prefix}-a-different-ending`);

        expect(real.success).toBe(true);
        expect(sameStart.success).toBe(false);
    });
});

describe('the password shape', () => {
    it('lets a long, all-lowercase passphrase be set and used: length is the whole policy', async () => {
        const user = await createUser({ password: PLAIN_PASSWORD });

        const changed = await accountService.passwordChangeWithCurrent(
            user.id,
            PLAIN_PASSWORD,
            LEGACY_PASSWORD,
            LEGACY_PASSWORD,
            testCallerContext
        );
        const login = await accountService.login(user.email, LEGACY_PASSWORD);

        expect(changed.success).toBe(true);
        expect(login.success).toBe(true);
    });
});
