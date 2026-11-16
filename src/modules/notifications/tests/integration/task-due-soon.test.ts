/**
 * @module
 * The due-soon reminder, driven the way production drives it: a task whose deadline is two days
 * away, the tasks sweep run. Proves the same people as the opener hear of it once, by bell and by
 * mail; a privacy request (a month's deadline) is reminded too, and also mailed to the support
 * mailbox, while any other contact message is not.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { asRole } from '@tests/callers';
import { setEnvironment } from '@tests/environment';
import { createUser } from '@modules/users/tests/factories';
import { notificationsService } from '@modules/notifications/services';
import { taskService } from '@modules/tasks';
import { createSystemTask, giveLife } from '@modules/tasks/tests/factories';
import { enqueueEmail } from '@infrastructure/adapters/mailer';
import { DEPLOYMENT_TENANT_ID } from '@kernel/access/tenant';
import { callerInScope } from '@kernel/permissions';
import { settleOutboxNudges } from '@kernel/outbox';
import { resetDomainEvents } from '@kernel/events';
import { registerModules } from '@kernel/registry';
import { enabledModules } from '../../../../modules';

// The queue, not the copy.
jest.mock('@infrastructure/adapters/mailer', () => ({
    __esModule: true,
    enqueueEmail: jest.fn()
}));
/** Stands in for the mail queue; the cases assert which mail was enqueued. */
const mockEnqueueEmail = enqueueEmail as jest.MockedFunction<typeof enqueueEmail>;

setupTestDb();

beforeEach(() => {
    mockEnqueueEmail.mockReset();
    mockEnqueueEmail.mockResolvedValue(undefined);
    setEnvironment({ NODE_SUPPORT_EMAIL: 'desk@example.com' });
    resetDomainEvents();
    registerModules(enabledModules);
});

afterEach(() => resetDomainEvents());

/** An administrator who can act: an authenticator app armed. */
const admin = () =>
    createUser(
        { email: 'admin@example.com', username: 'admin', authenticatorEnabledAt: new Date() },
        'admin'
    );

/** The admin's due-soon notices in the bell. */
const dueSoonBell = (userId: string) =>
    notificationsService
        .listVisible(
            callerInScope({ ...asRole('admin', userId), tenantId: DEPLOYMENT_TENANT_ID }, 'tenant')
        )
        .then(({ items }) =>
            items.filter((item) => item.code === 'notifications.staff.task-due-soon')
        );

/** Per-person due-soon mails queued so far (the subject carries the wording). */
const dueSoonMails = () =>
    mockEnqueueEmail.mock.calls.filter(
        ([envelope, template]) =>
            template === 'notifications.staff-notice' &&
            envelope.subject?.startsWith('Due soon') === true
    );

describe('a task three days from its deadline', () => {
    it('tells the people who work it, once, by bell and by mail', async () => {
        const person = await admin();
        const task = await createSystemTask();
        await giveLife(String(task._id), 2, 10);
        await settleOutboxNudges();
        mockEnqueueEmail.mockClear();

        await taskService.remindDueSoon();
        await settleOutboxNudges();
        await taskService.remindDueSoon();
        await settleOutboxNudges();

        await expect(dueSoonBell(person.id)).resolves.toMatchObject([
            { audience: 'staff', params: { taskId: String(task._id), kind: 'export_failed' } }
        ]);
        expect(dueSoonMails().map(([envelope]) => envelope.to)).toEqual(['admin@example.com']);
    });

    it('does not repeat when the event itself is delivered twice', async () => {
        const person = await admin();
        const task = await createSystemTask();
        const fact = {
            tenantId: DEPLOYMENT_TENANT_ID,
            taskId: String(task._id),
            kind: 'export_failed',
            routeSet: 'UserErasure'
        };

        await notificationsService.onTaskDueSoon(fact);
        await notificationsService.onTaskDueSoon(fact);

        await expect(dueSoonBell(person.id)).resolves.toHaveLength(1);
        expect(dueSoonMails()).toHaveLength(1);
    });

    it('warns about a privacy request three days out: one bell, one mail in the first mail thread', async () => {
        const person = await admin();
        const task = await taskService.create({
            name: 'Ada Lovelace',
            email: 'ada@example.com',
            subject: 'Erase me',
            message: 'Please call me.',
            category: 'privacy'
        });
        await giveLife(String(task._id), 2, 30);
        await settleOutboxNudges();
        mockEnqueueEmail.mockClear();

        await taskService.remindDueSoon();
        await settleOutboxNudges();
        await taskService.remindDueSoon();
        await settleOutboxNudges();

        await expect(dueSoonBell(person.id)).resolves.toHaveLength(1);
        const mailbox = mockEnqueueEmail.mock.calls.filter(
            ([, template]) => template === 'tasks.contact'
        );
        expect(mailbox).toHaveLength(1);
        const [envelope] = mailbox[0];
        expect(envelope).toMatchObject({
            to: 'desk@example.com',
            subject: expect.stringContaining('Contact request due soon'),
            inReplyTo: `<task-${String(task._id)}@example.com>`
        });
        expect(envelope.subject).toContain('[privacy]');
    });

    it('stays silent about an ordinary contact message three days out: it only has its short SLA', async () => {
        const person = await admin();
        const task = await taskService.create({
            name: 'Ada Lovelace',
            email: 'ada@example.com',
            subject: 'Where is my parcel',
            message: 'Please call me.',
            category: 'order'
        });
        await giveLife(String(task._id), 2, 30);
        await settleOutboxNudges();
        mockEnqueueEmail.mockClear();

        await taskService.remindDueSoon();
        await settleOutboxNudges();

        await expect(dueSoonBell(person.id)).resolves.toEqual([]);
        expect(
            mockEnqueueEmail.mock.calls.filter(([, template]) => template === 'tasks.contact')
        ).toEqual([]);
    });
});
