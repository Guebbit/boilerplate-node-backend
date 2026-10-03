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
        const warned = { inactivityWarnedAt: LONG_AGO };
        const customer = await inactiveAccount('customer', 'customer');
        const admin = await inactiveAccount('admin', 'admin');
        const moderator = await inactiveAccount('moderator', 'moderator');
        await Promise.all([customer, admin, moderator].map(({ id }) => makeInactive(id, warned)));

        const candidates = await userService.findWarnedStillInactive(NOW);

        expect(emailsOf(candidates)).toEqual(['customer@reaper.test']);
    });

    it('hard-deletes only what it soft-deleted for a customer', async () => {
        const reaped = { inactivityWarnedAt: LONG_AGO, deletedAt: LONG_AGO };
        const customer = await inactiveAccount('customer', 'customer');
        const admin = await inactiveAccount('admin', 'admin');
        await Promise.all([customer, admin].map(({ id }) => makeInactive(id, reaped)));

        const candidates = await userService.findReaperSoftDeletedPastGrace(NOW);

        expect(emailsOf(candidates)).toEqual(['customer@reaper.test']);
    });

    it('lists nothing, and queries nothing more, when no account is inactive', async () => {
        expect(await userService.findInactiveUnwarned(NOW)).toEqual([]);
    });
});
