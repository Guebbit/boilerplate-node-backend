/**
 * @module
 * The overdue reminder, driven the way production drives it: a task opened and alerted, its due
 * date passed, the tasks sweep run. Proves the reminder goes to the SAME people as the opener
 * (bell and mail), once, never for a closed task, and falls back as the opener does when nobody
 * in the set can be told.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { asRole } from '@tests/callers';
import { setEnvironment } from '@tests/environment';
import { createUser } from '@modules/users/tests/factories';
import { notificationsService } from '@modules/notifications/services';
import { taskService } from '@modules/tasks';
import { backdateDue, closeDirectly, createRefundTask } from '@modules/tasks/tests/factories';
import { enqueueEmail } from '@infrastructure/adapters/mailer';
import { DEPLOYMENT_TENANT_ID } from '@kernel/access/tenant';
import { callerInScope } from '@kernel/permissions';
import { resetDomainEvents } from '@kernel/events';
import { registerModules } from '@kernel/registry';
import { enabledModules } from '../../../../modules';

// The queue, not the copy.
jest.mock('@infrastructure/adapters/mailer', () => ({
    __esModule: true,
    enqueueEmail: jest.fn()
}));
const mockEnqueueEmail = enqueueEmail as jest.MockedFunction<typeof enqueueEmail>;

setupTestDb();

beforeEach(() => {
    mockEnqueueEmail.mockReset();
    mockEnqueueEmail.mockResolvedValue(undefined);
    setEnvironment({ NODE_CONTACT_NOTIFY_EMAIL: 'desk@example.com' });
    resetDomainEvents();
    registerModules(enabledModules);
});

afterEach(() => resetDomainEvents());

/** A staff member who can act: the role given, an authenticator app armed. */
const staff = (role: string, email: string) =>
    createUser(
        {
            email,
            username: email.split('@', 1).join(''),
            authenticatorEnabledAt: new Date()
        },
        role
    );

/** `userId` reading the bell as `role`, in the deployment's shop, overdue notices only. */
const overdueBellOf = (role: string, userId: string) =>
    notificationsService
        .listVisible(
            callerInScope({ ...asRole(role, userId), tenantId: DEPLOYMENT_TENANT_ID }, 'tenant')
        )
        .then(({ items }) =>
            items.filter((item) => item.code === 'notifications.staff.task-overdue')
        );

/** Per-person overdue mails queued so far (the subject carries the wording). */
const overdueMails = () =>
    mockEnqueueEmail.mock.calls.filter(
        ([envelope, template]) =>
            template === 'notifications.staff-notice' &&
            envelope.subject?.startsWith('Overdue') === true
    );

/** Fallback-mailbox mails queued so far, with their subjects. */
const fallbackMails = () =>
    mockEnqueueEmail.mock.calls.filter(([, template]) => template === 'tasks.contact');

/** A contact message, overdue. */
const overdueContact = async () => {
    const task = await taskService.create({
        name: 'Ada Lovelace',
        email: 'ada@example.com',
        subject: 'Where is my parcel',
        message: 'Please call me.'
    });
    await backdateDue(String(task._id));
    mockEnqueueEmail.mockClear();
    return task;
};

describe('an overdue contact task', () => {
    it('tells the people who work contact tasks, once, by bell and by mail', async () => {
        const support = await staff('support', 'support@example.com');
        const manager = await staff('manager', 'manager@example.com');
        const task = await overdueContact();

        await taskService.remindOverdue();
        await taskService.remindOverdue();

        await expect(overdueBellOf('support', support.id)).resolves.toMatchObject([
            { audience: 'staff', params: { taskId: String(task._id), kind: 'contact' } }
        ]);
        await expect(overdueBellOf('manager', manager.id)).resolves.toEqual([]);
        expect(overdueMails().map(([envelope]) => envelope.to)).toEqual(['support@example.com']);
    });

    it('does not repeat when the event itself is delivered twice', async () => {
        const support = await staff('support', 'support@example.com');
        const task = await overdueContact();
        const fact = {
            tenantId: DEPLOYMENT_TENANT_ID,
            taskId: String(task._id),
            kind: 'contact',
            routeSet: 'TaskDisplay'
        };

        await notificationsService.onTaskOverdue(fact);
        await notificationsService.onTaskOverdue(fact);

        await expect(overdueBellOf('support', support.id)).resolves.toHaveLength(1);
        expect(overdueMails()).toHaveLength(1);
    });

    it('says nothing for a task closed before the sweep', async () => {
        const support = await staff('support', 'support@example.com');
        const task = await overdueContact();
        await closeDirectly(String(task._id));

        await taskService.remindOverdue();

        await expect(overdueBellOf('support', support.id)).resolves.toEqual([]);
        expect(mockEnqueueEmail).not.toHaveBeenCalled();
    });

    it('falls back to the mailbox, worded as a reminder, when nobody can be told', async () => {
        await createUser({ email: 'unarmed@example.com', username: 'unarmed' }, 'support');
        await overdueContact();

        await taskService.remindOverdue();

        expect(overdueMails()).toHaveLength(0);
        const [[envelope, , data]] = fallbackMails();
        expect(envelope).toMatchObject({ to: 'desk@example.com', replyTo: 'ada@example.com' });
        expect(envelope.subject).toMatch(/^Overdue contact request/);
        expect(data).toMatchObject({ message: 'Please call me.' });
    });
});

describe('an overdue system task', () => {
    it('tells whoever holds the task’s own set, nobody else', async () => {
        const moderator = await staff('moderator', 'mod@example.com');
        const support = await staff('support', 'support@example.com');
        const task = await createRefundTask();
        await backdateDue(String(task._id));
        mockEnqueueEmail.mockClear();

        await taskService.remindOverdue();

        await expect(overdueBellOf('moderator', moderator.id)).resolves.toMatchObject([
            { code: 'notifications.staff.task-overdue', params: { kind: 'manual_refund_owed' } }
        ]);
        await expect(overdueBellOf('support', support.id)).resolves.toEqual([]);
        expect(overdueMails().map(([envelope]) => envelope.to)).toEqual(['mod@example.com']);
    });

    it('goes nowhere when nobody holds the set, like the opener: no fallback mailbox', async () => {
        const task = await createRefundTask();
        await backdateDue(String(task._id));
        mockEnqueueEmail.mockClear();

        await expect(taskService.remindOverdue()).resolves.toBe(1);

        expect(mockEnqueueEmail).not.toHaveBeenCalled();
    });
});
