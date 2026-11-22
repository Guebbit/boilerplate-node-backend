/**
 * @module
 * Where suspected spam goes when Zammad is on: an email-check catch is filed in Zammad already
 * closed, tagged `suspected-spam`, with notifications suppressed; a honeypot catch stays local, as
 * in basic mode. Both reach the visitor as an ordinary `202`.
 */

import { TaskStatus } from '@types';
import { setupTestDb } from '@tests/setup-test-db';
import { setEnvironment } from '@tests/environment';
import { enqueueEmail } from '@infrastructure/adapters/mailer';
import { taskService } from '@modules/tasks';
import { findAllTasks } from '@modules/tasks/tests/factories';
import { zammadService } from '../../services';
import { zammadContactModel } from '../../model';
import { makeDue, useZammad } from '../harness';

jest.mock('@infrastructure/adapters/mailer', () => ({
    __esModule: true,
    enqueueEmail: jest.fn().mockResolvedValue(undefined)
}));

/** Stands in for the mail queue. */
const mockEnqueueEmail = enqueueEmail as jest.MockedFunction<typeof enqueueEmail>;

setupTestDb();

/** The stub of the case that is running. */
const zammad = useZammad();

beforeEach(() => {
    mockEnqueueEmail.mockClear();
    setEnvironment({ NODE_ANTIBOT_EMAIL_POLICY: 'disposable' });
});

/** Submit the contact form as `email`. */
const submit = (email: string, extra: { website?: string } = {}) =>
    taskService
        .submit({ email, subject: 'Hello', message: 'Buy my pills', ...extra })
        .then(() => zammadService.settleHandovers());

describe('an email-check catch', () => {
    it('is filed closed and tagged, notifies nobody, and files no to-do', async () => {
        await submit('bot@mailinator.com');

        expect(zammad().tickets).toHaveLength(1);
        const [ticket] = zammad().tickets;
        expect(ticket.state).toBe('closed');
        expect(ticket.tags).toEqual(['suspected-spam']);
        const create = zammad().requests.find(
            ({ method, path }) => method === 'POST' && path === '/tickets'
        );
        expect(create?.suppressNotifications).toBe('true');
        expect(await findAllTasks()).toEqual([]);
        expect(mockEnqueueEmail).not.toHaveBeenCalled();
    });

    it('closes it in a second call when Zammad refuses a create already closed', async () => {
        zammad().refuseClosedCreate();

        await submit('bot@mailinator.com');

        expect(zammad().tickets).toHaveLength(1);
        expect(zammad().tickets[0]).toMatchObject({ state: 'closed', tags: ['suspected-spam'] });
        expect(
            zammad().requests.filter(({ method, path }) => method === 'POST' && path === '/tickets')
        ).toHaveLength(2);
    });

    it('is tagged once, never filed twice, when the answer was lost and the retry finds it', async () => {
        zammad().misbehave({ kind: 'lose-answer' });

        await submit('bot@mailinator.com');
        await makeDue();
        await zammadService.sweepContacts();

        expect(zammad().tickets).toHaveLength(1);
        expect(zammad().tickets[0].tags).toEqual(['suspected-spam']);
        expect(await zammadContactModel.countDocuments()).toBe(0);
    });

    it('is not filed twice when closing it was refused after the create: the retry finds it and closes it', async () => {
        zammad().refuseClosedCreate();
        zammad().refuseNextClose(422);

        await submit('bot@mailinator.com');
        await makeDue();
        await zammadService.sweepContacts();

        expect(zammad().tickets).toHaveLength(1);
        expect(zammad().tickets[0]).toMatchObject({ state: 'closed', tags: ['suspected-spam'] });
        expect(await zammadContactModel.countDocuments()).toBe(0);
    });

    it('closes as well as tags a ticket an earlier lost answer left open', async () => {
        // Closed-on-create refused, then the open create's answer is lost: the ticket exists open.
        zammad().refuseClosedCreate();
        zammad().misbehave({ kind: 'lose-answer' });

        await submit('bot@mailinator.com');
        expect(zammad().tickets[0].state).toBe('new');
        await makeDue();
        await zammadService.sweepContacts();

        expect(zammad().tickets).toHaveLength(1);
        expect(zammad().tickets[0]).toMatchObject({ state: 'closed', tags: ['suspected-spam'] });
    });

    it('stays a local, closed spam to-do while Zammad is off', async () => {
        setEnvironment({ NODE_ZAMMAD_URL: undefined });

        await submit('bot@mailinator.com');

        const tasks = await findAllTasks();
        expect(tasks).toHaveLength(1);
        expect(tasks[0].status).toBe(TaskStatus.spam);
        expect(zammad().tickets).toEqual([]);
    });
});

describe('a honeypot catch', () => {
    it('stays local as a closed spam to-do and never reaches Zammad', async () => {
        await submit('human@example.com', { website: 'http://spam.test' });

        const tasks = await findAllTasks();
        expect(tasks).toHaveLength(1);
        expect(tasks[0].status).toBe(TaskStatus.spam);
        expect(zammad().tickets).toEqual([]);
    });
});

describe('an ordinary message', () => {
    it('is filed open, untagged, with notifications on', async () => {
        await submit('ada@example.com');

        const [ticket] = zammad().tickets;
        expect(ticket.state).toBe('new');
        expect(ticket.tags).toEqual([]);
        const create = zammad().requests.find(({ path }) => path === '/tickets');
        expect(create?.suppressNotifications).toBeUndefined();
    });
});
