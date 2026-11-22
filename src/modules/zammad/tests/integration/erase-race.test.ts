/**
 * @module
 * The erasure race: an account is erased while its contact message is being handed to Zammad. The
 * ticket exists and so does the customer it created, but the row that would have mapped them is
 * gone, so the hand-over writes an erase job instead of a mapping.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { logger } from '@infrastructure/adapters/logger';
import { taskService } from '@modules/tasks';
import { createUser } from '@modules/users/tests/factories';
import { zammadService } from '../../services';
import { zammadCustomerModel, zammadEraseJobModel } from '../../model';
import { eraseAccount, useZammad } from '../harness';

setupTestDb();

/** The stub of the case that is running. */
const zammad = useZammad();

beforeEach(() => {
    jest.spyOn(logger, 'warn').mockImplementation(() => logger);
});

afterEach(() => {
    jest.restoreAllMocks();
});

describe('the erasure race', () => {
    it('maps nothing and has the customer the ticket created deleted', async () => {
        const user = await createUser({ email: 'ada@example.com', verifiedAt: new Date() });
        // The account is erased while the create is in flight: the ticket exists, the row is gone.
        zammad().onCreate(() => eraseAccount(user.id).then(() => undefined));

        await taskService.submit(
            { email: 'ada@example.com', subject: 'Hello', message: 'Hi' },
            user.id
        );
        await zammadService.settleHandovers();

        const customerId = zammad().tickets[0].customer_id;
        expect(await zammadCustomerModel.countDocuments()).toBe(0);
        // The erasure's own job (mapping unknown yet) and the race's job naming the new customer.
        const jobs = await zammadEraseJobModel.find().lean();
        expect(
            jobs.flatMap(({ targets }) => targets.map(({ zammadUserId }) => zammadUserId))
        ).toContain(customerId);

        await zammadService.sweepErasures();

        expect(zammad().users.has(customerId)).toBe(false);
        expect(zammad().tickets).toHaveLength(0);
    });

    it('leaves alone a customer that is a stranger’s: the signed-in sender typed someone else’s address', async () => {
        const logged = jest.spyOn(logger, 'error').mockImplementation(() => logger);
        const user = await createUser({ email: 'ada@example.com', verifiedAt: new Date() });
        zammad().onCreate(() => eraseAccount(user.id).then(() => undefined));

        await taskService.submit(
            { email: 'stranger@example.com', subject: 'Hello', message: 'Hi' },
            user.id
        );
        await zammadService.settleHandovers();
        await zammadService.sweepErasures();

        const customerId = zammad().tickets[0].customer_id;
        // The stranger's customer and ticket survive: they are not the erased person's.
        expect(zammad().users.get(customerId)?.email).toBe('stranger@example.com');
        expect(zammad().privacyTasks).toEqual([]);
        expect(logged).toHaveBeenCalledWith(
            expect.objectContaining({ zammadCustomerId: customerId })
        );
    });

    it('deletes the customer of a guest message sent under the erased account’s verified address', async () => {
        const user = await createUser({ email: 'ada@example.com', verifiedAt: new Date() });
        zammad().onCreate(() => eraseAccount(user.id).then(() => undefined));

        await taskService.submit({ email: 'ada@example.com', subject: 'Hello', message: 'Hi' });
        await zammadService.settleHandovers();
        await zammadService.sweepErasures();

        expect(zammad().users.size).toBe(0);
        expect(zammad().tickets).toHaveLength(0);
    });
});
