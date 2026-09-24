/**
 * @module
 * `userService.findByOAuthIdentity` — the case-1 lookup `account/services/oauth.ts` runs first, on
 * every callback. B24: it used to match on `oauthAccounts` alone, so an account deactivated or
 * soft-deleted after linking a provider still resolved here and walked straight into a session.
 * Filtered the same way `findForLogin` already is.
 */
import { setupTestDb } from '@tests/setup-test-db';
import { createUser, userRepository } from '@modules/users/tests/factories';
import { userService } from '@modules/users/service';

setupTestDb();

/** Links a fixed identity onto `user`, the shape a real callback's `linkOAuthAccount` writes. */
const linkIdentity = (userId: string) =>
    userRepository.linkOAuthAccount(userId, {
        provider: 'google',
        providerId: 'subject-1',
        connectedAt: new Date()
    });

describe('userService.findByOAuthIdentity', () => {
    it('finds the account by provider + providerId', async () => {
        const user = await createUser({ email: 'linked@example.com' });
        await linkIdentity(user.id);

        const found = await userService.findByOAuthIdentity('google', 'subject-1');

        expect(found?.id).toBe(user.id);
    });

    it('resolves nothing for a deactivated account, even though the identity is linked', async () => {
        const user = await createUser({ email: 'deactivated@example.com', active: false });
        await linkIdentity(user.id);

        await expect(userService.findByOAuthIdentity('google', 'subject-1')).resolves.toBeFalsy();
    });

    it('resolves nothing for a soft-deleted account, even though the identity is linked', async () => {
        const user = await createUser({
            email: 'deleted@example.com',
            deletedAt: new Date()
        });
        await linkIdentity(user.id);

        await expect(userService.findByOAuthIdentity('google', 'subject-1')).resolves.toBeFalsy();
    });

    it('resolves nothing for an identity nobody holds', async () => {
        await expect(
            userService.findByOAuthIdentity('google', 'no-such-subject')
        ).resolves.toBeFalsy();
    });
});
