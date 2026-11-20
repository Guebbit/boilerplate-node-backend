/**
 * @module
 * The engine that opens and closes system tasks (here with the situations `tasks` itself owns: a
 * flagged account, a failed export), driven the way production drives them: the real
 * modules registered, a producer's event emitted (with the `eventId` the outbox stamps), the
 * task read back from storage. Pins each opener and each clearer, the dedup (a repeat touches,
 * a redelivery is a no-op, two racing events open one task), and that staff closing first wins.
 */

import { Types } from 'mongoose';
import { setupTestDb } from '@tests/setup-test-db';
import { setEnvironment } from '@tests/environment';
import { enqueueEmail } from '@infrastructure/adapters/mailer';
import { emitDomainEvent, onDomainEvent, resetDomainEvents } from '@kernel/events';
import { registerModules } from '@kernel/registry';
import { taskModel } from '@modules/tasks/model';
import { taskRepository } from '@modules/tasks/repository';
import { observePort } from '@tests/ports';
import * as auditPort from '@infrastructure/observability/audit';
import { tasksAuditActions } from '../../audit';
import { openSystemTask } from '../../services/system';
import { accountReviewOpening } from '../../domain';
import { outboxEventModel, relayOutbox, settleOutboxNudges } from '@kernel/outbox';
import { TASK_OPENED } from '../../events';
import { TaskKind, TaskResolution, TaskStatus } from '@types';
import { enabledModules } from '../../../../modules';

/* The audit port is replaced, not spied on — see `tests/support/ports.ts`. */
jest.mock('@infrastructure/observability/audit', () =>
    jest.requireActual<typeof import('@tests/ports')>('@tests/ports').auditPortMock()
);

// The queue, not the mail: opening a task tells the staff who work it.
jest.mock('@infrastructure/adapters/mailer', () => ({
    __esModule: true,
    enqueueEmail: jest.fn()
}));

/** Stands in for the mail queue; the cases assert which mail was enqueued. */
const mockEnqueueEmail = enqueueEmail as jest.MockedFunction<typeof enqueueEmail>;

setupTestDb();

/** An account that exists as an id: the system reads it back as an ObjectId. */
const USER = new Types.ObjectId().toString();

/** Counter behind the outbox row ids the cases hand out. */
let eventCounter = 0;

/** A fresh outbox row id, as the relay would stamp one. */
const nextEventId = () => `event-${String(++eventCounter)}`;

beforeEach(() => {
    mockEnqueueEmail.mockReset();
    mockEnqueueEmail.mockResolvedValue(undefined);
    setEnvironment({ NODE_SUPPORT_EMAIL: 'desk@example.com' });
    resetDomainEvents();
    registerModules(enabledModules);
});

afterEach(() => resetDomainEvents());

/** Every task in storage, oldest first. */
const allTasks = () => taskModel.find().sort({ createdAt: 1 }).exec();

/** The one task in storage. */
const onlyTask = () =>
    allTasks().then((tasks) => {
        expect(tasks).toHaveLength(1);
        return tasks[0];
    });

/** The one task's remembered event ids. */
const eventIdsOnly = () => onlyTask().then(({ eventIds }) => eventIds);

/** Collects the tasks announced as opened. */
const watchOpened = () => {
    const opened = jest.fn();
    onDomainEvent(TASK_OPENED, opened);
    return opened;
};

describe('what opens a task', () => {
    it.each([
        [
            'user.review_flagged',
            () =>
                emitDomainEvent(
                    'user.review_flagged',
                    { userId: USER },
                    { eventId: nextEventId() }
                ),
            TaskKind.account_review,
            'UserBanning'
        ],
        [
            'account.export_failed',
            () =>
                emitDomainEvent(
                    'account.export_failed',
                    { userId: USER, exportId: 'ex1' },
                    { eventId: nextEventId() }
                ),
            TaskKind.export_failed,
            'UserErasure'
        ]
    ])(
        '%s opens one open system task in the right jurisdiction',
        async (_name, emit, kind, set) => {
            await emit();

            const task = await onlyTask();
            expect(task.kind).toBe(kind);
            expect(task.routeSet).toBe(set);
            expect(task.status).toBe(TaskStatus.new);
            expect(task.source).toBe('system');
            expect(task.openKey).toBeDefined();
            expect(task.dueAt).toBeInstanceOf(Date);
        }
    );

    it('stamps the screen that does the work, so the alert opens it', async () => {
        await emitDomainEvent(
            'account.export_failed',
            { userId: USER, exportId: 'ex1' },
            { eventId: nextEventId() }
        );

        const { work: actualwork } = await onlyTask();

        expect(actualwork).toBe(`users/${USER}`);
    });

    it('opens nothing when an export succeeds: only a failure is a situation', async () => {
        await emitDomainEvent(
            'account.export_ready',
            { userId: USER, exportId: 'ex1' },
            { eventId: nextEventId() }
        );

        expect(await allTasks()).toHaveLength(0);
    });
});

describe('what closes a task', () => {
    it.each([
        [
            'user.review_cleared',
            () =>
                emitDomainEvent(
                    'user.review_flagged',
                    { userId: USER },
                    { eventId: nextEventId() }
                ),
            () => emitDomainEvent('user.review_cleared', { userId: USER })
        ],
        [
            'a later account.export_ready',
            () =>
                emitDomainEvent(
                    'account.export_failed',
                    { userId: USER, exportId: 'ex1' },
                    { eventId: nextEventId() }
                ),
            () => emitDomainEvent('account.export_ready', { userId: USER, exportId: 'ex2' })
        ]
    ])('%s resolves it as cleared and frees the dedup key', async (_name, open, close) => {
        await open();
        await close();

        const task = await onlyTask();
        expect(task.status).toBe(TaskStatus.resolved);
        expect(task.resolution).toBe(TaskResolution.cleared);
        expect(task.closedAt).toBeInstanceOf(Date);
        expect(task.openKey).toBeUndefined();
    });

    it('is a no-op on a task staff already closed, and keeps their notes', async () => {
        await emitDomainEvent('user.review_flagged', { userId: USER }, { eventId: nextEventId() });
        const { _id } = await onlyTask();
        await taskRepository.appendNote(String(_id), { body: 'looked into it', at: new Date() });
        await taskModel.updateOne(
            { _id },
            {
                $set: {
                    status: TaskStatus.resolved,
                    resolution: TaskResolution.staff,
                    closedAt: new Date()
                },
                $unset: { openKey: 1 }
            }
        );

        await emitDomainEvent('user.review_cleared', { userId: USER });

        const task = await onlyTask();
        expect(task.resolution).toBe(TaskResolution.staff);
        expect(task.notes).toHaveLength(1);
    });
});

describe('dedup', () => {
    it('touches the open task on a repeat of the situation, and announces nothing twice', async () => {
        const opened = watchOpened();

        await emitDomainEvent(
            'account.export_failed',
            { userId: USER, exportId: 'ex1' },
            { eventId: nextEventId() }
        );
        await emitDomainEvent(
            'account.export_failed',
            { userId: USER, exportId: 'ex1' },
            { eventId: nextEventId() }
        );

        await settleOutboxNudges();

        const task = await onlyTask();
        expect(task.seenCount).toBe(2);
        expect(opened).toHaveBeenCalledTimes(1);
    });

    it('delivers a notice whose handler failed once on the next relay pass', async () => {
        let attempts = 0;
        onDomainEvent(TASK_OPENED, () => {
            attempts += 1;
            if (attempts === 1) throw new Error('listener down');
        });

        await emitDomainEvent(
            'account.export_failed',
            { userId: USER, exportId: 'ex1' },
            { eventId: nextEventId() }
        );
        await settleOutboxNudges();

        // The first pass failed: the row waits, with its backoff, instead of being lost.
        await expect(
            outboxEventModel.countDocuments({ name: 'task.opened', status: 'pending' })
        ).resolves.toBe(1);
        await outboxEventModel.updateMany(
            { name: 'task.opened' },
            { $set: { nextAttemptAt: new Date(0) } }
        );

        await relayOutbox();

        expect(attempts).toBe(2);
        await expect(
            outboxEventModel.countDocuments({ name: 'task.opened', status: 'published' })
        ).resolves.toBe(1);
    });

    it('ignores a redelivery of the same event, even after the task closed', async () => {
        const eventId = nextEventId();
        await emitDomainEvent('user.review_flagged', { userId: USER }, { eventId });
        await emitDomainEvent('user.review_cleared', { userId: USER });

        await emitDomainEvent('user.review_flagged', { userId: USER }, { eventId });

        const tasks = await allTasks();
        expect(tasks).toHaveLength(1);
        expect(tasks[0].status).toBe(TaskStatus.resolved);
    });

    it('opens a new task when the same situation returns after it closed', async () => {
        await emitDomainEvent('user.review_flagged', { userId: USER }, { eventId: nextEventId() });
        await emitDomainEvent('user.review_cleared', { userId: USER });
        await emitDomainEvent('user.review_flagged', { userId: USER }, { eventId: nextEventId() });

        const tasks = await allTasks();
        expect(tasks.map(({ status }) => status)).toEqual([TaskStatus.resolved, TaskStatus.new]);
    });

    it('opens one task when two events race', async () => {
        await Promise.all([
            emitDomainEvent(
                'account.export_failed',
                { userId: USER, exportId: 'ex1' },
                { eventId: nextEventId() }
            ),
            emitDomainEvent(
                'account.export_failed',
                { userId: USER, exportId: 'ex1' },
                { eventId: nextEventId() }
            )
        ]);

        const task = await onlyTask();
        expect(task.seenCount).toBe(2);
    });

    it('remembers only the last events, so a task does not grow without bound', async () => {
        for (let index = 0; index < 25; index++)
            await emitDomainEvent(
                'account.export_failed',
                { userId: USER, exportId: 'ex1' },
                { eventId: nextEventId() }
            );

        expect(await eventIdsOnly()).toHaveLength(20);
    });
});

describe('replacing the open task of a situation', () => {
    const NOTE = 'Out of date: replaced.';

    it('closes the open task as cleared, with the note, and opens the new one in its place', async () => {
        await openSystemTask(accountReviewOpening(USER, new Date()), { eventId: nextEventId() });
        const auditSpy = observePort(auditPort.emitAuditEvent);

        await openSystemTask(
            { ...accountReviewOpening(USER, new Date()), message: 'The newer facts.' },
            { eventId: nextEventId() },
            { replaceOpen: { note: NOTE } }
        );
        expect(auditSpy.mock.calls.map(([entry]) => entry.action).toSorted()).toEqual(
            [tasksAuditActions.SYSTEM_TASK_CLEARED, tasksAuditActions.SYSTEM_TASK_OPENED].toSorted()
        );

        const [old, fresh] = await allTasks();
        expect(old).toMatchObject({
            status: TaskStatus.resolved,
            resolution: TaskResolution.cleared
        });
        expect(old.notes.map((note) => note.body)).toEqual([NOTE]);
        expect(old.openKey).toBeUndefined();
        expect(fresh).toMatchObject({ status: TaskStatus.new, message: 'The newer facts.' });
    });

    it('without the option, only touches the open task: nothing is replaced', async () => {
        await openSystemTask(accountReviewOpening(USER, new Date()), { eventId: nextEventId() });

        await openSystemTask(accountReviewOpening(USER, new Date()), { eventId: nextEventId() });

        const task = await onlyTask();
        expect(task.seenCount).toBe(2);
    });

    it('opens a task when nothing is open to replace', async () => {
        await openSystemTask(
            accountReviewOpening(USER, new Date()),
            { eventId: nextEventId() },
            { replaceOpen: { note: NOTE } }
        );

        const task = await onlyTask();
        expect(task.status).toBe(TaskStatus.new);
    });

    it('touches the open task, same id, when the new message is the same', async () => {
        await openSystemTask(accountReviewOpening(USER, new Date()), { eventId: nextEventId() });
        const [original] = await allTasks();

        await openSystemTask(
            accountReviewOpening(USER, new Date()),
            { eventId: nextEventId() },
            { replaceOpen: { note: NOTE } }
        );

        const task = await onlyTask();
        expect(String(task._id)).toBe(String(original._id));
        expect(task).toMatchObject({ status: TaskStatus.new, seenCount: 2 });
    });

    it('leaves the replacement open when its own event is delivered again', async () => {
        const first = { eventId: nextEventId() };
        const second = { eventId: nextEventId() };
        const newer = { ...accountReviewOpening(USER, new Date()), message: 'The newer facts.' };
        await openSystemTask(accountReviewOpening(USER, new Date()), first);
        await openSystemTask(newer, second, { replaceOpen: { note: NOTE } });

        await openSystemTask(newer, second, { replaceOpen: { note: NOTE } });
        await openSystemTask(accountReviewOpening(USER, new Date()), first);

        const tasks = await allTasks();
        expect(tasks.map((task) => task.status)).toEqual([TaskStatus.resolved, TaskStatus.new]);
    });
});
