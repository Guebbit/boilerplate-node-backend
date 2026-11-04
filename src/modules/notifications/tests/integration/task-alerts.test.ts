/**
 * @module
 * Task alerts, driven the way production drives them: the real modules registered, a contact
 * message filed through the service (or a task handed to a colleague) at one end, the bell and
 * the mailboxes at the other. Proves who hears of a task (the sets that WORK it), what the
 * per-person mail may carry (a category and a link, never the visitor's words), and when the
 * fallback mailbox takes over (only when nobody permitted has an address).
 */

import { setupTestDb } from '@tests/setup-test-db';
import { asRole, callerContextAs } from '@tests/callers';
import { setEnvironment } from '@tests/environment';
import { createUser } from '@modules/users/tests/factories';
import { notificationsService } from '@modules/notifications/services';
import { taskService } from '@modules/tasks';
import { createSystemTask } from '@modules/tasks/tests/factories';
import { enqueueEmail } from '@infrastructure/adapters/mailer';
import { DEPLOYMENT_TENANT_ID } from '@kernel/access/tenant';
import { callerInScope } from '@kernel/permissions';
import { resetDomainEvents } from '@kernel/events';
import { registerModules } from '@kernel/registry';
import { TaskCategory } from '@types';
import { asSuccess } from '@tests/response';
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
const staff = (role: string, email: string, locale = 'en') =>
    createUser(
        {
            email,
            username: email.split('@', 1).join(''),
            locale,
            authenticatorEnabledAt: new Date()
        },
        role
    );

/** `userId` reading the bell as `role`, in the deployment's shop. */
const bellOf = (role: string, userId: string) =>
    notificationsService
        .listVisible(
            callerInScope({ ...asRole(role, userId), tenantId: DEPLOYMENT_TENANT_ID }, 'tenant')
        )
        .then(({ items }) => items);

/** A contact message with words nobody but the desk may read. */
const fileContact = (category?: TaskCategory) =>
    taskService.create({
        name: 'Ada Lovelace',
        email: 'ada@example.com',
        subject: 'Where is my secret parcel',
        message: 'Please call me about the diagnosis.',
        ...(category ? { category } : {})
    });

/** The per-person staff-notice mails queued so far. */
const noticeMails = () =>
    mockEnqueueEmail.mock.calls.filter(([, template]) => template === 'notifications.staff-notice');

/** The fallback-mailbox mails queued so far. */
const fallbackMails = () =>
    mockEnqueueEmail.mock.calls.filter(([, template]) => template === 'tasks.contact');

describe('a contact message', () => {
    it('tells the people who work contact tasks (support, admin), not those who only read them', async () => {
        const support = await staff('support', 'support@example.com');
        const admin = await staff('admin', 'admin@example.com');
        const manager = await staff('manager', 'manager@example.com');

        const task = await fileContact(TaskCategory.account);

        await expect(bellOf('support', support.id)).resolves.toMatchObject([
            {
                audience: 'staff',
                code: 'notifications.staff.task-opened',
                params: { taskId: String(task._id), kind: 'contact', category: 'account' }
            }
        ]);
        await expect(bellOf('admin', admin.id)).resolves.toHaveLength(1);
        await expect(bellOf('manager', manager.id)).resolves.toEqual([]);
    });

    it('mails each person a link and the category only: no name, address, subject or message', async () => {
        await staff('support', 'support@example.com', 'it');
        const task = await fileContact(TaskCategory.privacy);

        const [[envelope, , data]] = noticeMails();
        expect(envelope.to).toBe('support@example.com');
        expect(data).toMatchObject({
            locale: 'it',
            link: expect.stringContaining(`/it/tasks/${String(task._id)}`)
        });
        const mailed = JSON.stringify([envelope, data]);
        for (const secret of ['Ada', 'ada@', 'secret parcel', 'diagnosis'])
            expect(mailed).not.toContain(secret);
        expect(mailed).toContain('Privacy');
        expect(fallbackMails()).toHaveLength(0);
    });

    it('labels a message with no category as uncategorised rather than leaving a hole', async () => {
        await staff('support', 'support@example.com');

        await fileContact();

        expect(JSON.stringify(noticeMails()[0][0])).toContain('Uncategorised');
    });

    it('leaves the fallback mailbox silent whenever one permitted person has an address', async () => {
        await staff('support', 'support@example.com');

        await fileContact();

        expect(fallbackMails()).toHaveLength(0);
    });

    it('falls back to the mailbox, with the full message and a Reply-To, when nobody can be told', async () => {
        await createUser({ email: 'unarmed@example.com', username: 'unarmed' }, 'support');

        await fileContact(TaskCategory.other);

        expect(noticeMails()).toHaveLength(0);
        const [[envelope, , data]] = fallbackMails();
        expect(envelope).toMatchObject({ to: 'desk@example.com', replyTo: 'ada@example.com' });
        expect(data).toMatchObject({
            message: 'Please call me about the diagnosis.',
            category: 'other'
        });
    });

    it('says nothing at all for a spam submission', async () => {
        await staff('support', 'support@example.com');

        await taskService.create({
            email: 'bot@example.com',
            subject: 'Cheap watches',
            message: 'Buy now',
            website: 'https://spam.example'
        });

        expect(mockEnqueueEmail).not.toHaveBeenCalled();
    });

    it('is told once however often the event is delivered', async () => {
        const support = await staff('support', 'support@example.com');
        const task = await fileContact();
        const fact = {
            tenantId: DEPLOYMENT_TENANT_ID,
            taskId: String(task._id),
            kind: 'contact',
            routeSet: 'TaskDisplay'
        };

        await notificationsService.onTaskOpened(fact);
        await notificationsService.onTaskOpened(fact);

        await expect(bellOf('support', support.id)).resolves.toHaveLength(1);
        expect(noticeMails()).toHaveLength(1);
    });
});

describe('a system task', () => {
    it('tells whoever holds the task’s own set, whatever its kind', async () => {
        const moderator = await staff('moderator', 'mod@example.com');
        const support = await staff('support', 'support@example.com');

        await notificationsService.onTaskOpened({
            tenantId: DEPLOYMENT_TENANT_ID,
            taskId: '64b7f1a2c3d4e5f607182930',
            kind: 'export_failed',
            routeSet: 'UserErasure'
        });

        await expect(bellOf('moderator', moderator.id)).resolves.toMatchObject([
            { code: 'notifications.staff.task-opened', params: { kind: 'export_failed' } }
        ]);
        await expect(bellOf('support', support.id)).resolves.toEqual([]);
        expect(noticeMails().map(([envelope]) => envelope.to)).toEqual(['mod@example.com']);
        expect(fallbackMails()).toHaveLength(0);
    });

    it('never reaches the contact fallback mailbox, even with nobody to tell', async () => {
        await notificationsService.onTaskOpened({
            tenantId: DEPLOYMENT_TENANT_ID,
            taskId: '64b7f1a2c3d4e5f607182930',
            kind: 'export_failed',
            routeSet: 'UserErasure'
        });

        expect(mockEnqueueEmail).not.toHaveBeenCalled();
    });

    it('opens the screen the opener named, in the bell and in the mail, else the to-do page', async () => {
        const moderator = await staff('moderator', 'mod@example.com');
        const fact = {
            tenantId: DEPLOYMENT_TENANT_ID,
            kind: 'export_failed',
            routeSet: 'UserErasure'
        };

        await notificationsService.onTaskOpened({
            ...fact,
            taskId: '64b7f1a2c3d4e5f607182930',
            work: 'users/64b7f1a2c3d4e5f607182931'
        });
        await notificationsService.onTaskOpened({ ...fact, taskId: '64b7f1a2c3d4e5f607182932' });

        const mails = noticeMails().map((call) => (call[2] as { link: string }).link);
        expect(mails).toEqual([
            expect.stringMatching(/\/en\/users\/64b7f1a2c3d4e5f607182931$/),
            expect.stringMatching(/\/en\/tasks\/64b7f1a2c3d4e5f607182932$/)
        ]);
        await expect(bellOf('moderator', moderator.id)).resolves.toContainEqual(
            expect.objectContaining({
                params: expect.objectContaining({ work: 'users/64b7f1a2c3d4e5f607182931' })
            })
        );
    });

    it('carries the screen into the overdue reminder too', async () => {
        await staff('moderator', 'mod@example.com');

        await notificationsService.onTaskOverdue({
            tenantId: DEPLOYMENT_TENANT_ID,
            taskId: '64b7f1a2c3d4e5f607182930',
            kind: 'export_failed',
            routeSet: 'UserErasure',
            work: 'users/64b7f1a2c3d4e5f607182931'
        });

        expect(noticeMails()[0][2]).toMatchObject({
            link: expect.stringMatching(/\/en\/users\/64b7f1a2c3d4e5f607182931$/)
        });
    });
});

/** A system task and the two administrators around it: only someone who may work tasks can take one. */
const handOver = async () => {
    const giver = await staff('admin', 'giver@example.com');
    const taker = await staff('admin', 'taker@example.com');
    const task = await createSystemTask();
    return { giver, taker, id: String(task._id) };
};

describe('a task handed to a colleague', () => {
    it('tells the assignee, and only the assignee, with no mail', async () => {
        const { giver, taker, id } = await handOver();

        asSuccess(await taskService.assign(id, taker.id, callerContextAs('admin', giver.id)));

        await expect(bellOf('admin', taker.id)).resolves.toMatchObject([
            { code: 'notifications.staff.task-assigned', params: { taskId: id } }
        ]);
        await expect(bellOf('admin', giver.id)).resolves.toEqual([]);
        expect(mockEnqueueEmail).not.toHaveBeenCalled();
    });

    it('does not tell someone who took the task themselves', async () => {
        const { giver, id } = await handOver();

        asSuccess(await taskService.assign(id, giver.id, callerContextAs('admin', giver.id)));

        await expect(bellOf('admin', giver.id)).resolves.toEqual([]);
    });

    it('tells again when it is handed over a second time', async () => {
        const { giver, taker, id } = await handOver();
        const asGiver = callerContextAs('admin', giver.id);

        asSuccess(await taskService.assign(id, taker.id, asGiver));
        await new Promise((resolve) => setTimeout(resolve, 5));
        asSuccess(await taskService.assign(id, taker.id, asGiver));

        await expect(bellOf('admin', taker.id)).resolves.toHaveLength(2);
    });
});
