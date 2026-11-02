/**
 * @module
 * The overdue reminder: an open task past its due date is announced once, as `task.overdue`.
 * The tasks engine owns the sweep because it owns the clock (`dueAt`) and the memory
 * (`overdueNotifiedAt`); who hears of it is `notifications`' business, the same as for the opener.
 *
 * See: docs/modules/tasks.md#the-overdue-reminder
 */

import { DEPLOYMENT_TENANT_ID } from '@kernel/access/tenant';
import { emitDomainEvent } from '@kernel/events';
import { TASK_OVERDUE } from '../events';
import { taskRepository } from '../repository';

/**
 * Remind once about every open task that has passed its due date.
 *
 * Each task is claimed (stamped) by one conditional write BEFORE it is announced, so two
 * overlapping sweeps, or a re-run after a crash, can never announce the same task twice. The
 * price is at-most-once: a crash between the stamp and the event loses that one reminder.
 * A task closed (or spam-marked) before the sweep reaches it is not claimed at all.
 *
 * Tasks are told one after another: a backlog is a handful. A failing listener is logged by
 * `emitDomainEvent` and the sweep moves on; that task is already stamped, so its reminder is lost.
 *
 * @param now - the clock; the sweep's single reading of "overdue"
 * @returns how many tasks were announced
 */
export const remindOverdue = async (now: Date = new Date()): Promise<number> => {
    let announced = 0;

    for (let task = await taskRepository.claimOverdue(now); task; ) {
        await emitDomainEvent(TASK_OVERDUE, {
            tenantId: DEPLOYMENT_TENANT_ID,
            taskId: String(task._id),
            kind: task.kind,
            routeSet: task.routeSet,
            ...(task.category ? { category: task.category } : {})
        });
        announced += 1;
        task = await taskRepository.claimOverdue(now);
    }

    return announced;
};
