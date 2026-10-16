/**
 * @module
 * The end of the `changed` state: the nightly sweep forgets the previous email once nothing can
 * restore it. The undo link is the window, so an account is cleared exactly when it holds a
 * previous address and no live undo token.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { accountService } from '@modules/account/services';
import { createUser, userRepository } from '@modules/users/tests/factories';
import { plantToken } from '../factories';

setupTestDb();

/** The `verificationtokens.type` of the undo link, spelled out so a rename breaks this suite loudly. */
const UNDO = 'email-change-undo';

/**
 * An account that changed its address, its undo link living for `undoTtlMs` (a negative value is
 * a link that already ran out; `undefined` means no link at all).
 */
const changedAccount = async (username: string, undoTtlMs?: number) => {
    const user = await createUser({ username, email: `${username}@example.com` });
    await userRepository.updateMany(
        { _id: user.id },
        { $set: { previousEmail: `${username}-old@example.com` } }
    );
    if (undoTtlMs !== undefined)
        await plantToken(user.id, UNDO, `${username}-undo`, { ttlMs: undoTtlMs });
    return user;
};

/** The account's previous email as stored, `undefined` once it is gone. */
const previousEmailOf = (id: string) =>
    userRepository.findByIdWithCredentials(id).then((stored) => stored?.previousEmail);

describe('reapLapsedPreviousEmails', () => {
    it('forgets the previous email once the undo link has expired', async () => {
        const lapsed = await changedAccount('lapsed', -1000);

        await expect(accountService.reapLapsedPreviousEmails()).resolves.toBe(1);

        await expect(previousEmailOf(lapsed.id)).resolves.toBeUndefined();
    });

    it('forgets it when the link is gone altogether, spent or revoked', async () => {
        const unlinked = await changedAccount('unlinked');

        await accountService.reapLapsedPreviousEmails();

        await expect(previousEmailOf(unlinked.id)).resolves.toBeUndefined();
    });

    it('keeps it while the undo link is still live', async () => {
        const live = await changedAccount('live', 3_600_000);

        await expect(accountService.reapLapsedPreviousEmails()).resolves.toBe(0);

        await expect(previousEmailOf(live.id)).resolves.toBe('live-old@example.com');
    });

    it('is not fooled by a live token of another type', async () => {
        const other = await changedAccount('other');
        await plantToken(other.id, 'email-change', 'other-confirm', { ttlMs: 3_600_000 });

        await accountService.reapLapsedPreviousEmails();

        await expect(previousEmailOf(other.id)).resolves.toBeUndefined();
    });

    it('leaves the address and a pending change alone', async () => {
        const user = await changedAccount('pending');
        await userRepository.updateMany(
            { _id: user.id },
            { $set: { pendingEmail: 'pending-next@example.com' } }
        );

        await accountService.reapLapsedPreviousEmails();

        const stored = await userRepository.findByIdWithCredentials(user.id);
        expect(stored?.email).toBe('pending@example.com');
        expect(stored?.pendingEmail).toBe('pending-next@example.com');
    });
});
