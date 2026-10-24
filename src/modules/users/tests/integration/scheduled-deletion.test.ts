/**
 * @module
 * The owner-scheduled deletion doors: lock with a promised `purgeAt`, restore only inside the
 * grace, erase only once it has run out, and never both. Against a real database, since the
 * claim and the conditional restore are what keep a restored account from being erased.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { userModel } from '../../model';
import { userService } from '@modules/users/services';
import { isAuthenticatable, isRestorable } from '../../authenticatable';
import { createUser } from '@modules/users/tests/factories';
import { systemCallerContext } from '@kernel/permissions';

setupTestDb();

/** The moment `days` days from now (negative: ago). */
const daysFromNow = (days: number): Date => new Date(Date.now() + days * 24 * 60 * 60 * 1000);

/** The stored copy of an account, or `null` once erased. */
const stored = (id: string) => userModel.findById(id).exec();

/** An account its owner scheduled for erasure at `purgeAt`. */
const scheduled = async (email: string, purgeAt: Date) => {
    const user = await createUser({ email, username: email });
    await userService.scheduleOwnDeletion(user, new Date(), purgeAt);
    return userModel.findById(user.id).orFail().exec();
};

describe('scheduleOwnDeletion', () => {
    it('locks the account, stamps the promise and ends every session', async () => {
        const user = await createUser({ email: 'lock@example.com' });
        const requestedAt = new Date();
        const purgeAt = daysFromNow(30);

        const saved = await userService.scheduleOwnDeletion(user, requestedAt, purgeAt);

        expect(saved.deletedAt).toEqual(requestedAt);
        expect(saved.deletedBy).toBe('owner');
        expect(saved.purgeAt).toEqual(purgeAt);
        expect(saved.tokensValidAfter).toEqual(requestedAt);
        expect(isAuthenticatable(saved)).toBe(false);
        expect(isRestorable(saved)).toBe(true);
    });
});

describe('isRestorable', () => {
    it('refuses a banned account, a plain soft delete and a grace that has run out', async () => {
        const banned = await scheduled('banned@example.com', daysFromNow(5));
        banned.active = false;
        const adminDeleted = await createUser({
            email: 'admin-deleted@example.com',
            deletedAt: new Date()
        });
        const lapsed = await scheduled('lapsed@example.com', daysFromNow(-1));

        expect(isRestorable(banned)).toBe(false);
        expect(isRestorable(adminDeleted)).toBe(false);
        expect(isRestorable(lapsed)).toBe(false);
    });
});

describe('restoreOwnAccount', () => {
    it('clears the lock inside the grace and leaves the sessions dead', async () => {
        const user = await scheduled('inside@example.com', daysFromNow(5));

        expect(await userService.restoreOwnAccount(user)).toBe(true);

        const after = await stored(user.id);
        expect(after?.deletedAt).toBeUndefined();
        expect(after?.deletedBy).toBeUndefined();
        expect(after?.purgeAt).toBeUndefined();
        expect(after?.tokensValidAfter).toEqual(user.tokensValidAfter);
    });

    it('does nothing once purgeAt has passed', async () => {
        const user = await scheduled('past@example.com', daysFromNow(-1));

        expect(await userService.restoreOwnAccount(user)).toBe(false);
        const after = await stored(user.id);
        expect(after?.deletedBy).toBe('owner');
    });

    it('lets only one of two concurrent restores win', async () => {
        const user = await scheduled('twice@example.com', daysFromNow(5));

        const results = await Promise.all([
            userService.restoreOwnAccount(user),
            userService.restoreOwnAccount(user)
        ]);

        expect(results.toSorted()).toEqual([false, true]);
    });
});

describe('eraseScheduledDeletion', () => {
    it('erases an account whose grace has run out', async () => {
        const user = await scheduled('due@example.com', daysFromNow(-1));

        const result = await userService.eraseScheduledDeletion(user, systemCallerContext('User'));

        expect(result.success).toBe(true);
        expect(await stored(user.id)).toBeNull();
    });

    it('refuses with 409 while the grace is still running, deleting nothing', async () => {
        const user = await scheduled('early@example.com', daysFromNow(5));

        const result = await userService.eraseScheduledDeletion(user, systemCallerContext('User'));

        expect(result).toMatchObject({ success: false, status: 409 });
        expect(await stored(user.id)).not.toBeNull();
    });

    it('refuses an account that was restored after the job read it', async () => {
        const user = await scheduled('raced@example.com', daysFromNow(-1));
        await userModel.updateOne({ _id: user.id }, { $set: { purgeAt: daysFromNow(5) } }).exec();
        await userService.restoreOwnAccount(user);

        const result = await userService.eraseScheduledDeletion(user, systemCallerContext('User'));

        expect(result).toMatchObject({ success: false, status: 409 });
        expect(await stored(user.id)).not.toBeNull();
    });

    it('refuses an account the reaper soft-deleted', async () => {
        const user = await createUser({
            email: 'reaped@example.com',
            deletedAt: daysFromNow(-40),
            deletedBy: 'reaper'
        });

        const result = await userService.eraseScheduledDeletion(user, systemCallerContext('User'));

        expect(result).toMatchObject({ success: false, status: 409 });
        expect(await stored(user.id)).not.toBeNull();
    });
});

describe('findDueScheduledDeletions', () => {
    it('lists only owner-scheduled rows past their purgeAt', async () => {
        await scheduled('due-a@example.com', daysFromNow(-1));
        await scheduled('not-yet@example.com', daysFromNow(3));
        await createUser({
            email: 'reaper@example.com',
            deletedAt: daysFromNow(-90),
            deletedBy: 'reaper'
        });
        await createUser({ email: 'admin@example.com', deletedAt: daysFromNow(-90) });

        const due = await userService.findDueScheduledDeletions();

        expect(due.map(({ email }) => email)).toEqual(['due-a@example.com']);
    });
});

describe('the inactivity reaper', () => {
    it('never lists an owner-scheduled account, however old', async () => {
        await scheduled('ignored@example.com', daysFromNow(-1));

        expect(await userService.findReaperSoftDeletedPastGrace(new Date())).toEqual([]);
    });
});
