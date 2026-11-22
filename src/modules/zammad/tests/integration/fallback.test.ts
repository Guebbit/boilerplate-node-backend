/**
 * @module
 * When Zammad will not take a message, the last retry hands it back to basic mode: the to-do, the
 * link-only mail, and a tombstone the alert counts. Until then the message waits and nothing is
 * lost.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { setEnvironment } from '@tests/environment';
import { enqueueEmail } from '@infrastructure/adapters/mailer';
import { logger } from '@infrastructure/adapters/logger';
import { settleOutboxNudges } from '@kernel/outbox';
import { taskService } from '@modules/tasks';
import { userService } from '@modules/users';
import { createUser } from '@modules/users/tests/factories';
import { findAllTasks } from '@modules/tasks/tests/factories';
import { zammadService } from '../../services';
import { zammadContactModel } from '../../model';
import { countFallbackTombstones } from '../../repository';
import { eraseAccount, makeDue, useZammad } from '../harness';

jest.mock('@infrastructure/adapters/mailer', () => ({
    __esModule: true,
    enqueueEmail: jest.fn().mockResolvedValue(undefined)
}));

/** Stands in for the mail queue; the cases assert which mail was enqueued. */
const mockEnqueueEmail = enqueueEmail as jest.MockedFunction<typeof enqueueEmail>;

setupTestDb();

/** The stub of the case that is running. */
const zammad = useZammad();

beforeEach(() => {
    mockEnqueueEmail.mockClear();
    setEnvironment({ NODE_OUTBOX_MAX_ATTEMPTS: '2' });
    jest.spyOn(logger, 'error').mockImplementation(() => logger);
});

afterEach(() => {
    jest.restoreAllMocks();
});

/** File a message while Zammad refuses everything. */
const submitWhileDown = async () => {
    zammad().refuseAll(503);
    await taskService.submit({
        name: 'Ada Lovelace',
        email: 'ada@example.com',
        subject: 'Where is my parcel',
        message: 'My private words.',
        category: 'privacy',
        orderNumber: 'ORD-9'
    });
    await zammadService.settleHandovers();
};

describe('a failed hand-over', () => {
    it('waits with its words intact and pushes the next try out by the backoff', async () => {
        await submitWhileDown();

        expect(await findAllTasks()).toEqual([]);
        const [row] = await zammadContactModel.find().lean();
        expect(row).toMatchObject({ state: 'pending', attempts: 1, message: 'My private words.' });
        expect(row.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
    });

    it('does not run a row before its backoff has passed', async () => {
        await submitWhileDown();
        const before = zammad().requests.length;

        await expect(zammadService.sweepContacts()).resolves.toBe(0);

        expect(zammad().requests).toHaveLength(before);
    });
});

describe('after the last retry', () => {
    it('files the basic-mode to-do and a link-only mail, and blanks the row to a tombstone', async () => {
        await submitWhileDown();
        await makeDue();
        await zammadService.sweepContacts();
        await settleOutboxNudges();

        const tasks = await findAllTasks();
        expect(
            tasks.map(({ email, subject, message, category, orderNumber, status }) => ({
                email,
                subject,
                message,
                category,
                orderNumber,
                status
            }))
        ).toEqual([
            {
                email: 'ada@example.com',
                subject: 'Where is my parcel',
                message: 'My private words.',
                category: 'privacy',
                orderNumber: 'ORD-9',
                status: 'new'
            }
        ]);

        const [row] = await zammadContactModel.find().lean();
        expect(row).toMatchObject({ state: 'fell_back' });
        expect(JSON.stringify(row)).not.toContain('My private words');
        expect(JSON.stringify(row)).not.toContain('ada@example.com');
        expect(await countFallbackTombstones()).toBe(1);

        const waiting = mockEnqueueEmail.mock.calls.find(
            ([, name]) => name === 'tasks.contact-waiting'
        );
        const [envelope, template, data] = waiting ?? [];
        expect(template).toBe('tasks.contact-waiting');
        expect(envelope).toMatchObject({ to: 'desk@example.com', noReplyTo: true });
        expect(envelope).not.toHaveProperty('replyTo');
        const sent = JSON.stringify([envelope, data]);
        expect(sent).not.toContain('ada@example.com');
        expect(sent).not.toContain('My private words');
        // No full mail alongside it.
        expect(mockEnqueueEmail.mock.calls.filter(([, name]) => name === 'tasks.contact')).toEqual(
            []
        );
    });

    it('is a to-do like any other: the reminder is link-only too', async () => {
        await submitWhileDown();
        await makeDue();
        await zammadService.sweepContacts();
        await settleOutboxNudges();
        mockEnqueueEmail.mockClear();
        const [task] = await findAllTasks();

        await taskService.mailMainMailbox(String(task._id), 'overdue');

        const [[envelope, template]] = mockEnqueueEmail.mock.calls;
        expect(template).toBe('tasks.contact-waiting');
        expect(envelope).toMatchObject({ noReplyTo: true });
    });

    it('never brings back words an erasure already deleted', async () => {
        await submitWhileDown();
        await makeDue();
        // The lookup works again and only the create is refused, so the create is reached.
        zammad().recover();
        zammad().misbehave({ kind: 'refuse', status: 503 });
        // The account is erased while the last attempt is in flight: the row is gone by the fallback.
        zammad().onCreate(() => zammadContactModel.deleteMany({}).then(() => undefined));
        await zammadService.sweepContacts();

        expect(await findAllTasks()).toEqual([]);
    });

    it('files no to-do for an account erased between the last failure and the fallback', async () => {
        const user = await createUser({ email: 'ada@example.com', verifiedAt: new Date() });
        zammad().refuseAll(503);
        await taskService.submit(
            { email: 'ada@example.com', subject: 'Hello', message: 'My private words.' },
            user.id
        );
        await zammadService.settleHandovers();
        await makeDue();

        const getById = userService.getById.bind(userService);
        let lookups = 0;
        // The sender lookup still sees the account; the fallback's own check finds it erased.
        jest.spyOn(userService, 'getById').mockImplementation((id, ...rest) => {
            lookups += 1;
            return lookups === 1
                ? getById(id, ...rest)
                : eraseAccount(user.id).then(() => getById(id, ...rest));
        });
        await zammadService.sweepContacts();

        expect(await findAllTasks()).toEqual([]);
        expect(await zammadContactModel.countDocuments()).toBe(0);
    });

    it('keeps the row for a retry, and lets the pass finish, when Zammad cannot be asked about an erased account’s ticket', async () => {
        const user = await createUser({ email: 'ada@example.com', verifiedAt: new Date() });
        zammad().misbehave({ kind: 'lose-answer' });
        await taskService.submit(
            { email: 'ada@example.com', subject: 'Hello', message: 'My private words.' },
            user.id
        );
        await zammadService.settleHandovers();
        await makeDue();
        zammad().refuseAll(503);

        const getById = userService.getById.bind(userService);
        let lookups = 0;
        // The sender lookup sees the account; the fallback's own check finds it gone. The row is
        // left standing, as it is while an erasure's transaction has not reached it yet.
        jest.spyOn(userService, 'getById').mockImplementation((id, ...rest) => {
            lookups += 1;
            return lookups === 1 ? getById(id, ...rest) : Promise.resolve(undefined);
        });

        await expect(zammadService.sweepContacts()).resolves.toBe(1);

        expect(await findAllTasks()).toEqual([]);
        expect(await zammadContactModel.find().lean()).toMatchObject([
            { state: 'pending', attempts: 2 }
        ]);
    });
});
