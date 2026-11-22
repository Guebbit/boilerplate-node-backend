/**
 * @module
 * The erasure race: an account is erased while its contact message is being handed to Zammad. The
 * ticket exists and so does the customer it created, but the row that would have mapped them is
 * gone, so the hand-over writes an erase job instead of a mapping.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { logger } from '@infrastructure/adapters/logger';
import { taskService } from '@modules/tasks';
import { userService } from '@modules/users';
import { createUser } from '@modules/users/tests/factories';
import { zammadService } from '../../services';
import { zammadContactModel, zammadCustomerModel, zammadEraseJobModel } from '../../model';
import { deleteContactById, markGroupsVerified } from '../../repository';
import { eraseAccount, makeDue, useZammad } from '../harness';

setupTestDb();

/** The stub of the case that is running. */
const zammad = useZammad();

beforeEach(async () => {
    // Zammad was set up here, so an erasure of a verified address leaves a job that names it.
    await markGroupsVerified(new Date());
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

    it('files nothing when the account is erased between the claim and the sender lookup', async () => {
        const user = await createUser({ email: 'ada@example.com', verifiedAt: new Date() });
        const getById = userService.getById.bind(userService);
        let erased = false;
        // The first lookup for this account erases it first, as an erasure landing mid-pass would.
        jest.spyOn(userService, 'getById').mockImplementation((id, ...rest) =>
            erased || id !== user.id
                ? getById(id, ...rest)
                : ((erased = true), eraseAccount(user.id).then(() => getById(id, ...rest)))
        );

        await taskService.submit(
            { email: 'ada@example.com', subject: 'Hello', message: 'Hi' },
            user.id
        );
        await zammadService.settleHandovers();

        // No ticket under the typed address, no customer, no row left, and no to-do either.
        expect(zammad().tickets).toHaveLength(0);
        expect(zammad().users.size).toBe(0);
        expect(await zammadContactModel.countDocuments()).toBe(0);
    });

    it('has Zammad delete the ticket an unclear earlier attempt filed, when the account is erased before the retry', async () => {
        const user = await createUser({ email: 'ada@example.com', verifiedAt: new Date() });
        zammad().misbehave({ kind: 'lose-answer' });
        await taskService.submit(
            { email: 'ada@example.com', subject: 'Hello', message: 'Hi' },
            user.id
        );
        await zammadService.settleHandovers();
        // The ticket exists, the row waits and knows its outcome was unclear.
        expect(zammad().tickets).toHaveLength(1);
        const ticketId = zammad().tickets[0].id;

        const getById = userService.getById.bind(userService);
        let erased = false;
        // The retry's first lookup finds the account erased, as an erasure landing mid-pass would.
        jest.spyOn(userService, 'getById').mockImplementation((id, ...rest) =>
            erased || id !== user.id
                ? getById(id, ...rest)
                : ((erased = true), eraseAccount(user.id).then(() => getById(id, ...rest)))
        );
        await makeDue();
        await zammadService.sweepContacts();

        // Only that ticket is asked for: the filed task names it, and the row is gone.
        expect(zammad().privacyTasks).toMatchObject([
            { deletable_type: 'Ticket', deletable_id: ticketId }
        ]);
        expect(zammad().tickets).toHaveLength(0);
        expect(await zammadContactModel.countDocuments()).toBe(0);
    });

    it('queues no erasure when another runner settled the row and the account is alive', async () => {
        const user = await createUser({ email: 'ada@example.com', verifiedAt: new Date() });
        // A lapsed lease: a second runner settles the row while this runner's create is in flight.
        zammad().onCreate(() =>
            zammadContactModel
                .findOne()
                .lean()
                .then((row) => deleteContactById(String(row?._id)))
                .then(() => undefined)
        );

        await taskService.submit(
            { email: 'ada@example.com', subject: 'Hello', message: 'Hi' },
            user.id
        );
        await zammadService.settleHandovers();

        expect(await zammadEraseJobModel.countDocuments()).toBe(0);
        await zammadService.sweepErasures();
        expect(zammad().users.size).toBe(1);
    });

    it('queues no erasure for a guest message another runner settled, when no erase job names its address', async () => {
        zammad().onCreate(() =>
            zammadContactModel
                .findOne()
                .lean()
                .then((row) => deleteContactById(String(row?._id)))
                .then(() => undefined)
        );

        await taskService.submit({ email: 'guest@example.com', subject: 'Hello', message: 'Hi' });
        await zammadService.settleHandovers();

        expect(await zammadEraseJobModel.countDocuments()).toBe(0);
        expect(zammad().users.size).toBe(1);
    });

    it('keeps the row for a retry when Zammad refuses the deletion task for an erased account’s ticket', async () => {
        const user = await createUser({ email: 'ada@example.com', verifiedAt: new Date() });
        zammad().misbehave({ kind: 'lose-answer' });
        await taskService.submit(
            { email: 'ada@example.com', subject: 'Hello', message: 'Hi' },
            user.id
        );
        await zammadService.settleHandovers();
        // The retry finds the account gone while its row still stands, and the ticket exists.
        jest.spyOn(userService, 'getById').mockResolvedValue(undefined);
        zammad().refusePrivacyTasks(503);
        await makeDue();

        await expect(zammadService.sweepContacts()).resolves.toBe(1);

        expect(zammad().tickets).toHaveLength(1);
        expect(await zammadContactModel.find().lean()).toMatchObject([
            { state: 'pending', attempts: 2, unclear: true }
        ]);
    });
});
