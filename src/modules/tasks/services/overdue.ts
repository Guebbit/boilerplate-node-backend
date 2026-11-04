/**
 * @module
 * The overdue reminder: an open task past its due date is announced once, as `task.overdue`, through the outbox.
 * The tasks engine owns the sweep because it owns the clock (`dueAt`) and the memory
 * (`overdueNotifiedAt`); who hears of it is `notifications`' business, the same as for the opener.
 *
 * See: docs/modules/tasks.md#the-overdue-reminder
 */

import { DEPLOYMENT_TENANT_ID } from '@kernel/access/tenant';
import { announceInTransaction } from '@kernel/outbox';
import { TASK_OVERDUE } from '../events';
import { taskRepository } from '../repository';

/**
 * Claim one overdue task and write its `task.overdue` row, in one transaction.
 *
 * @param now - the sweep's clock
 * @returns whether a task was claimed; `false` means nothing is left
 */
const claimAndAnnounce = (now: Date): Promise<boolean> =>
    announceInTransaction(
        (session) => taskRepository.claimOverdue(now, session),
        (task) => ({
            name: TASK_OVERDUE,
            payload: {
                tenantId: DEPLOYMENT_TENANT_ID,
                taskId: String(task._id),
                kind: task.kind,
                routeSet: task.routeSet,
                ...(task.category ? { category: task.category } : {}),
                ...(task.work ? { work: task.work } : {})
            },
            aggregateId: String(task._id)
        })
    ).then((task) => task !== null);

/**
 * Remind once about every open task that has passed its due date.
 *
 * Each task is claimed (stamped) and its outbox row written in ONE transaction, so two
 * overlapping sweeps can never claim the same task, and a crash loses neither the stamp nor the
 * reminder: both roll back, and the next sweep claims the task again. Delivery is at-least-once;
 * the receiver dedupes on `task-overdue:<id>`. A task closed (or spam-marked) before the sweep
 * reaches it is not claimed at all.
 *
 * Tasks are claimed one after another: a backlog is a handful.
 *
 * @param now - the clock; the sweep's single reading of "overdue"
 * @returns how many tasks were announced
 */
export const remindOverdue = async (now: Date = new Date()): Promise<number> => {
    let announced = 0;
    while (await claimAndAnnounce(now)) announced += 1;
    return announced;
};
