/**
 * @module
 * Inactivity minimisation, through the real module wiring: an account quiet past the window loses
 * its address book, keeps its login, and is stamped so the next run leaves it alone until it has
 * been active and quiet again. What it does to the account's orders is `src/modules/users/tests/integration/minimise-orders.test.ts`.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { resetDomainEvents } from '@kernel/events';
import { registerModules } from '@kernel/registry';
import accountModule from '@modules/account/module';
import addressesModule from '@modules/addresses/module';
import { giveAddress } from '@modules/addresses/tests/factories';
import { addressService } from '@modules/addresses';
import { accountUserService } from '../../friends/account';
import { createUser, userRepository } from '@modules/users/tests/factories';
import usersModule from '../../module';
import { userModel } from '../../model';

setupTestDb();

/** A long time ago, comfortably past the cutoff below. */
const LONG_AGO = new Date('2020-01-01T00:00:00Z');

/** The moment `days` days before now. */
const daysAgo = (days: number): Date => new Date(Date.now() - days * 24 * 60 * 60 * 1000);

/** Backdates an account's last activity (`createdAt` is immutable, hence `overwriteImmutable`). */
const makeInactive = (id: string, extra: Record<string, unknown> = {}) =>
    userModel
        .updateOne(
            { _id: id },
            { $set: { createdAt: LONG_AGO, ...extra } },
            { timestamps: false, overwriteImmutable: true }
        )
        .exec();

/** The caller's saved addresses. */
const addressesOf = (userId: string) => addressService.list(userId).then((view) => view.addresses);

/** Whether the account carries the minimised marker. */
const isMinimised = (userId: string) =>
    userModel
        .exists({ _id: userId, inactivityMinimisedAt: { $exists: true } })
        .then((found) => found !== null);

/** An inactive customer with an address book. */
const inactiveCustomer = async (name: string) => {
    const user = await createUser({ email: `${name}@minimise.test`, username: name }, 'customer');
    await giveAddress(user.id);
    await makeInactive(user.id);
    return user;
};

describe('inactivity minimisation', () => {
    beforeEach(() => {
        registerModules([accountModule, usersModule, addressesModule]);
    });

    afterEach(() => {
        resetDomainEvents();
    });

    it('drops the address book and keeps the login', async () => {
        const user = await inactiveCustomer('quiet');

        const result = await accountUserService.minimiseInactiveBefore(daysAgo(30));

        expect(result).toEqual({ minimised: 1, failed: 0 });
        expect(await addressesOf(user.id)).toEqual([]);
        const reloaded = await userRepository.findById(user.id);
        expect(reloaded?.email).toBe('quiet@minimise.test');
        expect(await isMinimised(user.id)).toBe(true);
    });

    it('minimises a banned account too: it drops data and deletes nothing', async () => {
        const user = await inactiveCustomer('banned');
        await makeInactive(user.id, { active: false });

        const result = await accountUserService.minimiseInactiveBefore(daysAgo(30));

        expect(result).toEqual({ minimised: 1, failed: 0 });
        expect(await addressesOf(user.id)).toEqual([]);
        expect(await isMinimised(user.id)).toBe(true);
    });

    it('is a no-op on a rerun', async () => {
        await inactiveCustomer('rerun');
        await accountUserService.minimiseInactiveBefore(daysAgo(30));

        const again = await accountUserService.minimiseInactiveBefore(daysAgo(30));

        expect(again).toEqual({ minimised: 0, failed: 0 });
    });

    it('leaves an active account untouched', async () => {
        const user = await createUser(
            { email: 'active@minimise.test', username: 'active' },
            'customer'
        );
        await giveAddress(user.id);

        const result = await accountUserService.minimiseInactiveBefore(daysAgo(30));

        expect(result).toEqual({ minimised: 0, failed: 0 });
        expect(await addressesOf(user.id)).toHaveLength(1);
    });

    it('minimises again an account that came back and went quiet again', async () => {
        const user = await inactiveCustomer('boomerang');
        await accountUserService.minimiseInactiveBefore(daysAgo(30));
        await giveAddress(user.id);
        // Back for a day, long enough ago to be quiet again, but after the first minimising.
        await makeInactive(user.id, {
            lastActiveAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 100)
        });
        await userModel
            .updateOne(
                { _id: user.id },
                { $set: { inactivityMinimisedAt: daysAgo(200) } },
                { timestamps: false }
            )
            .exec();

        const result = await accountUserService.minimiseInactiveBefore(daysAgo(30));

        expect(result).toEqual({ minimised: 1, failed: 0 });
        expect(await addressesOf(user.id)).toEqual([]);
    });

    it('does not stamp an account whose hook failed, so the next run retries it', async () => {
        const user = await inactiveCustomer('flaky');
        registerModules([
            {
                name: 'failing',
                personalData: [
                    {
                        section: 'failing',
                        collect: () => Promise.resolve([]),
                        minimise: () => Promise.reject(new Error('simulated hook failure'))
                    }
                ]
            },
            usersModule
        ]);

        const result = await accountUserService.minimiseInactiveBefore(daysAgo(30));

        expect(result).toEqual({ minimised: 0, failed: 1 });
        expect(await isMinimised(user.id)).toBe(false);
    });
});
