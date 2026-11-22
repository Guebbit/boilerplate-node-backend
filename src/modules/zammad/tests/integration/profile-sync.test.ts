/**
 * @module
 * A changed email reaches the mapped Zammad customer: one row per account, the CURRENT address
 * sent (and nothing else), and a refusal Zammad will repeat forever is logged and dropped.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { callerContextAs } from '@tests/callers';
import { logger } from '@infrastructure/adapters/logger';
import { settleOutboxNudges } from '@kernel/outbox';
import { createUser, userRepository } from '@modules/users/tests/factories';
import type { UserDocument } from '@modules/users';
import { userService } from '@modules/users';
import { zammadService } from '../../services';
import { zammadCustomerModel, zammadProfileSyncModel } from '../../model';
import { upsertCustomer } from '../../repository';
import { useZammad } from '../harness';

jest.mock('@infrastructure/adapters/mailer', () => ({
    __esModule: true,
    enqueueEmail: jest.fn().mockResolvedValue(undefined)
}));

setupTestDb();

/** The stub of the case that is running. */
const zammad = useZammad();

/** The PUTs to a Zammad customer the stub saw. */
const puts = () => zammad().requests.filter(({ method }) => method === 'PUT');

/** Rename an account the way an admin does, and let the event land. */
const rename = (userId: string, username: string) =>
    userService
        .updateById(userId, { username }, callerContextAs('admin'))
        .then(() => settleOutboxNudges());

/**
 * Move an account's address and announce it, as the email-change confirmation does: the stored
 * address changes, then `user.profile_changed` names the field. Driven through the module's own
 * listener, the door the event reaches it by.
 */
const changeEmail = (user: UserDocument, email: string) => {
    user.email = email;
    return userRepository
        .save(user)
        .then(() => zammadService.onProfileChanged({ userId: user.id, changed: ['email'] }));
};

describe('profile sync', () => {
    it('overwrites the mapped customer with the current address, and nothing else', async () => {
        const user = await createUser({ email: 'ada@example.com', username: 'ada' });
        await upsertCustomer(user.id, 612);

        await changeEmail(user, 'ada.new@example.com');
        expect(await zammadProfileSyncModel.countDocuments()).toBe(1);
        await expect(zammadService.sweepProfiles()).resolves.toBe(1);

        expect(puts()).toMatchObject([
            { path: '/users/612', body: { email: 'ada.new@example.com' } }
        ]);
        expect(puts()[0].body).toEqual({ email: 'ada.new@example.com' });
        expect(await zammadProfileSyncModel.countDocuments()).toBe(0);
    });

    it('is one call for a burst of changes, carrying the last address', async () => {
        const user = await createUser({ email: 'ada@example.com', username: 'ada' });
        await upsertCustomer(user.id, 612);

        await changeEmail(user, 'first@example.com');
        await changeEmail(user, 'second@example.com');
        expect(await zammadProfileSyncModel.countDocuments()).toBe(1);
        await zammadService.sweepProfiles();

        expect(puts()).toMatchObject([{ body: { email: 'second@example.com' } }]);
    });

    it('writes no row for a change that left the address alone: Zammad holds nothing else', async () => {
        const user = await createUser({ email: 'ada@example.com', username: 'ada' });
        await upsertCustomer(user.id, 612);

        await rename(user.id, 'renamed');

        expect(await zammadProfileSyncModel.countDocuments()).toBe(0);
        expect(puts()).toEqual([]);
    });

    it('writes no row for an account that is no Zammad customer', async () => {
        const user = await createUser({ email: 'nobody@example.com', username: 'nobody' });

        await changeEmail(user, 'nobody.new@example.com');

        expect(await zammadProfileSyncModel.countDocuments()).toBe(0);
        expect(puts()).toEqual([]);
    });

    it('logs and drops a refusal for good: the address is another customer’s', async () => {
        const logged = jest.spyOn(logger, 'error').mockImplementation(() => logger);
        const user = await createUser({ email: 'ada@example.com', username: 'ada' });
        await upsertCustomer(user.id, 612);
        zammad().holdAddress('ada.new@example.com', 777);

        await changeEmail(user, 'ada.new@example.com');
        await zammadService.sweepProfiles();

        expect(logged).toHaveBeenCalledWith(
            expect.objectContaining({
                message: expect.stringContaining('already another customer')
            })
        );
        expect(await zammadProfileSyncModel.countDocuments()).toBe(0);
        logged.mockRestore();
    });

    it('retries a failure that may pass, keeping the row', async () => {
        const user = await createUser({ email: 'ada@example.com', username: 'ada' });
        await upsertCustomer(user.id, 612);
        await changeEmail(user, 'ada.new@example.com');
        await zammad().stop();

        await zammadService.sweepProfiles();

        const [row] = await zammadProfileSyncModel.find().lean();
        expect(row.attempts).toBe(1);
        expect(row.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
        expect(await zammadCustomerModel.countDocuments()).toBe(1);
    });
});
