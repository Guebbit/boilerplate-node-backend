/**
 * @module
 * The due-soon sweep, against a real database: an open task within three days of its deadline,
 * with a longer life than that, is announced once as `task.due_soon`; every other task is left
 * alone, and a task reminded early is still reminded when it goes overdue.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { markDomainEventsWired, onDomainEvent, resetDomainEvents } from '@kernel/events';
import type { DomainEventMap } from '@kernel/events';
import { settleOutboxNudges } from '@kernel/outbox';
import { TaskKind, TaskSource } from '@types';
import { taskService } from '../../service';
import { taskModel } from '../../model';
import { taskRepository } from '../../repository';
import { TASK_DUE_SOON } from '../../events';
import { closeDirectly, createSystemTask, giveLife } from '../factories';

setupTestDb();

/** The `task.due_soon` facts heard so far. */
let heard: DomainEventMap['task.due_soon'][] = [];

beforeEach(() => {
    heard = [];
    resetDomainEvents();
    onDomainEvent(TASK_DUE_SOON, (fact) => {
        heard.push(fact);
    });
    // The outbox relay only delivers where the bus is wired: this suite subscribes by hand.
    markDomainEventsWired();
});

afterEach(() => resetDomainEvents());

/** An open task due `dueInDays` from now that had `lifeDays` to live; returns its id. */
const taskDue = async (dueInDays: number, lifeDays: number) => {
    const task = await createSystemTask();
    await giveLife(String(task._id), dueInDays, lifeDays);
    return String(task._id);
};

describe('remindDueSoon', () => {
    it('announces a task due in 2 days once, with its kind, route set and work screen', async () => {
        const id = await taskDue(2, 10);

        await expect(taskService.remindDueSoon()).resolves.toBe(1);
        await expect(taskService.remindDueSoon()).resolves.toBe(0);
        await settleOutboxNudges();

        expect(heard).toEqual([
            expect.objectContaining({
                taskId: id,
                kind: 'export_failed',
                routeSet: 'UserErasure',
                work: 'users/u1'
            })
        ]);
        const stored = await taskModel.findById(id).exec();
        expect(stored?.dueSoonNotifiedAt).toBeInstanceOf(Date);
    });

    it('leaves a task due in 4 days for a later sweep', async () => {
        const id = await taskDue(4, 10);

        await expect(taskService.remindDueSoon()).resolves.toBe(0);
        await expect(
            taskService.remindDueSoon(new Date(Date.now() + 2 * 24 * 3_600_000))
        ).resolves.toBe(1);
        await settleOutboxNudges();

        expect(heard.map((fact) => fact.taskId)).toEqual([id]);
    });

    it('skips a task that only ever had one day to live', async () => {
        await taskDue(0.5, 1);

        await expect(taskService.remindDueSoon()).resolves.toBe(0);
    });

    it('skips a task closed before the sweep, and stamps nothing on it', async () => {
        const id = await taskDue(2, 10);
        await closeDirectly(id);

        await expect(taskService.remindDueSoon()).resolves.toBe(0);

        const stored = await taskModel.findById(id).exec();
        expect(stored?.dueSoonNotifiedAt).toBeUndefined();
    });

    it('skips a task already past its deadline: that one is overdue, not due soon', async () => {
        await taskDue(-1, 10);

        await expect(taskService.remindDueSoon()).resolves.toBe(0);
    });

    it('still reminds a task that was warned early once it goes overdue', async () => {
        const id = await taskDue(2, 10);
        await taskService.remindDueSoon();

        await giveLife(id, -1, 10);

        await expect(taskService.remindOverdue()).resolves.toBe(1);
    });

    it('never reminds a contact message, however long its life', async () => {
        const task = await taskRepository.create({
            source: TaskSource.system,
            kind: TaskKind.contact,
            routeSet: 'TaskManagement',
            subject: 'A message',
            message: 'Hello'
        });
        await giveLife(String(task._id), 2, 10);

        await expect(taskService.remindDueSoon()).resolves.toBe(0);
    });

    it('never reminds a task whose opener asked for none', async () => {
        const id = await taskDue(2, 10);
        await taskModel.updateOne({ _id: id }, { $set: { noDueSoon: true } }).exec();

        await expect(taskService.remindDueSoon()).resolves.toBe(0);
    });
});
