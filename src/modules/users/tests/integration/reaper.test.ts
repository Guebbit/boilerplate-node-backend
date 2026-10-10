/**
 * @module
 * Which accounts the inactivity reaper may take offline: customers only. An employee's account
 * ends when the employment does, decided by a person, and the shop's only administrator is exactly
 * who a long holiday would otherwise erase — so none of the three stages ever lists a person at
 * staff or admin level, whatever their activity.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { assignRole } from '@modules/access';
import { userModel } from '../../model';
import { userService } from '@modules/users/services';
import { createUser } from '@modules/users/tests/factories';
import { systemCallerContext } from '@kernel/permissions';
import { callerContextAs } from '@tests/callers';

setupTestDb();

/** A long time ago, comfortably past every cutoff below. */
const LONG_AGO = new Date('2020-01-01T00:00:00Z');

/** The cutoff each stage compares against: now, so everything backdated qualifies. */
const NOW = new Date();

/**
 * Backdates an account's `createdAt` — its last activity, having never refreshed a session.
 * `overwriteImmutable`: Mongoose strips an update to `createdAt` otherwise (it is immutable).
 */
const makeInactive = (id: string, extra: Record<string, unknown> = {}) =>
    userModel
        .updateOne(
            { _id: id },
            { $set: { createdAt: LONG_AGO, ...extra } },
            { timestamps: false, overwriteImmutable: true }
        )
        .exec();

/** An inactive account holding `role`, plus a platform-only operator when asked. */
const inactiveAccount = async (name: string, role?: string, platformRole?: string) => {
    const user = await createUser({ email: `${name}@reaper.test`, username: name }, role);
    if (platformRole) await assignRole(user.id, null, 'platform', platformRole);
    await makeInactive(user.id);

    return user;
};

/** The moment `days` days before now. */
const daysAgo = (days: number): Date => new Date(Date.now() - days * 24 * 60 * 60 * 1000);

/** The emails a stage lists. */
const emailsOf = (accounts: { email: string }[]) => accounts.map(({ email }) => email).toSorted();

describe('the inactivity reaper’s candidates', () => {
    it('warns customers, unverified accounts and people with no role — and nobody above them', async () => {
        await inactiveAccount('customer', 'customer');
        await inactiveAccount('unverified', 'unverified');
        await inactiveAccount('norole');
        await inactiveAccount('manager', 'manager');
        await inactiveAccount('support', 'support');
        await inactiveAccount('admin', 'admin');
        await inactiveAccount('operator', undefined, 'operator');
        await inactiveAccount('both', 'customer', 'operator');

        const candidates = await userService.findInactiveUnwarned(NOW);

        expect(emailsOf(candidates)).toEqual([
            'customer@reaper.test',
            'norole@reaper.test',
            'unverified@reaper.test'
        ]);
    });

    it('soft-deletes only warned customers, never a warned staff member or administrator', async () => {
        // Warned after their last activity (`createdAt`, LONG_AGO), as a real warning always is.
        const warned = { inactivityWarnedAt: new Date('2020-06-01T00:00:00Z') };
        const customer = await inactiveAccount('customer', 'customer');
        const admin = await inactiveAccount('admin', 'admin');
        const moderator = await inactiveAccount('moderator', 'moderator');
        await Promise.all([customer, admin, moderator].map(({ id }) => makeInactive(id, warned)));

        const candidates = await userService.findWarnedStillInactive(NOW);

        expect(emailsOf(candidates)).toEqual(['customer@reaper.test']);
    });

    it('hard-deletes only what it soft-deleted for a customer', async () => {
        const reaped = { deletedBy: 'reaper', deletedAt: LONG_AGO };
        const customer = await inactiveAccount('customer', 'customer');
        const admin = await inactiveAccount('admin', 'admin');
        await Promise.all([customer, admin].map(({ id }) => makeInactive(id, reaped)));

        const candidates = await userService.findReaperSoftDeletedPastGrace(NOW);

        expect(emailsOf(candidates)).toEqual(['customer@reaper.test']);
    });

    it('keeps an account whose only recent proof of life is lastActiveAt, tokens or none', async () => {
        const user = await inactiveAccount('returned', 'customer');
        await makeInactive(user.id, { lastActiveAt: new Date(), tokens: [] });

        expect(await userService.findInactiveUnwarned(daysAgo(30))).toEqual([]);
    });

    it('measures the grace from the warning, so a freshly warned account is never soft-deleted', async () => {
        const fresh = await inactiveAccount('fresh', 'customer');
        const ripe = await inactiveAccount('ripe', 'customer');
        await makeInactive(fresh.id, { inactivityWarnedAt: new Date() });
        await makeInactive(ripe.id, { inactivityWarnedAt: daysAgo(31) });

        const candidates = await userService.findWarnedStillInactive(daysAgo(30));

        expect(emailsOf(candidates)).toEqual(['ripe@reaper.test']);
    });

    it('warns an account again once it came back after a warning and went idle again', async () => {
        // Warned a year ago, returned 100 days ago, idle since.
        const user = await inactiveAccount('boomerang', 'customer');
        await makeInactive(user.id, {
            inactivityWarnedAt: daysAgo(365),
            lastActiveAt: daysAgo(100)
        });

        expect(emailsOf(await userService.findInactiveUnwarned(daysAgo(30)))).toEqual([
            'boomerang@reaper.test'
        ]);
        // ...and an account that returned after the warning is not a soft-delete candidate.
        expect(await userService.findWarnedStillInactive(daysAgo(30))).toEqual([]);
    });

    it('does not warn an account already warned for this stretch of inactivity', async () => {
        const user = await inactiveAccount('warned', 'customer');
        await makeInactive(user.id, { inactivityWarnedAt: daysAgo(5) });

        expect(await userService.findInactiveUnwarned(NOW)).toEqual([]);
    });

    it('never lists a disabled account in any stage', async () => {
        const user = await inactiveAccount('banned', 'customer');
        await makeInactive(user.id, {
            active: false,
            inactivityWarnedAt: LONG_AGO,
            deletedBy: 'reaper',
            deletedAt: LONG_AGO
        });

        expect(await userService.findInactiveUnwarned(NOW)).toEqual([]);
        expect(await userService.findWarnedStillInactive(NOW)).toEqual([]);
        expect(await userService.findReaperSoftDeletedPastGrace(NOW)).toEqual([]);
    });

    it('never hard-deletes a staff soft delete, even of a once-warned account', async () => {
        const user = await inactiveAccount('staffdeleted', 'customer');
        await makeInactive(user.id, { inactivityWarnedAt: LONG_AGO, deletedAt: LONG_AGO });

        expect(await userService.findReaperSoftDeletedPastGrace(NOW)).toEqual([]);
    });

    it('lists nothing, and queries nothing more, when no account is inactive', async () => {
        expect(await userService.findInactiveUnwarned(NOW)).toEqual([]);
    });
});

/** Reads the raw stored `deletedBy` marker. */
const markerOf = (id: string) =>
    userModel
        .findById(id)
        .lean()
        .exec()
        .then((row) => row?.deletedBy);

describe('who soft-deleted the account', () => {
    it('marks the reaper’s own soft delete, and nobody else’s', async () => {
        const byReaper = await createUser({ email: 'by-reaper@reaper.test', username: 'byreaper' });
        const byStaff = await createUser({ email: 'by-staff@reaper.test', username: 'bystaff' });

        await userService.remove(byReaper, false, systemCallerContext('User'));
        await userService.remove(byStaff, false, callerContextAs('admin'));

        expect(await markerOf(byReaper.id)).toBe('reaper');
        expect(await markerOf(byStaff.id)).toBeUndefined();
    });

    it('clears the marker when the account is restored', async () => {
        const user = await createUser({ email: 'restored@reaper.test', username: 'restored' });
        await userService.remove(user, false, systemCallerContext('User'));

        await userService.restoreById(user.id);

        expect(await markerOf(user.id)).toBeUndefined();
    });
});
