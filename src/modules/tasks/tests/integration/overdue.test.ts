/**
 * @module
 * The overdue sweep, against a real database: an open task past its due date is announced once
 * as `task.overdue`, stamped so it is never announced again, and a task closed (or not yet
 * due) before the sweep reaches it is left alone.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { onDomainEvent, resetDomainEvents } from '@kernel/events';
import type { DomainEventMap } from '@kernel/events';
import { taskService } from '../../service';
import { taskModel } from '@modules/tasks/model';
import { backdateDue, closeDirectly, createRefundTask } from '../factories';
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
});

afterEach(() => resetDomainEvents());

const HOUR_MS = 3_600_000;

/** An open refund task whose deadline passed `hoursAgo` hours ago (negative: still ahead). */
const dueAgo = async (hoursAgo: number) => {
    const task = await createRefundTask();
    await backdateDue(String(task._id), hoursAgo);
    return String(task._id);
};

describe('remindOverdue', () => {
    it('announces an open task past its due date, with its kind and route set', async () => {
        const id = await dueAgo(2);

        await expect(taskService.remindOverdue()).resolves.toBe(1);

        expect(heard).toEqual([
            expect.objectContaining({
                taskId: id,
                kind: 'manual_refund_owed',
                routeSet: 'PaymentRefunding'
            })
        ]);
    });

    it('stamps the task and never announces it a second time', async () => {
        const id = await dueAgo(2);

        await taskService.remindOverdue();
        await expect(taskService.remindOverdue()).resolves.toBe(0);

        expect(heard).toHaveLength(1);
        const stored = await taskModel.findById(id).exec();
        expect(stored?.overdueNotifiedAt).toBeInstanceOf(Date);
    });

    it('skips a task closed before the sweep, and stamps nothing on it', async () => {
        const id = await dueAgo(2);
        await closeDirectly(id);

        await expect(taskService.remindOverdue()).resolves.toBe(0);

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

        expect(heard.map((fact) => fact.taskId)).toEqual([id]);
    });

    it('leaves a task with no due date alone', async () => {
        await createRefundTask();

        await expect(taskService.remindOverdue()).resolves.toBe(0);
    });

    it('announces a whole backlog in the order it went late', async () => {
        const newer = await dueAgo(1);
        const older = await dueAgo(9);

        await expect(taskService.remindOverdue()).resolves.toBe(2);

        expect(heard.map((fact) => fact.taskId)).toEqual([older, newer]);
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
