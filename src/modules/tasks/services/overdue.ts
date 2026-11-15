/**
 * @module
 * The reminder sweeps: an open task past its due date is announced once as `task.overdue`, and an
 * open task about to fall due once as `task.due_soon`, both through the outbox.
 * The tasks engine owns the sweeps because it owns the clock (`dueAt`) and the memory
 * (`overdueNotifiedAt`, `dueSoonNotifiedAt`); who hears of them is `notifications`' business, the
 * same as for the opener.
 *
 * @see docs/modules/tasks.md#the-overdue-reminder
 */

import type { ClientSession } from 'mongoose';
import { announceInTransaction } from '@kernel/outbox';
import { TASK_DUE_SOON, TASK_OVERDUE, taskFactOf } from '../events';
import type { TaskDocument } from '../model';
import { taskRepository } from '../repository';

/**
 * Claim one task and write its event row, in one transaction.
 *
 * @param claim - the conditional stamp that picks one task
 * @param name - the event the claimed task is announced as
 * @returns whether a task was claimed; `false` means nothing is left
 */
const claimAndAnnounce = (
    claim: (session: ClientSession) => Promise<TaskDocument | null>,
    name: typeof TASK_OVERDUE | typeof TASK_DUE_SOON
): Promise<boolean> =>
    announceInTransaction(claim, (task) => ({
        name,
        payload: taskFactOf(task),
        aggregateId: String(task._id)
    })).then((task) => task !== null);

/**
 * Claim and announce tasks one after another until none is left: a backlog is a handful.
 *
 * @param claim - the conditional stamp that picks one task
 * @param name - the event the claimed tasks are announced as
 * @returns how many tasks were announced
 */
const announceAll = async (
    claim: (session: ClientSession) => Promise<TaskDocument | null>,
    name: typeof TASK_OVERDUE | typeof TASK_DUE_SOON
): Promise<number> => {
    let announced = 0;
    while (await claimAndAnnounce(claim, name)) announced += 1;
    return announced;
};

/**
 * Remind once about every open task that has passed its due date.
 *
 * Each task is claimed (stamped) and its outbox row written in ONE transaction, so two
 * overlapping sweeps can never claim the same task, and a crash loses neither the stamp nor the
 * reminder: both roll back, and the next sweep claims the task again. Delivery is at-least-once;
 * the receiver dedupes on `task-overdue:<id>`. A task closed (or spam-marked) before the sweep
 * reaches it is not claimed at all.
 *
 * @param now - the clock; the sweep's single reading of "overdue"
 * @returns how many tasks were announced
 */
export const remindOverdue = (now: Date = new Date()): Promise<number> =>
    announceAll((session) => taskRepository.claimOverdue(now, session), TASK_OVERDUE);

/**
 * Remind once about every open task due within three days, as `task.due_soon`. Claimed and
 * announced exactly as {@link remindOverdue}; the receiver dedupes on `task-due-soon:<id>`.
 * Which tasks qualify is the repository claim's rule (`claimDueSoon`).
 *
 * @param now - the clock; the sweep's single reading of "soon"
 * @returns how many tasks were announced
 */
export const remindDueSoon = (now: Date = new Date()): Promise<number> =>
    announceAll((session) => taskRepository.claimDueSoon(now, session), TASK_DUE_SOON);
