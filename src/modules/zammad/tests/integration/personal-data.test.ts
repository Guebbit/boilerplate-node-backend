/**
 * @module
 * What the module holds about a person, through the real doors: the account export lists it, and
 * a hard delete removes it inside the erasure's transaction. The erasure race is the one case
 * where the row is deleted while a ticket is being created.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { callerContextAs } from '@tests/callers';
import { logger } from '@infrastructure/adapters/logger';
import { taskService } from '@modules/tasks';
import { userService, personalDataSubjectOf } from '@modules/users';
import { createUser } from '@modules/users/tests/factories';
import { zammadService } from '../../services';
import { zammadContactModel, zammadCustomerModel, zammadProfileSyncModel } from '../../model';
import { requestProfileSync, upsertCustomer } from '../../repository';
import { useZammad } from '../harness';

jest.mock('@infrastructure/adapters/mailer', () => ({
    __esModule: true,
    enqueueEmail: jest.fn().mockResolvedValue(undefined)
}));

setupTestDb();

/** The stub of the case that is running. */
const zammad = useZammad();

/** A message that stays pending: Zammad refuses it. */
const pendingFrom = async (email: string, subjectId?: string) => {
    zammad().refuseAll(503);
    await taskService.submit(
        { email, subject: 'Hello', message: 'Words about my health.' },
        subjectId
    );
    await zammadService.settleHandovers();
};

describe('the export section', () => {
    it('lists the pending messages and the customer id', async () => {
        const user = await createUser({ email: 'ada@example.com', verifiedAt: new Date() });
        await pendingFrom('ada@example.com', user.id);
        await upsertCustomer(user.id, 612);

        const section = await zammadService.collectPersonalData(personalDataSubjectOf(user));

        expect(section).toMatchObject({
            pendingContacts: [{ email: 'ada@example.com', message: 'Words about my health.' }],
            customerId: 612
        });
    });

    it('answers an address-only message only to an account that proved the address', async () => {
        const unverified = await createUser({ email: 'ada@example.com' });
        await pendingFrom('ada@example.com');

        const asked = await zammadService.collectPersonalData(personalDataSubjectOf(unverified));

        expect(asked).toEqual({ pendingContacts: [] });
    });

    it('is empty, never absent, for a person with nothing', async () => {
        const user = await createUser({ email: 'nobody@example.com' });

        await expect(
            zammadService.collectPersonalData(personalDataSubjectOf(user))
        ).resolves.toEqual({ pendingContacts: [] });
    });
});

describe('a hard delete', () => {
    it('removes the pending messages, the mapping and the profile-sync row', async () => {
        const user = await createUser({ email: 'ada@example.com', verifiedAt: new Date() });
        const other = await createUser({ email: 'other@example.com', verifiedAt: new Date() });
        await pendingFrom('ada@example.com', user.id);
        await pendingFrom('other@example.com', other.id);
        await upsertCustomer(user.id, 612);
        await upsertCustomer(other.id, 613);
        await requestProfileSync(user.id);

        await userService.removeById(user.id, true, callerContextAs('admin'));

        expect(await zammadContactModel.find().lean()).toMatchObject([
            { email: 'other@example.com' }
        ]);
        expect(await zammadCustomerModel.find().lean()).toMatchObject([{ zammadUserId: 613 }]);
        expect(await zammadProfileSyncModel.countDocuments()).toBe(0);
    });

    it('also removes a message sent as a guest under the verified address', async () => {
        const user = await createUser({ email: 'ada@example.com', verifiedAt: new Date() });
        await pendingFrom('ada@example.com');

        await userService.removeById(user.id, true, callerContextAs('admin'));

        expect(await zammadContactModel.countDocuments()).toBe(0);
    });
});

describe('the erasure race', () => {
    it('maps nothing and names the returned customer when the account is erased mid-flight', async () => {
        const logged = jest.spyOn(logger, 'error').mockImplementation(() => logger);
        const user = await createUser({ email: 'ada@example.com', verifiedAt: new Date() });
        // The account is erased while the create is in flight: the ticket exists, the row is gone.
        zammad().onCreate(() =>
            userService.removeById(user.id, true, callerContextAs('admin')).then(() => undefined)
        );

        await taskService.submit(
            { email: 'ada@example.com', subject: 'Hello', message: 'Hi' },
            user.id
        );
        await zammadService.settleHandovers();

        expect(zammad().tickets).toHaveLength(1);
        expect(await zammadCustomerModel.countDocuments()).toBe(0);
        expect(logged).toHaveBeenCalledWith(
            expect.objectContaining({
                message: expect.stringContaining('after its account was erased'),
                zammadCustomerId: zammad().tickets[0].customer_id
            })
        );
        logged.mockRestore();
    });
});
