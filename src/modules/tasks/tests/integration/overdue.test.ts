/**
 * @module
 * The overdue sweep, against a real database: an open task past its due date is announced once
 * as `task.overdue`, stamped so it is never announced again, and a task closed (or not yet
 * due) before the sweep reaches it is left alone.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { markDomainEventsWired, onDomainEvent, resetDomainEvents } from '@kernel/events';
import type { DomainEventMap } from '@kernel/events';
import { taskService } from '../../services';
import { taskModel } from '@modules/tasks/model';
import { backdateDue, closeDirectly, createSystemTask } from '../factories';
import { outboxEventModel, relayOutbox, settleOutboxNudges } from '@kernel/outbox';
import { TASK_OVERDUE } from '../../events';
import { TaskStatus } from '@types';

setupTestDb();

/** The `task.overdue` facts heard so far. */
let heard: DomainEventMap['task.overdue'][] = [];

beforeEach(() => {
    heard = [];
    resetDomainEvents();
    onDomainEvent(TASK_OVERDUE, (fact) => {
        heard.push(fact);
    });
    // The outbox relay only delivers where the bus is wired: this suite subscribes by hand.
    markDomainEventsWired();
});

afterEach(() => resetDomainEvents());

/** One hour in milliseconds. */
const HOUR_MS = 3_600_000;

/** An open system task whose deadline passed `hoursAgo` hours ago (negative: still ahead). */
const dueAgo = async (hoursAgo: number) => {
    const task = await createSystemTask();
    await backdateDue(String(task._id), hoursAgo);
    return String(task._id);
};

describe('remindOverdue', () => {
    it('announces an open task past its due date, with its kind, route set and work screen', async () => {
        const id = await dueAgo(2);

        await expect(taskService.remindOverdue()).resolves.toBe(1);
        await settleOutboxNudges();

        expect(heard).toEqual([
            expect.objectContaining({
                taskId: id,
                kind: 'export_failed',
                routeSet: 'UserErasure',
                work: 'users/u1'
            })
        ]);
    });

    it('stamps the task and never announces it a second time', async () => {
        const id = await dueAgo(2);

        await taskService.remindOverdue();
        await expect(taskService.remindOverdue()).resolves.toBe(0);
        await settleOutboxNudges();

        expect(heard).toHaveLength(1);
        const stored = await taskModel.findById(id).exec();
        expect(stored?.overdueNotifiedAt).toBeInstanceOf(Date);
    });

    it('skips a task closed before the sweep, and stamps nothing on it', async () => {
        const id = await dueAgo(2);
        await closeDirectly(id);

        await expect(taskService.remindOverdue()).resolves.toBe(0);
        await settleOutboxNudges();

        expect(heard).toEqual([]);
        const stored = await taskModel.findById(id).exec();
        expect(stored?.overdueNotifiedAt).toBeUndefined();
    });

    it('leaves a task that is not due yet for a later sweep', async () => {
        const id = await dueAgo(-5);

        await expect(taskService.remindOverdue()).resolves.toBe(0);
        await expect(taskService.remindOverdue(new Date(Date.now() + 6 * HOUR_MS))).resolves.toBe(
            1
        );
        await settleOutboxNudges();

        expect(heard.map((fact) => fact.taskId)).toEqual([id]);
    });

    it('leaves a task with no due date alone', async () => {
        await createSystemTask();

        await expect(taskService.remindOverdue()).resolves.toBe(0);
    });

    it('announces a whole backlog, claiming the oldest deadline first', async () => {
        const newer = await dueAgo(1);
        const older = await dueAgo(9);

        await expect(taskService.remindOverdue()).resolves.toBe(2);
        await settleOutboxNudges();

        /**
         * Each task is its own aggregate: the relay delivers them in parallel, so only the claim
         * order (the rows' write order) is promised.
         */
        expect(heard.map((fact) => fact.taskId)).toEqual(expect.arrayContaining([older, newer]));
        const rows = await outboxEventModel
            .find({ name: 'task.overdue' })
            .sort({ createdAt: 1, _id: 1 })
            .lean<{ payload: { taskId: string } }[]>()
            .exec();
        expect(rows.map((row) => row.payload.taskId)).toEqual([older, newer]);
    });

    it('redelivers a notice whose handler failed once, on the next relay pass', async () => {
        let attempts = 0;
        onDomainEvent(TASK_OVERDUE, () => {
            attempts += 1;
            if (attempts === 1) throw new Error('listener down');
        });
        await dueAgo(2);

        await taskService.remindOverdue();
        await settleOutboxNudges();
        await expect(
            outboxEventModel.countDocuments({ name: 'task.overdue', status: 'pending' })
        ).resolves.toBe(1);
        await outboxEventModel.updateMany(
            { name: 'task.overdue' },
            { $set: { nextAttemptAt: new Date(0) } }
        );

        await relayOutbox();

        expect(attempts).toBe(2);
        await expect(
            outboxEventModel.countDocuments({ name: 'task.overdue', status: 'published' })
        ).resolves.toBe(1);
    });

    it('does not announce a reopened task again: the deadline and the stamp both stay', async () => {
        const id = await dueAgo(2);
        await taskService.remindOverdue();
        await closeDirectly(id);
        await taskModel.updateOne(
            { _id: id },
            { $set: { status: TaskStatus.new }, $unset: { resolution: 1 } }
        );

        await expect(taskService.remindOverdue()).resolves.toBe(0);
    });
});
